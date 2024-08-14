import { TokenInfo } from "@uniswap/token-lists";
import { TradeLpPriceFeed, LiquidityPoolSingle } from "./liquidityPool";
import { TradeAdapter, LpConfigUpdateResponse, OpenInterest } from ".";
import { AMOUNT_DECIMALS, TradeReader } from "./reader";
import { isSameAddress, pairFromString } from "../../utils/general";
import { SubscriptionId } from "../../types/general";
import {
  GetTradePriceArgs,
  TradeLiquidityPool,
  MarketPrice,
  TradePairId,
  SubscribeMarketPriceArgs,
  TradePair,
} from "./index";
import { BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { retryPromise } from "../../utils/sdk";

// This interface is private as the protocol does not need to be abstracted.
interface ITradeProtocol {
  getLiquidityPools(): TradeLiquidityPool[];
  getLiquidityPool(id: string): TradeLiquidityPool;
  getTradePair(pairId: TradePairId): TradePair;
  getPrice(pairId: TradePairId, size?: BigNumber): MarketPrice;
  tryGetPrice(pairId: TradePairId, size?: BigNumber): MarketPrice | undefined;
  getTradePrice(lpId: string, args: GetTradePriceArgs): BigNumber;
  getTradePairs(): TradePair[];
  getOpenInterest(pairId: TradePairId): OpenInterest;
  subscribeToMarketPrice(
    args: SubscribeMarketPriceArgs,
    lpId: string
  ): SubscriptionId;
  unsubscribeFromMarketPrice(id: SubscriptionId, lpId: string): void;
}

export class TradeProtocol implements ITradeProtocol {
  private readonly liquidityPools: TradeLiquidityPool[];

  constructor(liquidityPools: TradeLiquidityPool[]) {
    this.liquidityPools = liquidityPools;
  }

  static async create(
    reader: TradeReader,
    adapter: TradeAdapter,
    usdToken: TokenInfo,
    priceFeed: TradeLpPriceFeed
  ): Promise<TradeProtocol> {
    await adapter.waitForConnect();
    const liquidityPools = await retryPromise(
      reader.getLiquidityPools.bind(reader)
    );
    const pairConfig = await adapter.getLpConfig();
    const tradePairs = getTradePairs(pairConfig);
    const pools: TradeLiquidityPool[] = liquidityPools
      .filter((pool) => isSameAddress(usdToken.address, pool.underlyingToken))
      .map((pool) => {
        return new LiquidityPoolSingle(
          pool.id,
          tradePairs[pool.id] || [],
          usdToken,
          adapter,
          priceFeed
        );
      });
    return new TradeProtocol(pools);
  }

  getLiquidityPools(): TradeLiquidityPool[] {
    return this.liquidityPools;
  }

  getLiquidityPoolsOfUnderlyingToken(
    tokenAddress: string
  ): TradeLiquidityPool[] {
    return this.liquidityPools.filter(
      (pool) =>
        pool.getUnderlyingToken().address.toLowerCase() ===
        tokenAddress.toLowerCase()
    );
  }

  getLiquidityPool(id: string): TradeLiquidityPool {
    const liquidityPool = this.liquidityPools.find((pool) => pool.id === id);
    if (!liquidityPool) {
      throw new Error(`Liquidity pool ${id} not found`);
    }
    return liquidityPool;
  }

  getTradePair(pairId: TradePairId): TradePair {
    return this.getLiquidityPool(pairId.lpId).getTradePair(pairId.pair);
  }

  getTradePairs(): TradePair[] {
    return this.liquidityPools.flatMap((pool) => pool.getTradePairs());
  }

  subscribeToMarketPrice(
    args: SubscribeMarketPriceArgs,
    lpId: string
  ): SubscriptionId {
    return this.getLiquidityPool(lpId).subscribeToMarketPrice(args);
  }

  unsubscribeFromMarketPrice(id: SubscriptionId, lpId: string): void {
    this.getLiquidityPool(lpId).unsubscribeFromMarketPrice(id);
  }

  getPrice(pairId: TradePairId, size?: BigNumber): MarketPrice {
    return this.getLiquidityPool(pairId.lpId).getPrice(pairId.pair, size);
  }

  tryGetPrice(pairId: TradePairId, size?: BigNumber): MarketPrice | undefined {
    try {
      return this.getPrice(pairId, size);
    } catch (e) {
      return undefined;
    }
  }

  getTradePrice(lpId: string, args: GetTradePriceArgs): BigNumber {
    return this.getLiquidityPool(lpId).getTradePrice(args);
  }

  getOpenInterest(pairId: TradePairId): OpenInterest {
    return this.getLiquidityPool(pairId.lpId).getOpenInterest({
      pair: pairId.pair,
    });
  }
}

const getTradePairs = (
  lpConfig: LpConfigUpdateResponse
): Record<string, TradePair[]> => {
  if (lpConfig.error) {
    throw new Error(lpConfig.error);
  }
  const pairs: Record<string, TradePair[]> = {};
  for (const pair of lpConfig.result!.content.lpConfigUpdate) {
    if (!pairs[pair.lpId]) {
      pairs[pair.lpId] = [];
    }
    pairs[pair.lpId].push(
      new TradePair(
        new TradePairId(pairFromString(pair.pair), pair.lpId),
        parseUnits(pair.config.initialMarginFraction, AMOUNT_DECIMALS),
        parseUnits(pair.config.maintenanceMarginFraction, AMOUNT_DECIMALS),
        parseUnits(
          pair.config.incrementalInitialMarginFraction,
          AMOUNT_DECIMALS
        ),
        parseUnits(pair.config.baselinePositionSize, AMOUNT_DECIMALS),
        parseUnits(pair.config.incrementalPositionSize, AMOUNT_DECIMALS),
        parseUnits(pair.config.marginFeeFraction, AMOUNT_DECIMALS),
        parseUnits(pair.config.symmetricalSpreadFraction, AMOUNT_DECIMALS),
        pair.config.isActive,
        pair.config.isReduceOnly,
        pair.config.maxOpenInterestDiff === null
          ? null
          : parseUnits(pair.config.maxOpenInterestDiff, AMOUNT_DECIMALS),
        pair.config.maxOpenInterestLong === null
          ? null
          : parseUnits(pair.config.maxOpenInterestLong, AMOUNT_DECIMALS),
        pair.config.maxOpenInterestShort === null
          ? null
          : parseUnits(pair.config.maxOpenInterestShort, AMOUNT_DECIMALS),
        parseUnits(pair.config.borrowFeeFactor, AMOUNT_DECIMALS),
        parseUnits(pair.config.fundingFactor, AMOUNT_DECIMALS),
        parseUnits(pair.config.fundingExponent, AMOUNT_DECIMALS),
        { pair: pairFromString(pair.pair) },
        pair.config.usePriceImpact,
        pair.config.priceImpactFraction
          ? parseUnits(pair.config.priceImpactFraction, AMOUNT_DECIMALS)
          : null,
        pair.config.skewScale
          ? parseUnits(pair.config.skewScale, AMOUNT_DECIMALS)
          : null
      )
    );
  }
  return pairs;
};
