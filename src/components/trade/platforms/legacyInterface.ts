import {
  BigNumber,
  ContractTransaction,
  ethers,
  PopulatedTransaction,
  Signer,
} from "ethers";
import { Provider } from "@ethersproject/providers";
import { Pair } from "../../../types/trade";
import { Subscription, SubscriptionId } from "../../../types/general";
import { TokenInfo } from "@uniswap/token-lists";

/*
  This file includes interfaces for a trading platform.
  These should be implemented in the back-end abstraction in Trade/platforms.
  e.g. hLP trade, synths, etc.
*/

export const PRICE_DECIMALS = 30;
export const PRICE_UNIT = ethers.utils.parseUnits("1", PRICE_DECIMALS);

/// Includes all properties required for defining an accounts's position.
export type PositionId = {
  pair: Pair;
  isLong: boolean;
  /// Address of the collateral token used for the position.
  collateralAddress: string;
};

export type PositionInternal<T> = PositionId & {
  /// The position size, in USD.
  size: BigNumber;
  /// The collateral amount, in USD.
  collateral: BigNumber;
  averagePrice: BigNumber;
  hasRealisedProfit: boolean;
  realisedPnL: BigNumber;
  lastIncreasedTime: BigNumber;
  reserveAmount: BigNumber;
  delta: BigNumber;
  hasProfit: boolean;
  /// The position leverage, including any gain/loss.
  leverage: BigNumber;
  /// Funding rate in parts per million (6 decimals of precision).
  fundingRatePpm: BigNumber;
  // The current funding fee for the position.
  fundingFee: BigNumber;
  liquidationPrice: BigNumber;
  // Unique identifier for the position. Used for comparing positions.
  uid: string;
  /// Name of the platform this position is on.
  platformName: string;
  /// Internal data to be used by the platform module.
  internals: T;
};

export type Position = PositionInternal<unknown>;

export type TradePairInternal<T> = {
  pair: Pair;
  /// Spread in basis points (4 decimals of precision).
  spreadBps: NumericSpread;
  /// Margin fee in basis points
  marginFeeBps: BigNumber;
  /// Address of the index token for this pair.
  indexAddress: string;
  /// Name of the platform this trade pair is on.
  platformName: string;
  /// Maximum leverage allowed for this trade pair.
  maxLeverageBps: BigNumber;
  /// The liquidation fee, in USD, for this trade pair.
  liquidationFeeUsd: BigNumber;
  /// Internal data to be used by the platform module.
  internals: T;
};

export type TradePair = TradePairInternal<unknown>;

export type Spread<T> = {
  minimum: T;
  maximum: T;
};

export type NumericSpread = Spread<BigNumber>;

type EditPositionArgs = PositionId & {
  /// The change in the position size.
  indexDelta: BigNumber;
  // The change in the collateral amount.
  collateralDelta: BigNumber;
  signer: Signer;
  /// Slippage described as a percentage.
  slippagePercent: number;
  receiver?: string;
  overrides?: ethers.Overrides;
};

type EditOrderArgs = Omit<EditPositionArgs, keyof PositionId> & {
  pair: Pair;
};

export type ApproveIncreasePositionArgs = Pick<
  EditPositionArgs,
  "collateralAddress" | "collateralDelta" | "signer" | "overrides" | "pair"
> & {
  maximise?: boolean;
};

export type IncreasePositionArgs = EditPositionArgs;

export type DecreasePositionArgs = EditPositionArgs & {
  receiveCollateralAddress?: string;
};

type TriggerOrder = {
  triggerPrice: BigNumber;
  shouldTriggerAboveThreshold: boolean;
};

export type CreateIncreasePositionOrderArgs = EditOrderArgs &
  TriggerOrder &
  PositionId;
export type CreateDecreasePositionOrderArgs = CreateIncreasePositionOrderArgs;

export type UpdateDecreasePositionOrderArgs = EditOrderArgs &
  TriggerOrder & {
    orderId: string;
  };
export type UpdateIncreasePositionOrderArgs = UpdateDecreasePositionOrderArgs;

export type GetAllPositionArgs = {
  account: string;
  provider: Provider;
};

export type GetPositionArgs = PositionId & GetAllPositionArgs;

export type TokenArgs = {
  tokenAddress: string;
};

export type GetTokenSpreadBasisPointsArgs = TokenArgs;

export type GetPriceArgs = {
  pair: Pair;
};

export type MarketPrice = {
  /// The current asset price, excluding any spread.
  index: BigNumber;
  /// The best price (for the seller) the asset can currently be sold at.
  bestBid: BigNumber;
  /// The best price (for the buyer) the asset can be currently purchased at.
  bestAsk: BigNumber;
};

export type MarketPriceSubscription = Subscription<MarketPriceCallback, Pair>;

export type SubscribeMarketPriceArgs = {
  callback: MarketPriceCallback;
  pair: Pair;
};

export type MarketPriceCallback = (
  pair: Readonly<Pair>,
  price: Readonly<MarketPrice>
) => any;

export type GetUpdatedPositionArgs = {
  position: Position;
  indexPriceOverride?: BigNumber;
};

export type PositionInput = {
  /// The position size delta, in USD.
  sizeDelta: BigNumber;
  /// The collateral delta, in USD.
  collateralDelta: BigNumber;
  /// The collateral address associated with the delta (deposit/withdrawal).
  collateralAddress: string;
};

type SimulateEditPositionArgs = {
  position: Position;
  input: PositionInput;
  indexPriceOverride?: BigNumber;
};

