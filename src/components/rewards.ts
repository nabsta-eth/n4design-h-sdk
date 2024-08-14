import { BigNumber, BigNumberish, ethers } from "ethers";
import sdkConfig from "../config";
import { BASIS_POINTS_DIVISOR } from "../constants";
import { RewardPool__factory } from "../contracts";
import { DepositStructOutput } from "../contracts/RewardPool";
import { Promisified } from "../types/general";
import { Network, parseMainNetwork } from "../types/network";
import {
  RewardPoolData,
  RewardPoolMap,
  RewardPool,
  RewardPoolRaw,
} from "../types/rewardPool";
import {
  fetchPromisifiedObject,
  getGovernanceLockContract,
  getRewardPoolContract,
} from "../utils/contract";
import { getUnderlyingFxSymbol } from "../utils/fxToken";
import { CACHE_DURATION_INFINITE, CachedObject } from "../utils/cachedObject";
import { fetchCacheApi } from "../utils/sdk";

// TODO: improve alias handling in this module and include all pools in getData.
export const SHLP_POOL_ID = 9;

type RewardPoolsDataMulticall = {
  pools: {
    poolRatios: BigNumber[];
    accruedAmounts: BigNumber[];
    deltaS: BigNumber[];
    poolIds: BigNumber[];
  };
  forexDistributionRate: BigNumber;
  claimableRewards?: BigNumber;
  veForexSupply: BigNumber;
  poolRewards?: Record<string, BigNumber>;
  userDeposits?: Record<string, DepositStructOutput>;
  totalDeposits: Record<string, Pool>;
};

type RewardPoolsMulticall = Record<
  string,
  {
    weight: BigNumber;
    assetType: number;
    assetAddress: string;
    totalDeposits: BigNumber;
    totalRealDeposits: BigNumber;
    S: BigNumber;
  }
>;

type RewardPoolIdsMulticall = Record<
  string,
  { found: boolean; poolId: BigNumber }
>;

type Pool = [BigNumber, number, string, BigNumber, BigNumber, BigNumber] & {
  weight: BigNumber;
  assetType: number;
  assetAddress: string;
  totalDeposits: BigNumber;
  S: BigNumber;
  totalRealDeposits: BigNumber;
};

const rewardPoolIds = new CachedObject<Record<string, number>>(
  CACHE_DURATION_INFINITE
);

export const getData = async (
  account: string | undefined
): Promise<RewardPoolData> => {
  if (!account && sdkConfig.sdk.shouldUseCacheServer) {
    return fetchCacheApi("earn-pools/rewards");
  }
  const rewardPoolIds = await fetchRewardPoolIds();
  const [response, totalDeposits] = await Promise.all([
    fetchPromisifiedObject(getDataMulticall(account)),
    fetchPromisifiedObject(getTotalDepositsMulticall(rewardPoolIds)),
  ]);
  if (account) {
    const [userDepositsResponse, poolsResponse] = await Promise.all([
      fetchPromisifiedObject(getDepositsMulticall(account, rewardPoolIds)),
      fetchPromisifiedObject(
        getDataPoolRewardsMulticall(account, rewardPoolIds)
      ),
    ]);
    return toRewardPoolData(
      {
        ...response,
        poolRewards: poolsResponse,
        userDeposits: userDepositsResponse,
        totalDeposits,
      },
      rewardPoolIds
    );
  }
  return toRewardPoolData(
    {
      ...response,
      totalDeposits,
    },
    rewardPoolIds
  );
};

export const getPool = async (poolName: string): Promise<RewardPoolRaw> => {
  const rewardPoolIds = await fetchRewardPoolIds();
  const poolId = rewardPoolIds[poolName];
  const pool = await getRewardPoolContract().getPool(poolId);
  return {
    name: poolName,
    ...pool,
  };
};

