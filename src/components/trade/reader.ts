import { formatUnits, parseUnits } from "ethers/lib/utils";
import { request, gql } from "graphql-request";
import { H2SO_PRICE_DECIMALS } from "../../constants";
import { TradeAccountRole } from "./account";
import { BigNumber } from "ethers";

export const AMOUNT_DECIMALS = 18;
export const PRICE_DECIMALS = H2SO_PRICE_DECIMALS;

export const AMOUNT_UNIT = parseUnits("1", AMOUNT_DECIMALS);
export const PRICE_UNIT = parseUnits("1", PRICE_DECIMALS);

export type ReaderAccount = {
  id: string;
  isOpen: boolean;
  realizedEquities: {
    token: string;
    value: string;
  }[];
  positions: ReaderPosition[];
};

export type ReaderMeta = {
  _meta: {
    block: {
      timestamp: number;
    };
  };
};

export type ReaderAccountResponse = {
  account: ReaderAccount | null;
} & ReaderMeta;

export type ReaderAccountRoleQuery = {
  users: {
    address: string;
    roles: string[];
  }[];
  id: string;
};

export type ReaderAccountUserAccountsQuery = {
  accountUsers: {
    account: {
      id: string;
    };
  }[];
};

export type ReaderPosition = {
  account: { id: string };
  liquidityPool: { id: string };
  pair: string;
  size: string;
  entryPrice: string;
  snapshotSumFractionFunding: string;
  snapshotSumFractionBorrow: string;
};

export type ReaderLiquidityPool = {
  id: string;
  owner: string;
  underlyingToken: string;
  realizedEquity: string;
  liquidityTokenSupply: string;
  accruedFees: string;
  undistributedFees: string;
  openInterests: ReaderLiquidityPoolOpenInterest[];
};

export type ReaderLiquidityPoolOpenInterest = {
  pair: string;
  long: string;
  short: string;
};

export enum ReaderTradeType {
  Trade = 0,
  Liquidation = 1,
}

export type ReaderTrade = {
  id: string;
  account: { id: string };
  liquidityPool: { id: string };
  pair: string;
  size: string;
  price: string;
  marginFee: string;
  realizedEquity: string;
  tradeType: ReaderTradeType;
  transaction: { timestamp: string; hash: string };
  didOpenPosition: boolean;
  didClosePosition: boolean;
};

export type ReaderAccountAssetDeposit = {
  id: string;
  account: { id: string };
  depositorAddress: string;
  assetAddress: string;
  amount: string;
  transaction: { timestamp: string; hash: string };
};
export type ReaderAccountAssetWithdrawal = {
  id: string;
  account: { id: string };
  accountUser: string;
  assetAddress: string;
  amount: string;
  transaction: { timestamp: string; hash: string };
};
export type ReaderDepositWithdrawHistory = {
  accountAssetDeposits: ReaderAccountAssetDeposit[];
  accountAssetWithdrawals: ReaderAccountAssetWithdrawal[];
};
export enum ReaderPeriodicPositionFeeType {
  Borrow = 0,
  Funding = 1,
}
export type ReaderPeriodicPositionFeeCollection = {
  id: string;
  account: { id: string };
  pair: string;
  liquidityPool: { id: string };
  transaction: { timestamp: string };
  periodicPositionFeeType: ReaderPeriodicPositionFeeType;
  amount: string;
};
export type ReaderSystemParam = {
  paramId: string;
  paramValue: string;
};
export type SystemParams = Record<string, BigNumber | undefined>;

export type ReaderGetTradesOptions = {
  accountId?: number;
  pair?: string;
  liquidityPoolId?: string;
  skipOrdering?: boolean;
};

export type ReaderGetPositionsOptions = {
  accountId?: number;
  pair?: string;
  liquidityPoolId?: string;
  skipOrdering?: boolean;
};

export type ReaderHistoricalLpPairVolume = {
  id: string;
  liquidityPool: { id: string };
  pair: string;
  volume: string;
  volumeLpc: string;
};

