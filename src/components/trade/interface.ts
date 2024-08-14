import { BigNumber, Signer, constants } from "ethers";
import { Pair } from "../../types/trade";
import { Subscription, SubscriptionId } from "../../types/general";
import { TokenInfo } from "@uniswap/token-lists";
import { isSamePair, pairFromString, pairToString } from "../../utils/general";
import {
  PRICE_DECIMALS,
  AMOUNT_DECIMALS,
  PRICE_UNIT,
  AMOUNT_UNIT,
  formatAmount,
  parseAmount,
} from "./reader";
import { TradeAccount } from "./account";
import { parseUnits } from "ethers/lib/utils";
import { LpPairTradeabilityListener } from "./adapter";
import { MarketSide, PairState } from "./pairState";
import { z } from "zod";
import { CURRENT_INSTRUMENT_SCHEMA_VERSION } from "../../config";

/*
  This file includes interfaces for a trading platform.
  These should be implemented in the back-end abstraction in Trade/platforms.
  e.g. hLP trade, synths, etc.
*/

export type LpId = string;

export type TradePairIdState = {
  pair: Pair;
  lpId: LpId;
};

/// A trade pair ID, which factors in a specific trade liquidity pool.
export class TradePairId implements TradePairIdState {
  constructor(public readonly pair: Pair, public readonly lpId: string) {}

  public eq(other: TradePairId): boolean {
    return isSamePair(this.pair, other.pair) && this.lpId === other.lpId;
  }

  public toString(): string {
    return `${pairToString(this.pair)}_${this.lpId}`;
  }

  public static fromString(s: string): TradePairId {
    const [pair, lpId] = s.split("_");
    return new TradePairId(pairFromString(pair), lpId);
  }

  public static fromState(state: TradePairIdState): TradePairId {
    return new TradePairId(state.pair, state.lpId);
  }
}

export type H2SOPairData = {
  pair: Pair;
};

/**
 * This is analogous to the `PairConfig` type in the
 * server.
 */
export class TradePair {
  public readonly pair: Pair;
  private static readonly divisor = parseUnits(
    "1",
    AMOUNT_DECIMALS + PRICE_DECIMALS
  );

  constructor(
    public id: TradePairId,
    public initialMarginFraction: BigNumber,
    public maintenanceMarginFraction: BigNumber,
    public incrementalInitialMarginFraction: BigNumber,
    public baselinePositionSize: BigNumber,
    public incrementalPositionSize: BigNumber,
    public marginFeeFraction: BigNumber,
    public spreadFraction: BigNumber,
    public isActive: boolean,
    public isReduceOnly: boolean,
    public maxOpenInterestDiff: BigNumber | null,
    public maxOpenInterestLong: BigNumber | null,
    public maxOpenInterestShort: BigNumber | null,
    public borrowFeeFactor: BigNumber,
    public fundingFactor: BigNumber,
    public fundingExponent: BigNumber,
    public h2soPairData: H2SOPairData,
    public usePriceImpact: boolean,
    public priceImpactFraction: BigNumber | null,
    public skewScale: BigNumber | null
  ) {
    this.pair = id.pair;
  }

  private getLargerSideFundingRate(openInterest: OpenInterest): BigNumber {
    const totalOpenInterest = openInterest.total();
    if (totalOpenInterest.isZero()) {
      return constants.Zero;
    }
    const imbalance = openInterest.long.sub(openInterest.short).abs();
    const imbalanceExp = Math.pow(
      +formatAmount(imbalance),
      +formatAmount(this.fundingExponent)
    );
    return this.fundingFactor
      .mul(parseAmount(imbalanceExp.toString()))
      .div(totalOpenInterest);
  }

  public shouldUsePriceImpact(): boolean {
    return !!(
      this.usePriceImpact &&
      this.priceImpactFraction &&
      this.skewScale
    );
  }

  /**
   * @returns the funding rates with `AMOUNT_DECIMALS` precision.
   */
  public getFundingRate(openInterest: OpenInterest): MarketSide<BigNumber> {
    const largerSideRate = this.getLargerSideFundingRate(openInterest);
    return {
      long: openInterest.long.gt(openInterest.short)
        ? largerSideRate
        : largerSideRate.mul("-1"),
      short: openInterest.short.gt(openInterest.long)
        ? largerSideRate
        : largerSideRate.mul("-1"),
    };
  }