export const getPools = async (): Promise<Record<string, RewardPoolRaw>> => {
  if (sdkConfig.sdk.shouldUseCacheServer) {
    return fetchCacheApi("earn-pools/reward-map");
  }
  const contract = getRewardPoolContract();
  const rewardPoolIds = await fetchRewardPoolIds();
  const poolNames = Object.keys(rewardPoolIds);
  const multicall: Promisified<RewardPoolsMulticall> = poolNames.reduce(
    (progress, poolName) => {
      const poolId = rewardPoolIds[poolName];
      return {
        ...progress,
        [poolName]: contract.getPool(poolId),
      };
    },
    {} as Promisified<RewardPoolsMulticall>
  );
  const response = await fetchPromisifiedObject(multicall);
  return poolNames.reduce(
    (progress, poolName) => ({
      ...progress,
      [poolName]: {
        ...response[poolName],
        name: poolName,
      },
    }),
    {} as Record<string, RewardPoolRaw>
  );
};

export const getClaimableBalance = (account: string, pool: BigNumber) =>
  getRewardPoolContract().poolBalanceOf(account, pool);

export const getDeposit = (account: string, pool: BigNumber) =>
  getRewardPoolContract().getDeposit(account, pool);

export const claim = (
  signer: ethers.Signer,
  options: ethers.Overrides = {}
): Promise<ethers.ContractTransaction> =>
  getRewardPoolContract(signer).claim(options);

export const claimFromPool = (
  signer: ethers.Signer,
  poolId: BigNumber,
  options: ethers.Overrides = {}
): Promise<ethers.ContractTransaction> =>
  getRewardPoolContract(signer).claimFromPool(poolId, options);

const getDataMulticall = (
  account: string | undefined
): Promisified<Omit<RewardPoolsDataMulticall, "totalDeposits">> => {
  const contract = getRewardPoolContract();
  const base = {
    forexDistributionRate: contract.forexDistributionRate(),
    pools: contract.getEnabledPoolsData(),
    veForexSupply: getGovernanceLockContract().totalSupply(),
  };
  if (account) {
    return {
      ...base,
      claimableRewards: contract.balanceOf(account),
    };
  }
  return base;
};

const getDataPoolRewardsMulticall = (
  account: string,
  pools: Record<string, number>
): Promisified<Record<string, BigNumber>> =>
  Object.keys(pools).reduce(
    (prevObject, key) => ({
      ...prevObject,
      [key]: getRewardPoolContract().poolBalanceOf(account, pools[key]),
    }),
    {}
  );

const getDepositsMulticall = (
  account: string,
  pools: Record<string, number>
): Promisified<Record<string, DepositStructOutput>> =>
  Object.keys(pools).reduce(
    (prevObject, key) => ({
      ...prevObject,
      [key]: getRewardPoolContract().getDeposit(account, pools[key]),
    }),
    {}
  );

const getTotalDepositsMulticall = (
  pools: Record<string, number>
): Promisified<Record<string, Pool>> =>
  Object.keys(pools).reduce(
    (prevObject, key) => ({
      ...prevObject,
      [key]: getRewardPoolContract().getPool(pools[key]),
    }),
    {}
  );

const toRewardPoolData = (
  response: RewardPoolsDataMulticall,
  poolIds: Record<string, number>
): RewardPoolData => {
  const enabledPoolIds = filterPoolIdsByEnabled(
    poolIds,
    response.pools.poolIds.map((id) => +id)
  );
  const poolNames = Object.keys(enabledPoolIds);
  const pools = poolNames.reduce((pools, name, i) => {
    const rewardPool: RewardPool = {
      ratio: response.pools.poolRatios[i],
      deltaS: response.pools.deltaS[i],
      accruedAmount: response.pools.accruedAmounts[i],
      id: enabledPoolIds[name],
      userBoost:
        response.userDeposits && !response.userDeposits[name].amount.isZero()
          ? calculateBoost(
              response.totalDeposits[name].totalRealDeposits,
              response.veForexSupply,
              response.userDeposits[name].amount,
              response.userDeposits[name].boostWeight
            )
          : undefined,
      averagePoolBoost: getAveragePoolBoost(
        response.totalDeposits[name].totalDeposits,
        response.totalDeposits[name].totalRealDeposits
      ),
    };
    return {
      ...pools,
      [name]: rewardPool,
    };
  }, {} as RewardPoolMap);
  return {
    forexDistributionRate: response.forexDistributionRate,
    account:
      response.claimableRewards &&
      response.poolRewards &&
      response.userDeposits &&
      response.totalDeposits
        ? {
            claimableRewards: response.claimableRewards,
            poolRewards: response.poolRewards,
            rewardPoolDeposits: Object.keys(response.userDeposits).reduce(
              (prevObject, key) => ({
                ...prevObject,
                [key]: {
                  // userDeposits and totalDeposits have the same keys
                  userDeposited: response.userDeposits![key].amount,
                  totalDeposited: response.totalDeposits[key].totalDeposits,
                },
              }),
              {}
            ),
          }
        : undefined,
    pools,
  };
};