/// A TradeReader allows fetching historical data.
export interface TradeReader {
  getAccount(accountId: number): Promise<ReaderAccountResponse>;
  getUserAccountIds(
    userAddress: string,
    userRole: TradeAccountRole
  ): Promise<number[]>;
  getLiquidityPools(): Promise<ReaderLiquidityPool[]>;
  getTradeHistory(
    accountId: number,
    limit: number,
    offset: number,
    pair?: string
  ): Promise<ReaderTrade[]>;
  getTrades(
    limit: number,
    offset: number,
    options?: ReaderGetTradesOptions
  ): Promise<ReaderTrade[]>;
  getDepositWithdrawHistory(
    accountId: number,
    limit: number,
    offset: number
  ): Promise<ReaderDepositWithdrawHistory>;
  getPeriodicFeeHistory(
    accountId: number,
    limit: number,
    offset: number,
    startTimestamp?: number
  ): Promise<ReaderPeriodicPositionFeeCollection[]>;
  getPeriodicFeesForPosition(
    accountId: number,
    pair: string,
    startTimestamp: number
  ): Promise<ReaderPeriodicPositionFeeCollection[]>;
  getSystemParams(): Promise<SystemParams>;
  getSystemParam(paramName: string): Promise<BigNumber>;
  getWithdrawGasFeeUsd(): Promise<BigNumber>;
  getTradeGasFeeUsd(): Promise<BigNumber>;
  getPositions(
    limit: number,
    offset: number,
    options?: ReaderGetPositionsOptions
  ): Promise<ReaderPosition[]>;
  getHistoricalLpPairVolumes(
    limit: number,
    offset: number,
    liquidityPoolId: string,
    pair?: string
  ): Promise<ReaderHistoricalLpPairVolume[]>;
}

export class TradeReaderSubgraph implements TradeReader {
  constructor(private graphUrl: string) {}

  public async getUserAccountIds(
    userAddress: string,
    userRole: TradeAccountRole
  ): Promise<number[]> {
    userAddress = userAddress.toLowerCase();
    const query = gql`
      query ownedAccountsForAddress($address: String!, $role: String!) {
        accountUsers(where: { address: $address, roles_contains: [$role] }) {
          account {
            id
          }
        }
      }
    `;
    const response = await request<ReaderAccountUserAccountsQuery>(
      this.graphUrl,
      query,
      { address: userAddress, role: String(+userRole) }
    );
    if (!response.accountUsers || response.accountUsers.length === 0) {
      return [];
    }
    return response.accountUsers.map((user) => +user.account.id);
  }

  public async getAccount(accountId: number): Promise<ReaderAccountResponse> {
    const query = gql`
      query getAccount($accountId: Int!) {
        account(id: $accountId) {
          id
          isOpen
          realizedEquities {
            token
            value
          }
          positions {
            account {
              id
            }
            pair
            size
            entryPrice
            snapshotSumFractionFunding
            snapshotSumFractionBorrow
            liquidityPool {
              id
            }
          }
        }
        _meta {
          block {
            timestamp
          }
        }
      }
    `;
    return request<ReaderAccountResponse>(this.graphUrl, query, {
      accountId,
    });
  }

  public async getLiquidityPools(): Promise<ReaderLiquidityPool[]> {
    const query = gql`
      query getLiquidityPools {
        liquidityPools {
          owner
          id
          underlyingToken
          realizedEquity
          liquidityTokenSupply
          accruedFees
          undistributedFees
          openInterests {
            pair
            short
            long
          }
        }
      }
    `;
    const response = await request<{ liquidityPools: ReaderLiquidityPool[] }>(
      this.graphUrl,
      query
    );
    return response.liquidityPools;
  }

  /**
   * Gets the trade history for a trade account.
   */
  public async getTradeHistory(
    accountId: number,
    limit: number,
    offset: number,
    pair?: string
  ): Promise<ReaderTrade[]> {
    return this.getTrades(limit, offset, { accountId, pair });
  }

  public async getTrades(
    limit: number,
    offset: number,
    {
      accountId,
      pair,
      liquidityPoolId,
      skipOrdering,
    }: ReaderGetTradesOptions = {}
  ): Promise<ReaderTrade[]> {
    const { filterString, variableString, ordering } = getQueryArgStrings(
      accountId?.toString(),
      pair,
      liquidityPoolId,
      skipOrdering
    );
    const query = gql`
      query getTradeHistory(${variableString}) {
        trades(
          where: { ${filterString} }
          ${ordering}   
          first: $limit
          skip: $offset
        ) {
          id
          account {
            id
          }
          liquidityPool {
            id
          }
          pair
          size
          price
          marginFee
          realizedEquity
          tradeType
          transaction {
            timestamp
            hash
          }
          didOpenPosition
          didClosePosition
        }
      }
    `;
    const response = await request<{ trades: ReaderTrade[] }>(
      this.graphUrl,
      query,
      {
        limit,
        offset,
        pair,
        account: accountId?.toString(),
        liquidityPool: liquidityPoolId?.toString(),
      }
    );
    return response.trades;
  }

