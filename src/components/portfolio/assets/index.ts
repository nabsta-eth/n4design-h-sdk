import { PortfolioAssets } from "../index";
import { fetchHlpStaking } from "./hlpStaking";
import { getKeeperStaking } from "./keeperStaking";
import { fetchGovernance } from "./governance";
import { Vault } from "../../../types/vaults";
import { getCdpCollateral } from "./cdpCollateral";
import { RewardPoolData } from "../../../types/rewardPool";

export const fetchPortfolioAssets = async (
  account: string,
  vaults: Vault[],
  rewardPool: RewardPoolData
): Promise<PortfolioAssets> => {
  const [hlp, governance] = await Promise.all([
    fetchHlpStaking(account),
    fetchGovernance(account),
  ]);
  return {
    staking: {
      hlp,
      keeper: getKeeperStaking(rewardPool),
    },
    governance,
    collateral: {
      cdp: getCdpCollateral(vaults),
    },
    // TODO
    tradeProfits: [],
  };
};
