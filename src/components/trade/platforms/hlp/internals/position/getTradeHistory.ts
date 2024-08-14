import { BigNumber, constants } from "ethers";
import request, { gql } from "graphql-request";
import config from "../../../../../../config";
import { GetTradeHistoryArgs, TradeAction } from "../../../legacyInterface";
import { DEFAULT_HLP_NETWORK } from "../../config";
import { HandleTokenManagerInstance } from "../../../../../token-manager/HandleTokenManager";
import { removeArrayDuplicates } from "../../../../../../utils/general";

export type GqlResponse = {
  id: string;
  key: string;
  account: string;
  collateralToken: string;
  indexToken: string;
  collateralDelta: string;
  sizeDelta: string;
  isLong: boolean;
  price: string;
  timestamp: number;
};

export type LiquidationGqlResponse = {
  id: string;
  key: string;
  account: string;
  collateralToken: string;
  indexToken: string;
  isLong: boolean;
  markPrice: string;
  timestamp: number;
  size: string;
  collateral: string;
};

const getTxHashFromLiquidationId = (id: string) => id.split(":")[0];

export const getTradeHistory = async ({
  account,
  limit = 1000,
  page = 0,
}: GetTradeHistoryArgs): Promise<TradeAction[]> => {
  const response = await request(
    config.theGraphEndpoints.arbitrum.trade,
    getQuery(account, limit, page)
  );

  // Parse GQL response into TradeAction object, except for the tokens
  const increases = (response.increasePositions as GqlResponse[]).map(
    (trade) => ({
      ...trade,
      type: "increase" as const,
      realisedPnl: constants.Zero,
    })
  );

  const decreases = (response.decreasePositions as GqlResponse[]).map(
    (trade) => ({
      ...trade,
      type: "decrease" as const,
      // realised pnl only changes on decrease positions
      realisedPnl: constants.Zero,
    })
  );

  const liquidations = (
    response.liquidatedPositions as LiquidationGqlResponse[]
  ).map((liquidation) => ({
    ...liquidation,
    type: "liquidation" as const,
    realisedPnl: constants.Zero, // TODO fix this when subgraph is fixed
    sizeDelta: liquidation.size,
    collateralDelta: liquidation.collateral,
    price: liquidation.markPrice,
    id: getTxHashFromLiquidationId(liquidation.id),
  }));

  const decreaseIds = removeArrayDuplicates(decreases.map((d) => d.id));
  const closePositions = await getClosePositions(decreaseIds);
  // create mapping from close position key to close position pnl
  const profitMap: Record<string, BigNumber> = closePositions.reduce(
    (acc, curr) => {
      acc[curr.id] = BigNumber.from(curr.realisedPnl);
      return acc;
    },
    {} as Record<string, BigNumber>
  );

  // using the previous map, match decrease positions with their effects on pnl
  decreases.forEach((decrease) => {
    const pnl = profitMap[decrease.id];
    if (pnl) {
      decrease.realisedPnl = pnl;
    }
  });

  const actions: TradeAction[] = [
    ...liquidations,
    ...increases,
    ...decreases,
  ].map((action) => ({
    ...action,
    collateralToken: HandleTokenManagerInstance.getTokenByAddress(
      action.collateralToken,
      DEFAULT_HLP_NETWORK
    ),
    indexToken: HandleTokenManagerInstance.getTokenByAddress(
      action.indexToken,
      DEFAULT_HLP_NETWORK
    ),
    collateralDelta: BigNumber.from(action.collateralDelta),
    sizeDelta: BigNumber.from(action.sizeDelta),
    price: BigNumber.from(action.price),
  }));

  return actions.sort((a, b) => b.timestamp - a.timestamp);
};

const getQuery = (account: string, limit: number, page: number) =>
  gql`{
    increasePositions(where: {
      account: "${account.toLowerCase()}"
    }, first: ${limit}, skip: ${page * limit}) {
      id
      key
      account
      collateralToken
      indexToken
      collateralDelta
      sizeDelta
      isLong
      price
      timestamp
    }
    decreasePositions(where: {
      account: "${account.toLowerCase()}"
    }, first: ${limit}, skip: ${page * limit}) {
      id
      key
      account
      collateralToken
      indexToken
      collateralDelta
      sizeDelta
      isLong
      price
      timestamp
    }
    liquidatedPositions(where: {
      account: "${account.toLowerCase()}"
    }, first: ${limit}, skip: ${page * limit}) {
      id
      key
      account
      collateralToken
      indexToken
      collateral
      size
      isLong
      markPrice
      timestamp
    }
  }`;

const getClosePositions = async (
  ids: string[]
): Promise<{ id: string; realisedPnl: BigNumber; timestamp: string }[]> => {
  const query = gql`{
    closePositions(where: {
    id_in: ["${ids.join('", "')}"]
    }) {
      id
      realisedPnl
      timestamp
    }
  }`;
  const response = await request(
    config.theGraphEndpoints.arbitrum.trade,
    query
  );
  return response.closePositions;
};