  public async getDepositWithdrawHistory(
    accountId: number,
    limit: number,
    offset: number
  ): Promise<ReaderDepositWithdrawHistory> {
    const query = gql`
      query getDepositWithdrawHistory(
        $accountId: String!
        $limit: Int
        $offset: Int
      ) {
        accountAssetDeposits(
          where: { account: $accountId }
          orderBy: transaction__timestamp
          orderDirection: desc
          first: $limit
          skip: $offset
        ) {
          id
          account {
            id
          }
          depositorAddress
          assetAddress
          amount
          transaction {
            hash
            timestamp
          }
        }
        accountAssetWithdrawals(
          where: { account: $accountId }
          orderBy: transaction__timestamp
          orderDirection: desc
          first: $limit
          skip: $offset
        ) {
          id
          account {
            id
          }
          accountUser
          amount
          transaction {
            hash
            timestamp
          }
        }
      }
    `;
    return request<ReaderDepositWithdrawHistory>(this.graphUrl, query, {
      accountId: accountId.toString(),
      limit,
      offset,
    });
  }

  public async getPeriodicFeeHistory(
    accountId: number,
    limit: number,
    offset: number,
    startTimestamp?: number
  ): Promise<ReaderPeriodicPositionFeeCollection[]> {
    const query = gql`
      query getPeriodicFeeHistory(
        $accountId: String!
        $limit: Int
        $offset: Int
        ${startTimestamp ? "$startTimestamp: Int" : ""}
      ) {
        periodicPositionFeeCollections(
          where: { account: $accountId${
            startTimestamp
              ? ", transaction_: { timestamp_gte: $startTimestamp }"
              : ""
          } }
          orderBy: transaction__timestamp
          orderDirection: desc
          first: $limit
          skip: $offset
        ) {
          id
          timestamp
          account {
            id
          }
          pair
          liquidityPool {
            id
          }
          transaction {
            timestamp
          }
          amount
          periodicPositionFeeType
        }
      }
    `;
    const response = await request<{
      periodicPositionFeeCollections: ReaderPeriodicPositionFeeCollection[];
    }>(this.graphUrl, query, {
      accountId: accountId.toString(),
      limit,
      offset,
      startTimestamp: startTimestamp?.toString(),
    });
    return response.periodicPositionFeeCollections;
  }

  public async getPeriodicFeesForPosition(
    accountId: number,
    pair: string,
    startTimestamp: number
  ): Promise<ReaderPeriodicPositionFeeCollection[]> {
    const query = gql`
      query getPeriodicFeeHistory(
        $accountId: String!
        $pair: String!
        $startTimestamp: String!
      ) {
        periodicPositionFeeCollections(
          where: {
            account: $accountId
            pair: $pair
            transaction_: { timestamp_gte: $startTimestamp }
          }
          orderBy: transaction__timestamp
          orderDirection: desc
        ) {
          id
          timestamp
          account {
            id
          }
          pair
          liquidityPool {
            id
          }
          transaction {
            timestamp
          }
          amount
          periodicPositionFeeType
        }
      }
    `;
    const response = await request<{
      periodicPositionFeeCollections: ReaderPeriodicPositionFeeCollection[];
    }>(this.graphUrl, query, {
      accountId: accountId.toString(),
      pair,
      startTimestamp: startTimestamp.toString(),
    });
    return response.periodicPositionFeeCollections;
  }

  public async getSystemParams(): Promise<SystemParams> {
    const query = gql`
      query getSystemParams {
        systemParams(first: 1000) {
          paramId
          paramValue
        }
      }
    `;
    const response = await request<{
      systemParams: ReaderSystemParam[];
    }>(this.graphUrl, query);
    return Object.fromEntries(
      response.systemParams.map((param) => {
        if (!param.paramValue) {
          throw new Error(`Invalid param value: ${param.paramValue}`);
        }
        return [param.paramId, BigNumber.from(param.paramValue)];
      })
    );
  }

  public async getSystemParam(paramId: string): Promise<BigNumber> {
    const query = gql`
      query getSystemParam($paramId: String!) {
        systemParams(where: { paramId: $paramId }) {
          paramId
          paramValue
        }
      }
    `;
    const response = await request<{
      systemParams: ReaderSystemParam[];
    }>(this.graphUrl, query, {
      paramId,
    });
    const systemParam = response.systemParams[0];
    if (!systemParam) {
      throw new Error(`Invalid param value: ${systemParam}`);
    }
    return BigNumber.from(systemParam.paramValue);
  }

  public async getWithdrawGasFeeUsd(): Promise<BigNumber> {
    const withdrawGasUnit = await this.getSystemParam("gas.unit.withdraw");
    const gasUsdUnit = await this.getSystemParam("gas.usd.unit");
    return withdrawGasUnit.mul(gasUsdUnit);
  }

  public async getTradeGasFeeUsd(): Promise<BigNumber> {
    const tradeGasUnit = await this.getSystemParam("gas.unit.trade");
    const gasUsdUnit = await this.getSystemParam("gas.usd.unit");
    return tradeGasUnit.mul(gasUsdUnit);
  }

