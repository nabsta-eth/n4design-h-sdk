import { PortfolioIncome } from "../index";
import { RewardPoolData } from "../../../types/rewardPool";
import { getRewards } from "./rewards";
import { fetchKeeperGains } from "./keeperGains";
import { fetchRebates } from "./rebates";

export const fetchPortfolioIncome = async (
  account: string,
  rewardPoolData: RewardPoolData
): Promise<PortfolioIncome> => {
  const [keeperGains, rebates] = await Promise.all([
    fetchKeeperGains(account),
    fetchRebates(account),
  ]);
  return {
    rewards: getRewards(rewardPoolData),
    keeperGains,
    rebates,
    // TODO categorisation related to rebates
    referrals: [],
    // TODO
    tradeProfits: [],
  };
};
