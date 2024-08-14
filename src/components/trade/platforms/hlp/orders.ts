import { BigNumber } from "ethers";
import request, { gql } from "graphql-request";
import {
  ActiveDecreaseOrder,
  ActiveIncreaseOrder,
  ActiveOrders,
  GetActiveOrderArgs,
} from "../legacyInterface";
import { HANDLE_SUBGRAPH_STAGING, HLP_PLATFORM_NAME } from "./config";
import { fetchTradePairsHlp } from "./internals";
import { TradePairHlp } from "./internals/tokens";

const getActiveOrderQuery = (account: string) => gql`
	query {
		activeIncreasePositionOrders(where: { increasePositionOrder_: { account: "${account}" } }) {
			id
			increasePositionOrder {
				id
				account
				orderIndex
				purchaseToken
				purchaseTokenAmount
				collateralToken
				indexToken
				isLong
				sizeDelta
				triggerPrice
				shouldTriggerAboveThreshold
				executionFee
			}
		}
		activeDecreasePositionOrders(where: { decreasePositionOrder_: { account: "${account}" } }) {
			id
			decreasePositionOrder {
				id
				account
				orderIndex
				collateralToken
				collateralDelta
				indexToken
				sizeDelta
				isLong
				triggerPrice
				shouldTriggerAboveThreshold
				executionFee
			}
		}
	}
`;

type ActiveIncreasePositionOrder = {
  id: string;
  increasePositionOrder: {
    id: string;
    account: string;
    orderIndex: string;
    purchaseToken: string;
    purchaseTokenAmount: string;
    collateralToken: string;
    indexToken: string;
    isLong: boolean;
    sizeDelta: string;
    triggerPrice: string;
    shouldTriggerAboveThreshold: boolean;
    executionFee: string;
  };
};

type ActiveDecreasePositionOrder = {
  id: string;
  decreasePositionOrder: {
    id: string;
    account: string;
    orderIndex: string;
    collateralToken: string;
    collateralDelta: string;
    indexToken: string;
    sizeDelta: string;
    isLong: boolean;
    triggerPrice: string;
    shouldTriggerAboveThreshold: boolean;
    executionFee: string;
  };
};

type ActiveOrderResponse = {
  activeIncreasePositionOrders: ActiveIncreasePositionOrder[];
  activeDecreasePositionOrders: ActiveDecreasePositionOrder[];
};

const mapIncreaseOrder = (
  order: ActiveIncreasePositionOrder,
  tradePairs: TradePairHlp[]
) => {
  const { increasePositionOrder } = order;
  const tradePair = tradePairs.find(
    (pair) =>
      pair.indexAddress.toLowerCase() ===
      increasePositionOrder.indexToken.toLowerCase()
  );
  if (!tradePair)
    throw new Error(
      `Trade pair not found for indexToken: ${increasePositionOrder.indexToken}`
    );
  return {
    orderId: createHlpOrderId(
      increasePositionOrder.account,
      +increasePositionOrder.orderIndex
    ),
    pair: tradePair.pair,
    purchaseToken: increasePositionOrder.purchaseToken,
    purchaseTokenAmount: BigNumber.from(
      increasePositionOrder.purchaseTokenAmount
    ),
    collateralAddress: increasePositionOrder.collateralToken,
    indexToken: increasePositionOrder.indexToken,
    isLong: increasePositionOrder.isLong,
    sizeDelta: BigNumber.from(increasePositionOrder.sizeDelta),
    triggerPrice: BigNumber.from(increasePositionOrder.triggerPrice),
    shouldTriggerAboveThreshold:
      increasePositionOrder.shouldTriggerAboveThreshold,
  };
};

const mapDecreaseOrder = (
  order: ActiveDecreasePositionOrder,
  tradePairs: TradePairHlp[]
) => {
  const { decreasePositionOrder } = order;
  const tradePair = tradePairs.find(
    (pair) =>
      pair.indexAddress.toLowerCase() ===
      decreasePositionOrder.indexToken.toLowerCase()
  );
  if (!tradePair)
    throw new Error(
      `Trade pair not found for indexToken: ${decreasePositionOrder.indexToken}`
    );
  return {
    orderId: createHlpOrderId(
      decreasePositionOrder.account,
      +decreasePositionOrder.orderIndex
    ),
    pair: tradePair.pair,
    collateralDelta: BigNumber.from(decreasePositionOrder.collateralDelta),
    collateralAddress: decreasePositionOrder.collateralToken,
    indexToken: decreasePositionOrder.indexToken,
    isLong: decreasePositionOrder.isLong,
    sizeDelta: BigNumber.from(decreasePositionOrder.sizeDelta),
    triggerPrice: BigNumber.from(decreasePositionOrder.triggerPrice),
    shouldTriggerAboveThreshold:
      decreasePositionOrder.shouldTriggerAboveThreshold,
  };
};

export const getActiveOrders = async (
  args: GetActiveOrderArgs
): Promise<ActiveOrders> => {
  const response = await request<ActiveOrderResponse>(
    HANDLE_SUBGRAPH_STAGING,
    getActiveOrderQuery(args.account)
  );
  const tradePairs = await fetchTradePairsHlp();

  const increase: ActiveIncreaseOrder[] =
    response.activeIncreasePositionOrders.map((o) =>
      mapIncreaseOrder(o, tradePairs)
    );
  const decrease: ActiveDecreaseOrder[] =
    response.activeDecreasePositionOrders.map((o) =>
      mapDecreaseOrder(o, tradePairs)
    );

  return {
    increase,
    decrease,
  };
};

const createHlpOrderId = (account: string, index: number) => {
  return `${HLP_PLATFORM_NAME}-${account.toLowerCase()}-${index}`;
};