  public async getPositions(
    limit: number,
    offset: number,
    {
      accountId,
      pair,
      liquidityPoolId,
      skipOrdering,
    }: ReaderGetPositionsOptions = {}
  ): Promise<ReaderPosition[]> {
    const { filterString, variableString, ordering } = getQueryArgStrings(
      accountId?.toString(),
      pair,
      liquidityPoolId,
      skipOrdering
    );
    const query = gql`
      query getPositions(${variableString}) {
        positions(
          where: { ${filterString} }
          ${ordering}   
          first: $limit
          skip: $offset
      ) {
          account {
            id
          }
          entryPrice
          id
          pair
          size
          snapshotSumFractionFunding
          snapshotSumFractionBorrow
          liquidityPool {
            id
          }
        }
      }
    `;
    const response = await request<{ positions: ReaderPosition[] }>(
      this.graphUrl,
      query,
      {
        limit,
        offset,
        pair,
        account: accountId?.toString(),
        liquidityPool: liquidityPoolId?.toString(),
      }
    );
    return response.positions;
  }

  public async getHistoricalLpPairVolumes(
    limit: number,
    offset: number,
    liquidityPoolId: string,
    pair?: string
  ): Promise<ReaderHistoricalLpPairVolume[]> {
    const { filterString, variableString } = getQueryArgStrings(
      undefined,
      pair,
      liquidityPoolId,
      true
    );
    const query = gql`
      query getHistoricalLpPairVolumes(${variableString}) {
        historicalLpPairVolumes(
          where: { ${filterString} }
          first: $limit
          skip: $offset
        ) {
          id
          liquidityPool {
            id
          }
          pair
          volume
          volumeLpc
        }
      }
    `;
    const response = await request<{
      historicalLpPairVolumes: ReaderHistoricalLpPairVolume[];
    }>(this.graphUrl, query, {
      liquidityPool: liquidityPoolId,
      pair: pair,
      limit,
      offset,
    });
    return response.historicalLpPairVolumes;
  }
}

export const parseAmount = (stringified: string): BigNumber =>
  parseUnits(stringified, AMOUNT_DECIMALS);

export const parsePrice = (stringified: string): BigNumber =>
  parseUnits(stringified, PRICE_DECIMALS);

export const formatAmount = (amount: BigNumber): string =>
  formatUnits(amount, AMOUNT_DECIMALS);

export const formatPrice = (price: BigNumber): string =>
  formatUnits(price, PRICE_DECIMALS);

type GqlVariableOrFilter = {
  left: string;
  right: string;
  isDefined: boolean;
  isVariableOnLeft: boolean;
};

const getGqQueryVariableExpressions = (
  variables: GqlVariableOrFilter[]
): string =>
  variables.reduce((str, variable) => {
    if (!variable.isDefined) {
      return str;
    }
    const leftPrefix = variable.isVariableOnLeft ? "$" : "";
    const rightPrefix = variable.isVariableOnLeft ? "" : "$";
    return str.length === 0
      ? `${leftPrefix}${variable.left}: ${rightPrefix}${variable.right}`
      : `${str}, ${leftPrefix}${variable.left}: ${rightPrefix}${variable.right}`;
  }, "");

const getQueryArgStrings = (
  accountId?: string,
  pair?: string,
  liquidityPoolId?: string,
  skipOrdering?: boolean
) => {
  const optionalVariables: GqlVariableOrFilter[] = [
    {
      left: "account",
      right: "String!",
      isDefined: !!accountId,
      isVariableOnLeft: true,
    },
    {
      left: "pair",
      right: "String!",
      isDefined: !!pair,
      isVariableOnLeft: true,
    },
    {
      left: "liquidityPool",
      right: "String!",
      isDefined: !!liquidityPoolId,
      isVariableOnLeft: true,
    },
  ];
  const optionalVariableFilters = optionalVariables.map((v) => ({
    ...v,
    // In a filter, both sides are the same
    // since the variable name is the same as the property.
    right: v.left,
    isVariableOnLeft: false,
  }));
  return {
    filterString: getGqQueryVariableExpressions(optionalVariableFilters),
    variableString: getGqQueryVariableExpressions([
      {
        left: "limit",
        right: "Int",
        isDefined: true,
        isVariableOnLeft: true,
      },
      {
        left: "offset",
        right: "Int",
        isDefined: true,
        isVariableOnLeft: true,
      },
      ...optionalVariables,
    ]),
    ordering: `${
      !skipOrdering
        ? `
        orderBy: transaction__timestamp
        orderDirection: desc
        `
        : ""
    }`,
  };
};
