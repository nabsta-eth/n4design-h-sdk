import { AssetAmount } from "../index";
import { getClaimAmount } from "../../rebates";
import { Network } from "../../../types/network";
import { bnToNumber } from "../../../utils/general";

const NETWORK: Network = "arbitrum";

export const fetchRebates = async (account: string): Promise<AssetAmount[]> => {
  const claimable = await getClaimAmount(account, NETWORK);
  return [
    {
      symbol: "FOREX",
      amount: bnToNumber(claimable, 18),
    },
  ];
};
