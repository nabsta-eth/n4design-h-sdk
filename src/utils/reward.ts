import { BigNumber, BigNumberish, ethers } from "ethers";
import request, { gql } from "graphql-request";
import { calculateBoost } from "../components/rewards";
import config from "../config";
import { GovernanceLock__factory, RewardPool__factory } from "../contracts";
import { Network, parseMainNetwork } from "../types/network";
import { PRICE_DECIMALS } from "../components/trade/platforms/legacyInterface";

export const FEES_TO_LIQUIDITY_PROVIDERS = 0.8;

export const calculateUserApr = (
  userBoost: number,
  averagePoolBoost: number,
  poolApr: number
): number => (poolApr * userBoost) / averagePoolBoost;

type FeeStats = {
  marginAndLiquidation: string;
  swap: string;
  mint: string;
  burn: string;
};
type GraphResponse = {
  feeStats: FeeStats[];
  hlpStats: {
    aumInUsdg: string;
  }[];
};

const getQuery = (sampleDays: number) =>
  gql`
    query {
        feeStats(first:${Math.floor(sampleDays)}) {
            marginAndLiquidation
            swap
            mint
            burn
        }
        hlpStats(first:1, orderBy:timestamp, orderDirection:desc) {
            aumInUsdg
        }
    }`;

export const fetchHlpVaultFeeApr = async (
  network: Network,
  overrideAumInUsdg?: BigNumber,
  sampleDays = 7
) => {
  if (network !== "arbitrum")
    throw new Error("Cannot fetch if not on arbitrum");
  const response = await request<GraphResponse>(
    config.theGraphEndpoints[network].trade,
    getQuery(sampleDays)
  );
  if (response.feeStats.length === 0) return 0;
  if (response.hlpStats.length === 0) return 0;

  const total = response.feeStats.reduce(
    (acc, curr) =>
      acc
        .add(curr.marginAndLiquidation)
        .add(curr.swap)
        .add(curr.mint)
        .add(curr.burn),
    ethers.constants.Zero
  );

  const meanDailyFee =
    +ethers.utils.formatUnits(total, PRICE_DECIMALS) / response.feeStats.length;
  const yearlyFee = meanDailyFee * 365;
  // usdg has 18 decimals
  const aum = +ethers.utils.formatUnits(
    overrideAumInUsdg || response.hlpStats[0].aumInUsdg,
    18
  );

  return (yearlyFee * FEES_TO_LIQUIDITY_PROVIDERS) / aum;
};

export const fetchUserBoost = async (
  user: string,
  poolId: BigNumberish,
  provider: ethers.providers.Provider,
  network: Network
) => {
  const protocol = config.protocol[parseMainNetwork(network)].protocol;
  const rewardPool = RewardPool__factory.connect(protocol.rewardPool, provider);
  const gov = GovernanceLock__factory.connect(
    protocol.governanceLock,
    provider
  );
  const [deposit, pool, totalSupply] = await Promise.all([
    rewardPool.getDeposit(user, poolId),
    rewardPool.getPool(poolId),
    gov.totalSupply(),
  ]);

  return calculateBoost(
    pool.totalRealDeposits,
    totalSupply,
    deposit.amount,
    deposit.boostWeight
  );
};
