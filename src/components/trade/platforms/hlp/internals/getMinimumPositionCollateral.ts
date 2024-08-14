import { BigNumber } from "ethers";
import { config } from "..";
import { GetMinimumPositionCollateralArgs } from "../../legacyInterface";
import { getMinimumPositionCollateral } from "../../../utils/getMinimumPositionCollateral";
import {
  DEFAULT_HLP_NETWORK,
  getMinimumTokenPurchaseAmountUsd,
} from "../config";

export const getMinimumPositionCollateralHlp = (
  args: GetMinimumPositionCollateralArgs
): BigNumber => {
  const liquidationFee = config.get(DEFAULT_HLP_NETWORK).liquidationFee;
  const minimumOrderAmount = getMinimumTokenPurchaseAmountUsd();
  return getMinimumPositionCollateral(args, liquidationFee, minimumOrderAmount);
};
