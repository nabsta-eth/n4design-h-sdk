import { RewardPoolData } from "../../../types/rewardPool";
import { AssetAmount } from "../index";
import { bnToNumber } from "../../../utils/general";

const REWARD_SYMBOL = "FOREX";

export const getRewards = (rewardPool: RewardPoolData): AssetAmount[] => {
  if (!rewardPool.account) {
    return [];
  }
  return [
    {
      symbol: REWARD_SYMBOL,
      amount: bnToNumber(rewardPool.account.claimableRewards, 18),
    },
  ];
};
