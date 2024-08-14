import { AssetAmount } from "..";
import { RewardPoolData, RewardPoolDeposit } from "../../../types/rewardPool";
import { bnToNumber } from "../../../utils/general";

const DECIMALS = 18;

type NamedRewardPool = RewardPoolDeposit & {
  alias: string;
};

export const getKeeperStaking = (data: RewardPoolData): AssetAmount[] => {
  const deposits = data.account?.rewardPoolDeposits ?? {};
  // Since all keeper pool staking is logged on the reward pool contract,
  // the reward pool can be used to get keeper staking data.
  const pools = Object.keys(deposits).reduce((pools, poolName) => {
    if (poolName.startsWith("fxKeeper")) {
      pools.push({
        ...deposits[poolName],
        alias: poolName,
      });
    }
    return pools;
  }, [] as NamedRewardPool[]);
  return pools
    .map(
      (pool): AssetAmount => ({
        // Replace e.g. "fxKeeperUSD" => "fxUSD".
        symbol: pool.alias.replace("Keeper", ""),
        amount: bnToNumber(pool.userDeposited, DECIMALS),
      })
    )
    .filter((a) => a.amount > 0);
};