  public getLongBorrowRate(openInterest: OpenInterest): BigNumber {
    if (this.maxOpenInterestLong === null) return constants.Zero;
    return openInterest.long
      .mul(this.borrowFeeFactor)
      .div(this.maxOpenInterestLong);
  }

  public getShortBorrowRate(openInterest: OpenInterest): BigNumber {
    if (this.maxOpenInterestShort === null) return constants.Zero;
    return openInterest.short
      .mul(this.borrowFeeFactor)
      .div(this.maxOpenInterestShort);
  }

  /**
   * @returns the borrow rates with `AMOUNT_DECIMALS` precision.
   */
  public getBorrowRate(openInterest: OpenInterest): MarketSide<BigNumber> {
    return {
      long: this.getLongBorrowRate(openInterest),
      short: this.getShortBorrowRate(openInterest),
    };
  }

  public getInitialMargin(size: BigNumber, price: BigNumber): BigNumber {
    size = size.abs();
    if (
      size.lt(this.baselinePositionSize) ||
      this.baselinePositionSize.eq("0")
    ) {
      return size
        .mul(price)
        .mul(this.initialMarginFraction)
        .div(TradePair.divisor);
    }
    const increments = size
      .sub(this.baselinePositionSize)
      .div(this.incrementalPositionSize);
    const fraction = this.initialMarginFraction.add(
      increments.mul(this.incrementalInitialMarginFraction)
    );
    return size.mul(price).mul(fraction).div(TradePair.divisor);
  }

  public getMaintenanceMargin(size: BigNumber, price: BigNumber): BigNumber {
    return size
      .mul(price)
      .mul(this.maintenanceMarginFraction)
      .div(TradePair.divisor)
      .abs();
  }

  public getMarginFee(size: BigNumber, price: BigNumber): BigNumber {
    return size
      .mul(price)
      .mul(this.marginFeeFraction)
      .div(TradePair.divisor)
      .abs();
  }
}

export type TradeArgs = {
  pairId: TradePairId;
  size: TradeSize;
  signer: Signer;
};

export type SimulateTradeArgs = {
  pairId: TradePairId;
  size: BigNumber;
  gasFee: BigNumber;
};

export type LpTradeArgs = TradeArgs & {
  // This is used only for updating open interest.
  oldSize: BigNumber;
  accountId: number;
};

export type SetSystemParamArgs = {
  signer: Signer;
  adminTradeAccountId: number;
  paramId: string;
  paramValue: BigNumber;
};

export type ClearSystemParamArgs = {
  signer: Signer;
  adminTradeAccountId: number;
  paramId: string;
};

export type OrderArgs = {
  pairId: TradePairId;
  size: BigNumber;
  limitPrice: BigNumber;
};

// The bid price is almost always lower than the ask price.
// Typically when the bid and ask prices meet, a trade occurs.
export class MarketPrice {
  /// The current asset price, excluding any spread.
  public index: BigNumber;
  /// Skew adjusted price (market price) for price impacted assets or index price.
  private skew?: BigNumber;
  /// The best price (for the seller) the asset can currently be sold at.
  public bestBid: BigNumber;
  /// The best price (for the buyer) the asset can be currently purchased at.
  public bestAsk: BigNumber;

  constructor(
    index: BigNumber,
    bestBid: BigNumber,
    bestAsk: BigNumber,
    skew?: BigNumber
  ) {
    this.index = index;
    this.bestBid = bestBid;
    this.bestAsk = bestAsk;
    this.skew = skew;
  }

  /**
   * Calculates the inverse of this market price.
   * @note This does not modify the current object.
   * @returns The inverse of this market price.
   */
  public inverse(): MarketPrice {
    return new MarketPrice(
      parseUnits("1", PRICE_DECIMALS * 2).div(this.index),
      parseUnits("1", PRICE_DECIMALS * 2).div(this.bestAsk),
      parseUnits("1", PRICE_DECIMALS * 2).div(this.bestBid)
    );
  }

  public get marketPrice() {
    return this.skew ?? this.index;
  }

  public static fromIndex(
    index: BigNumber,
    spread = constants.Zero
  ): MarketPrice {
    return new MarketPrice(
      index,
      index.mul(AMOUNT_UNIT.sub(spread)).div(AMOUNT_UNIT),
      index.mul(AMOUNT_UNIT.add(spread)).div(AMOUNT_UNIT)
    );
  }