export type SimulateIncreasePositionArgs = SimulateEditPositionArgs;
export type SimulateDecreasePositionArgs = SimulateEditPositionArgs;

export type Fee<T> = {
  amountUsd: BigNumber;
  metadata: T;
};

export type SwapFeeMetadata = {
  fromToken: TokenInfo;
  toToken: TokenInfo;
};

export type SimulatePositionFees = {
  totalAmountUsd: BigNumber;
  breakdown: {
    margin: Fee<undefined>;
    swap?: Fee<SwapFeeMetadata>;
  };
};

export type SimulatePositionResult = {
  position: Position;
  fees: SimulatePositionFees;
};

export type GetCollateralTokensArgs = {
  pair: Pair;
};

export type GetTradePairArgs = {
  pair: Pair;
};

export type GetTradeHistoryArgs = {
  account: string;
  /// Maximum value of 1000
  limit?: number;
  page?: number;
};

export type TradeActionType = "increase" | "decrease" | "liquidation";

export type TradeAction = {
  id: string;
  account: string;
  collateralToken: TokenInfo;
  indexToken: TokenInfo;
  collateralDelta: BigNumber;
  sizeDelta: BigNumber;
  isLong: boolean;
  price: BigNumber;
  timestamp: number;
  type: TradeActionType;
  realisedPnl: BigNumber;
};

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

export type ActiveIncreaseOrder = PositionId &
  TriggerOrder & {
    purchaseTokenAmount: BigNumber;
    purchaseToken: string;
    sizeDelta: BigNumber;
    orderId: string;
  };
export type ActiveDecreaseOrder = PositionInput &
  PositionId &
  TriggerOrder & {
    orderId: string;
  };
export type GetActiveOrderArgs = {
  account: string;
  provider: Provider;
};
export type ActiveOrders = {
  increase: ActiveIncreaseOrder[];
  decrease: ActiveDecreaseOrder[];
};

export type GetMinimumPositionCollateralArgs = {
  pair: Pair;
  existingCollateral: BigNumber;
  isTriggerOrder: boolean;
};

/**
 * An interface for perpetual trading platforms.
 * The platform has a single collateral token for each position.
 * The platform trade pair consists of an index token and a quote asset,
 * where the quote asset does not need to be a token.
 * The platform prices use 30 decimals of precision.
 */
export interface Trade {
  /// String identifying this trade platform.
  name: string;
  /// Initialises the trade platform. Must be called before other functions.
  initialise(): Promise<void>;
  /**
   * Returns an array of contract transactions for required approvals.
   * If no approvals are required, the array is returned empty.
   */
  approveIncreasePosition(
    args: ApproveIncreasePositionArgs
  ): Promise<PopulatedTransaction[]>;
  increasePosition(args: IncreasePositionArgs): Promise<ContractTransaction>;
  decreasePosition(args: DecreasePositionArgs): Promise<ContractTransaction>;
  approveCreateIncreasePositionOrder(
    args: ApproveIncreasePositionArgs
  ): Promise<PopulatedTransaction[]>;
  createIncreasePositionOrder(
    args: CreateIncreasePositionOrderArgs
  ): Promise<ContractTransaction>;
  createDecreasePositionOrder(
    args: CreateIncreasePositionOrderArgs
  ): Promise<ContractTransaction>;
  updateIncreasePositionOrder(
    args: UpdateIncreasePositionOrderArgs
  ): Promise<ContractTransaction>;
  updateDecreasePositionOrder(
    args: UpdateDecreasePositionOrderArgs
  ): Promise<ContractTransaction>;
  getPosition(args: GetPositionArgs): Promise<Position>;
  getAllPositions(args: GetAllPositionArgs): Promise<Position[]>;
  /// Updates the position according to the current market price.
  getUpdatedPosition(args: GetUpdatedPositionArgs): Position;
  simulateIncreasePosition(
    args: SimulateIncreasePositionArgs
  ): SimulatePositionResult;
  simulateDecreasePosition(
    args: SimulateDecreasePositionArgs
  ): SimulatePositionResult;
  /// Returns the LP token price with 18 decimals.
  getLpTokenPrice(): Promise<BigNumber>;
  /// Returns the latest market price available. Throws if not available.
  getPrice(args: GetPriceArgs): MarketPrice;
  subscribeToMarketPrice(args: SubscribeMarketPriceArgs): SubscriptionId;
  unsubscribeFromMarketPrice(id: SubscriptionId): void;
  getTradePairs(): Promise<TradePair[]>;
  getTokens(): TokenInfo[];
  getCollateralTokens(args: GetCollateralTokensArgs): TokenInfo[];
  /// Gets a trade pair by pair.
  getTradePair(args: GetTradePairArgs): TradePair;
  getTradeHistory(args: GetTradeHistoryArgs): Promise<TradeAction[]>;
  getAvailableLiquidity(
    args: GetAvailableLiquidityArgs
  ): Promise<AvailableLiquidity>;
  /// Returns whether this pair can be traded.
  getPairAvailability: (args: GetAvailabilityArgs) => Availability;
  getActiveOrders(args: GetActiveOrderArgs): Promise<ActiveOrders>;
  getMinimumPositionCollateral(
    args: GetMinimumPositionCollateralArgs
  ): BigNumber;
}

export type TokenInfoGlp = TokenInfo & {
  extensions: {
    isUsdg?: boolean;
    isNative?: boolean;
    isWrappedNative?: boolean;
    isShortable?: boolean;
    isStable?: boolean;
  };
};
