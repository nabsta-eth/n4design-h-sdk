import { AssetAmount } from "..";
import { getRewardPoolContract } from "../../../utils/contract";
import { bnToNumber } from "../../../utils/general";
import { SHLP_POOL_ID } from "../../rewards";

const DECIMALS = 18;

export const fetchHlpStaking = async (
  account: string
): Promise<AssetAmount> => {
  const deposit = await getRewardPoolContract().getDeposit(
    account,
    SHLP_POOL_ID
  );
  return {
    symbol: "shLP",
    amount: bnToNumber(deposit.amount, DECIMALS),
  };
};
