import { BigNumber } from "ethers";
import {
  GetAllPositionArgs,
  GetPositionArgs,
  GetPriceArgs,
  GetUpdatedPositionArgs,
  MarketPrice,
  Position,
  PositionInput,
  SimulateDecreasePositionArgs,
  SimulatePositionResult,
  SubscribeMarketPriceArgs,
  Trade,
} from "../legacyInterface";
import * as config from "./config";
import { HLP_PLATFORM_NAME } from "./config";
import * as internals from "./internals";
import {
  fetchTradePairsHlp,
  getCollateralTokens,
  getHlpPrice,
  getTradePair,
} from "./internals";
import { getMinimumPositionCollateralHlp } from "./internals/getMinimumPositionCollateral";
import {
  approveCreateIncreasePositionOrder,
  approveIncreasePosition,
  createDecreasePositionOrder,
  createIncreasePositionOrder,
  decreasePosition,
  getTradeHistory,
  increasePosition,
  updateDecreasePositionOrder,
  updateIncreasePositionOrder,
} from "./internals/position";
import {
  getAvailabilityHlp,
  getAvailableLiquidity,
  getPlatformTokens,
} from "./internals/tokens";
import { getActiveOrders } from "./orders";

export const trade: Trade = {
  name: HLP_PLATFORM_NAME,
  initialise: config.initialise,
  approveIncreasePosition,
  increasePosition,
  decreasePosition,
  approveCreateIncreasePositionOrder,
  createIncreasePositionOrder,
  createDecreasePositionOrder,
  updateIncreasePositionOrder,
  updateDecreasePositionOrder,
  getLpTokenPrice: () => getHlpPrice().then((price) => price.maximum),
  getTradePairs: () => fetchTradePairsHlp(),
  getTokens: getPlatformTokens,
  getCollateralTokens,
  getTradePair,
  getTradeHistory,
  getAvailableLiquidity,
  getPairAvailability: ({ pair }) => getAvailabilityHlp(pair),
  getActiveOrders,
  getMinimumPositionCollateral: getMinimumPositionCollateralHlp,
  getPosition(_: GetPositionArgs): Promise<Position> {
    throw new Error("deprecated legacy function");
  },
  getAllPositions(_: GetAllPositionArgs): Promise<Position[]> {
    throw new Error("deprecated legacy function");
  },
  simulateIncreasePosition(_: {
    position: Position;
    input: PositionInput;
    indexPriceOverride?: BigNumber;
  }): SimulatePositionResult {
    throw new Error("deprecated legacy function");
  },
  getPrice(_: GetPriceArgs): MarketPrice {
    throw new Error("deprecated legacy function");
  },
  subscribeToMarketPrice(_: SubscribeMarketPriceArgs): number {
    throw new Error("deprecated legacy function");
  },
  unsubscribeFromMarketPrice(_: number): void {
    throw new Error("deprecated legacy function");
  },
  getUpdatedPosition(_: GetUpdatedPositionArgs): Position {
    throw new Error("deprecated legacy function");
  },
  simulateDecreasePosition(
    _: SimulateDecreasePositionArgs
  ): SimulatePositionResult {
    throw new Error("deprecated legacy function");
  },
};

export { internals, config };
