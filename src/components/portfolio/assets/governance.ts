import { PortfolioGovernance } from "..";
import config from "../../../config";
import { getData } from "../../governance";
import { bnToNumber } from "../../../utils/general";

export const fetchGovernance = async (
  account: string
): Promise<PortfolioGovernance> => {
  const data = await getData(account);
  const now = Math.floor(Date.now() / 1000);
  const isLocked = data.account && data.account.unlocksAt.toNumber() > now;
  return {
    lock: !isLocked
      ? null
      : {
          tokenSymbol: config.lp.arbitrum.balancerFxUsdForex.lpToken.symbol,
          tokenAmount: bnToNumber(data.account!.forexLocked, 18),
          untilDate: data.account!.unlocksAt.toNumber(),
          veForexBalance: bnToNumber(data.account!.veForexBalance, 18),
        },
  };
};