/**
 * Returns pool IDs (even if not enabled) using the known aliases
 * for the governance pool and keeper pools.
 * Does not return pool IDs for aliases not set.
 */
export const fetchRewardPoolIds = async (): Promise<Record<string, number>> =>
  rewardPoolIds.fetch(fetchRewardPoolIdsUncached);

const fetchRewardPoolIdsUncached = async (): Promise<
  Record<string, number>
> => {
  const contract = getRewardPoolContract();
  const multicall: Promisified<RewardPoolIdsMulticall> = {
    governanceLock: contract.getPoolIdByAlias(
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes("governancelock-blp"))
    ),
  };
  const fxTokens = Object.entries(sdkConfig.fxTokenAddresses);
  for (let [symbol, address] of fxTokens) {
    const keeperName = `fxKeeper${getUnderlyingFxSymbol(symbol)}`;
    multicall[keeperName] = contract.getPoolIdByAlias(
      getFxKeeperPoolAlias(address)
    );
  }
  const response = await fetchPromisifiedObject(multicall);
  return Object.keys(response).reduce(
    (object, name) =>
      !response[name].found
        ? { ...object }
        : {
            ...object,
            [name]: +response[name].poolId,
          },
    {}
  );
};

const getFxKeeperPoolAlias = (fxTokenAddress: string) =>
  ethers.utils.keccak256(
    ethers.utils.solidityPack(["address", "uint256"], [fxTokenAddress, 2])
  );

const filterPoolIdsByEnabled = (
  poolIds: Record<string, number>,
  enabledIds: number[]
): Record<string, number> =>
  Object.keys(poolIds).reduce(
    (object, key) =>
      !enabledIds.includes(poolIds[key])
        ? { ...object }
        : {
            ...object,
            [key]: poolIds[key],
          },
    {} as Record<string, number>
  );

export const calculateBoost = (
  totalRealDeposits: BigNumber,
  totalSupply: BigNumber,
  amount: BigNumber,
  boostWeight: BigNumber
) => {
  if (amount.isZero() || totalSupply.isZero()) return;
  const boostDepositAmount = boostWeight
    .mul(totalRealDeposits)
    .mul(15)
    .div(totalSupply)
    .div(10);
  const boost = amount.add(boostDepositAmount);
  let boostRatio = boost.mul(BASIS_POINTS_DIVISOR).div(amount);
  if (boostRatio.gt(2.5 * BASIS_POINTS_DIVISOR)) {
    boostRatio = BigNumber.from(2.5 * BASIS_POINTS_DIVISOR);
  }
  return +boostRatio / BASIS_POINTS_DIVISOR;
};

export const fetchAveragePoolBoost = async (
  poolId: BigNumberish,
  provider: ethers.providers.Provider,
  network: Network
) => {
  const address =
    sdkConfig.protocol[parseMainNetwork(network)].protocol.rewardPool;
  if (!address) throw new Error(`No reward pool on ${network}`);
  const rewardPool = RewardPool__factory.connect(address, provider);
  const pool = await rewardPool.getPool(poolId);
  return getAveragePoolBoost(pool.totalDeposits, pool.totalRealDeposits);
};

const getAveragePoolBoost = (
  totalDeposits: BigNumber,
  totalRealDeposits: BigNumber
): number =>
  totalRealDeposits.isZero()
    ? BASIS_POINTS_DIVISOR
    : +totalDeposits.mul(BASIS_POINTS_DIVISOR).div(totalRealDeposits) /
      BASIS_POINTS_DIVISOR;
