import { TokenInfo } from "@uniswap/token-lists";
import { BigNumber, ethers } from "ethers";
import {
  isSamePair,
  pairFromString,
  pairToString,
  transformDecimals,
} from "../../utils/general";
import { SubscriptionId } from "../../types/general";
import {
  Availability,
  AvailableLiquidity,
  GetAvailabilityArgs,
  GetAvailableLiquidityArgs,
  GetTradePriceArgs,
  TradeLiquidityPool,
  LpTradeArgs,
  MarketPrice,
  OrderArgs,
  SubscribeMarketPriceArgs,
  TradeEffect,
  TradePair,
  LpId,
  TradeAdapter,
  OpenInterest,
  LpPairTradeabilityListener,
  AMOUNT_DECIMALS,
  PRICE_DECIMALS,
  SerializedPairState,
  LpPublication,
  LpPairPublication,
} from "./index";
import { parseAmount, parsePrice, PRICE_UNIT } from "./reader";
import { Pair, PairStringified } from "../../types/trade";
import config from "../../config";
import {
  calculateMarketPrice,
  calculatePriceImpact,
} from "./utils/priceImpact";
import { PairState } from "./pairState";
import { PriceFeed } from "../h2so/feed";

export interface TradeLpPriceFeed {
  getLatestPrice(pair: Pair): BigNumber;
  subscribe(pair: Pair, callback: () => void): SubscriptionId;
  unsubscribe(id: SubscriptionId): void;
}

export class TradeLpPriceFeedH2so implements TradeLpPriceFeed {
  private feed: PriceFeed;

  public constructor(feed: PriceFeed) {
    this.feed = feed;
  }

  public getLatestPrice(pair: Pair): BigNumber {
    return this.feed.getLatestPrice(pair);
  }

  public subscribe(pair: Pair, callback: () => void): SubscriptionId {
    return this.feed.subscribe([pair], callback);
  }

  public unsubscribe(id: SubscriptionId): void {
    this.feed.unsubscribe(id);
  }
}

/// Implementation of a single tradeable liquidity pool.
export class LiquidityPoolSingle implements TradeLiquidityPool {
  public id: LpId;
  public onUpdate?: () => void;
  private readonly tradePairs: TradePair[];
  private readonly underlyingToken: TokenInfo;
  private adapter: TradeAdapter;
  private priceFeed: TradeLpPriceFeed;
  private pairTradeability: Record<PairStringified, boolean | undefined> = {};
  private pairTradeabilityListeners: Array<LpPairTradeabilityListener> = [];
  private pairStates: Record<PairStringified, PairState | undefined> = {};

  constructor(
    id: LpId,
    tradePairs: TradePair[],
    underlyingToken: TokenInfo,
    adapter: TradeAdapter,
    priceFeed: TradeLpPriceFeed
  ) {
    this.id = id;
    this.tradePairs = tradePairs;
    this.underlyingToken = underlyingToken;
    this.adapter = adapter;
    this.priceFeed = priceFeed;
    // Subscribe the price feed to active trade pairs.
    tradePairs
      .filter((p) => p.isActive)
      .map((p) => p.id.pair)
      .forEach((pair) => priceFeed.subscribe(pair, () => {}));
    // Subscribe to the LP in the server.
    adapter.subscribeToLp(id, this.handleLpPublication.bind(this));
  }

  // Callback triggered whenever the server publishes an LP update.
  private handleLpPublication(content: LpPublication, topic: string) {
    switch (topic) {
      case "lpPairTradeability":
        // The "any" cast is for backward compatibility.
        // This can be removed any time after March 2024.
        const lpPair = content.lpPair ?? (content as any).lp_pair;
        const lpId = lpPair.lpId;
        const pairStringified = lpPair.pair;
        const isTradeable = (content as LpPairPublication<boolean>).content;
        const wasTradeable = this.pairTradeability[pairStringified];
        if (wasTradeable == isTradeable) {
          // No update.
          break;
        }
        this.pairTradeability[pairStringified] = isTradeable;
        const pair = pairFromString(pairStringified);
        this.pairTradeabilityListeners.forEach((listener) => {
          listener(lpId, pair, isTradeable);
        });
        break;
      case "lpPairState":
        const tradePair = this.tradePairs.find((p) =>
          isSamePair(p.pair, pairFromString(content.lpPair.pair))
        );
        if (!tradePair) {
          if (config.sdk.printLogs) {
            console.warn(
              `trade pair ${content.lpPair.pair} not found in publication`
            );
          }
          return;
        }
        this.pairStates[content.lpPair.pair] = PairState.fromSerialized(
          content as SerializedPairState,
          tradePair
        );
        break;
      default:
        if (config.sdk.printLogs) {
          console.warn(`unexpected topic: "${topic}"`);
        }
        break;
    }
    if (topic !== "lpPairTradeability") {
      return;
    }
  }

  public async trade(args: LpTradeArgs): Promise<TradeEffect> {
    const address = await args.signer.getAddress();
    const message = await this.adapter.getTradeMessage(address, args.accountId);
    const signature = await args.signer.signMessage(message);
    const response = await this.adapter.trade(
      args.accountId,
      args.pairId.lpId,
      args.size,
      args.pairId.pair,
      address,
      signature
    );
    if (response.error) {
      throw new Error(response.error);
    }
    const trade = response.result!.content.trade;
    const fillPrice = parsePrice(trade.price);
    const sizeLots = args.size.lots(fillPrice);
    this.adjustOpenInterestForTrade(
      args.pairId.pair,
      args.oldSize,
      args.oldSize.add(sizeLots)
    );
    this.onUpdate?.();
    return {
      fillPrice,
      marginFee: parseAmount(trade.marginFee),
    };
  }