  public static zero(): MarketPrice {
    return new MarketPrice(
      BigNumber.from("0"),
      BigNumber.from("0"),
      BigNumber.from("0")
    );
  }

  public getTradePrice(isBuying: boolean): BigNumber {
    return isBuying ? this.bestAsk : this.bestBid;
  }

  public getTradePriceFromTradeSize(tradeSize: BigNumber): BigNumber {
    return this.getTradePrice(tradeSize.gt(0));
  }
}

export type MarketPriceSubscription = Subscription<MarketPriceCallback, Pair>;

export type SubscribeMarketPriceArgs = {
  callback: MarketPriceCallback;
  pair: Pair;
};

export type MarketPriceCallback = (
  pair: Readonly<Pair>,
  price: Readonly<MarketPrice>
) => any;

/**
 * Available liquidity, in the base token, for this trade pair.
 * long is returned as an amount of the index token
 * short is returned as a usd amount, to 30 decimals
 */
export type AvailableLiquidity = {
  long: BigNumber;
  short: BigNumber;
};

export type GetAvailableLiquidityArgs = {
  pair: Pair;
  forceFetch?: boolean;
};

export type GetAvailabilityArgs = {
  pair: Pair;
};

export type Availability =
  | { isAvailable: true; reason?: undefined }
  | { isAvailable: false; reason?: string };

export type GetHistoryArgs = Partial<TradePairId> & {
  skip?: number;
  limit?: number;
  pairId?: TradePairId;
  startTimestamp?: number;
};

export class TradeAction {
  constructor(
    public readonly pairId: TradePairId,
    public readonly size: BigNumber,
    public readonly price: BigNumber,
    public readonly timestamp: number,
    public readonly realisedEquity: BigNumber,
    public readonly marginFee: BigNumber,
    public readonly type: "trade" | "liquidation",
    public readonly txHash: string,
    public readonly didOpenPosition: boolean,
    public readonly didClosePosition: boolean
  ) {}

  public eq(other: TradeAction): boolean {
    return (
      this.pairId.eq(other.pairId) &&
      this.size.eq(other.size) &&
      this.price.eq(other.price) &&
      this.timestamp === other.timestamp &&
      this.realisedEquity.eq(other.realisedEquity) &&
      this.marginFee.eq(other.marginFee) &&
      this.type === other.type &&
      this.txHash.toLowerCase() === other.txHash.toLowerCase() &&
      this.didOpenPosition === other.didOpenPosition &&
      this.didClosePosition === other.didClosePosition
    );
  }

  public isLiquidation(): boolean {
    return this.type === "liquidation";
  }
}

/**
 * A USD deposit or withdrawal.
 * @note amount will be negative for withdrawals.
 */
export type DepositOrWithdrawal = {
  amount: BigNumber;
  timestamp: number;
  txHash: string;
};

export type PeriodicFee = {
  type: "borrow" | "funding";
  pairId: TradePairId;
  amount: BigNumber;
  timestamp: number;
};

export type ActiveOrder = TradePairId & {
  size: BigNumber;
  limitPrice: BigNumber;
};

export type TradeEffect = {
  fillPrice: BigNumber;
  marginFee: BigNumber;
};

export type TradeSimulation = {
  effect: TradeEffect;
  nextAccount: TradeAccount;
  spreadFee: BigNumber;
  failureReason?: string;
};

export type GetTradePriceArgs = {
  pair: Pair;
  size: BigNumber;
};

export class OpenInterest {
  constructor(public long: BigNumber, public short: BigNumber) {}

  public total() {
    return this.long.add(this.short);
  }

  public static zero() {
    return new OpenInterest(constants.Zero, constants.Zero);
  }
}

/**
 * An interface for liquidity pools within the synths platform.
 */
export interface TradeLiquidityPool {
  /// String identifying this trade platform.
  id: string;
  onUpdate?: () => void;
  trade(args: LpTradeArgs): Promise<TradeEffect>;
  order(args: OrderArgs): Promise<void>;
  /// Returns the LP token price with 18 decimals.
  getLpTokenPrice(): Promise<BigNumber>;
  /// Returns the latest market price available. Throws if not available.
  getPrice(pair: Pair, size?: BigNumber): Readonly<MarketPrice>;
  getTradePrice(args: GetTradePriceArgs): BigNumber;
  subscribeToMarketPrice(args: SubscribeMarketPriceArgs): SubscriptionId;
  unsubscribeFromMarketPrice(id: SubscriptionId): void;
  getTradePairs(): TradePair[];
  getUnderlyingToken(): TokenInfo;
  /// Gets a trade pair by pair.
  getTradePair(pair: Pair): TradePair;
  getPairState(pair: Pair): PairState;
  getAvailableLiquidity(
    args: GetAvailableLiquidityArgs
  ): Promise<AvailableLiquidity>;
  /// Returns whether this pair can be traded.
  getPairAvailability(args: GetAvailabilityArgs): Availability;
  getOpenInterest(args: { pair: Pair }): OpenInterest;
  listenToLpPairTradeability(listener: LpPairTradeabilityListener): void;
}

export type GetMarginArgs = {
  size: BigNumber;
};

export type TradeSizeType = "Lpc" | "Lot";

export class TradeSize {
  public readonly amount: BigNumber;
  public readonly type: TradeSizeType;

  private constructor(amount: BigNumber, type: TradeSizeType) {
    this.amount = amount;
    this.type = type;
  }

  public static fromLot(amount: BigNumber): TradeSize {
    return new TradeSize(amount, "Lot");
  }

  public static fromLpc(amount: BigNumber): TradeSize {
    return new TradeSize(amount, "Lpc");
  }

  /// Returns this trade size as lots.
  public lots(price: BigNumber): BigNumber {
    if (this.type == "Lot") {
      return this.amount;
    }
    return this.amount.mul(PRICE_UNIT).div(price);
  }

  /// Returns this trade size as LPC.
  public lpc(price: BigNumber): BigNumber {
    if (this.type == "Lpc") {
      return this.amount;
    }
    return this.amount.mul(price).div(PRICE_UNIT);
  }

  public serialize(): object {
    return {
      [this.type]: formatAmount(this.amount),
    };
  }
}

export const marketTypes = ["crypto", "forex", "commodity", "index"] as const;
export const InstrumentSchema = z.object({
  // Version number of the schema.
  version: z
    .number()
    .int()
    .gte(CURRENT_INSTRUMENT_SCHEMA_VERSION)
    .lt(CURRENT_INSTRUMENT_SCHEMA_VERSION + 1),
  // The instrument pair in the format of base/quote symbols.
  pair: z.string(),
  // May be used to indicate that the instrument is a default for a new user.
  isDefaultVisible: z.optional(z.boolean()).default(false),
  // Sequence for ordering.
  displayRank: z.optional(z.number()),
  // Description in markets and chart symbol info, e.g. CBOE Volatility Index.
  // Should be set to unitName if not supplied.
  description: z.optional(z.string()),
  // Unit name of a single lot of an instrument, e.g. ethereum, barrel of oil, euro, ounce of gold.
  unitName: z.string(),
  // Abbreviated lot unit for use when real-estate is limited.
  // E.g. "australian dollar" would be abbreviated to "au dollar".
  // Should be defaulted to unitName if not supplied.
  unitNameShort: z.optional(z.string()),
  // Basic unit of lots - typically 1 unit of unitName.
  // It could be 1000 if the unitName of a commodity was in grams so that the default lot would be priced at 1kg lots.
  defaultLotSize: z.optional(z.number()).default(1),
  // Market category/type.
  // Subset of TV SymbolType.
  marketType: z.enum(marketTypes),
  hideQuoteSymbolLogo: z.optional(z.boolean()).default(false),
  // Whether to hide the quote symbol, i.e. show XYZ instead of XYZ/USD
  hideQuoteSymbol: z.optional(z.boolean()).default(false),
  displayDecimals: z.optional(z.number()),
  // Should be used to determine whether add extra decimal place
  // when showing prices that are current/changing (as a superscript for example)
  // and as an additional decimal place in charts.
  shouldUseExtendedDecimals: z.optional(z.boolean()),
  // Symbol to use for the chart API. Should default to the pair if not set.
  chartSymbol: z.optional(z.string()),
});
export type InstrumentSchema = z.infer<typeof InstrumentSchema>;
export type Instrument = InstrumentSchema & {
  getDisplayDecimals: (
    price: BigNumber,
    useExtendedDecimals?: boolean
  ) => number;
  getDescription: () => string;
  getUnitName: (useShortUnitName?: boolean) => string;
  getChartSymbol: () => string;
};