  public getPrice(pair: Pair, size?: BigNumber): MarketPrice {
    const indexPrice = this.priceFeed.getLatestPrice(pair);
    const tradePair = this.getTradePair(pair);

    if (tradePair.shouldUsePriceImpact()) {
      const oneLpc = transformDecimals(
        PRICE_UNIT.mul(PRICE_UNIT).div(indexPrice),
        PRICE_DECIMALS,
        AMOUNT_DECIMALS
      );
      const presumedOrderSize = size && !size.isZero() ? size.abs() : oneLpc;
      const openInterest = this.getOpenInterest({ pair });
      const spreadAdjustedPriceBid = calculatePriceImpact(
        openInterest.long,
        openInterest.short,
        indexPrice,
        tradePair.priceImpactFraction!,
        tradePair.skewScale!,
        presumedOrderSize.mul(-1)
      );
      const spreadAdjustedPriceAsk = calculatePriceImpact(
        openInterest.long,
        openInterest.short,
        indexPrice,
        tradePair.priceImpactFraction!,
        tradePair.skewScale!,
        presumedOrderSize
      );

      return new MarketPrice(
        indexPrice,
        spreadAdjustedPriceBid,
        spreadAdjustedPriceAsk,
        calculateMarketPrice(
          openInterest.long,
          openInterest.short,
          indexPrice,
          tradePair.skewScale!
        )
      );
    }

    return MarketPrice.fromIndex(indexPrice, tradePair.spreadFraction);
  }

  public getTradePrice(args: GetTradePriceArgs): BigNumber {
    const price = this.getPrice(args.pair, args.size);
    if (args.size.eq("0")) {
      return price.index;
    }
    return args.size.gt("0") ? price.bestAsk : price.bestBid;
  }

  public getOpenInterest(args: { pair: Pair }): OpenInterest {
    return this.tryGetPairState(args.pair)?.openInterest ?? OpenInterest.zero();
  }

  public getPairState(pair: Pair): PairState {
    const pairState = this.tryGetPairState(pair);
    if (!pairState) {
      if (config.sdk.printLogs) {
        console.error(`PairState not found for ${pairToString(pair)}`);
      }
      const tradePair = this.getTradePair(pair);
      return PairState.zero(tradePair);
    }
    return pairState;
  }

  public tryGetPairState(pair: Pair): PairState | undefined {
    return this.pairStates[pairToString(pair)];
  }

  private adjustOpenInterestForTrade(
    pair: Pair,
    oldSize: BigNumber,
    nextSize: BigNumber
  ) {
    const pairState = this.pairStates[pairToString(pair)];
    if (!pairState) {
      return;
    }
    let { long: totalLong, short: totalShort } = this.getOpenInterest({ pair });
    const zero = ethers.constants.Zero;
    // Case 1: long -> long
    if (oldSize.gte(zero) && nextSize.gte(zero)) {
      totalLong = totalLong.add(nextSize.sub(oldSize));
    }
    // Case 2: short -> short
    else if (oldSize.lte(zero) && nextSize.lte(zero)) {
      totalShort = totalShort.sub(nextSize.sub(oldSize));
    }
    // Case 3: long -> short
    else if (oldSize.gte(zero) && nextSize.lte(zero)) {
      totalLong = totalLong.sub(oldSize);
      totalShort = totalShort.sub(nextSize);
    }
    // Case 4: short -> long
    else if (oldSize.lte(zero) && nextSize.gte(zero)) {
      totalShort = totalShort.add(oldSize);
      totalLong = totalLong.add(nextSize);
    }
    pairState.openInterest = new OpenInterest(totalLong, totalShort);
  }

  public subscribeToMarketPrice(args: SubscribeMarketPriceArgs): number {
    const tradePair = this.getTradePair(args.pair);
    const callback = () => {
      // Can just get the price from the feed, since it's already been updated.
      args.callback(args.pair, this.getPrice(args.pair));
    };
    return this.priceFeed.subscribe(tradePair.h2soPairData.pair, callback);
  }

  public unsubscribeFromMarketPrice(id: number): void {
    this.priceFeed.unsubscribe(id);
  }

  public getTradePairs(): TradePair[] {
    return this.tradePairs;
  }

  public getUnderlyingToken(): TokenInfo {
    return this.underlyingToken;
  }

  public getTradePair(pair: Pair): TradePair {
    const tradePair = this.tradePairs.find((p) => isSamePair(p.id.pair, pair));
    if (!tradePair) {
      throw new Error(`Trade pair ${pairToString(pair)} not found`);
    }
    return tradePair;
  }

  public shouldUsePriceImpact(pair: Pair): boolean {
    const tradePair = this.getTradePair(pair);
    return tradePair.shouldUsePriceImpact();
  }

  public order(_: OrderArgs): Promise<void> {
    throw new Error("Method not implemented.");
  }

  public getAvailableLiquidity(
    _: GetAvailableLiquidityArgs
  ): Promise<AvailableLiquidity> {
    throw new Error("Method not implemented.");
  }

  public getPairAvailability({ pair }: GetAvailabilityArgs): Availability {
    const tradePair = this.getTradePair(pair);
    if (!tradePair.isActive) {
      return {
        isAvailable: false,
        reason: "market inactive",
      };
    }
    const isAvailable = !!this.pairTradeability[pairToString(pair)];
    if (!isAvailable) {
      return {
        isAvailable,
        reason: "unavailable",
      };
    }
    return { isAvailable: true };
  }

  public getLpTokenPrice(): Promise<BigNumber> {
    throw new Error("Method not implemented.");
  }

  public listenToLpPairTradeability(listener: LpPairTradeabilityListener) {
    this.pairTradeabilityListeners.push(listener);
  }
}
