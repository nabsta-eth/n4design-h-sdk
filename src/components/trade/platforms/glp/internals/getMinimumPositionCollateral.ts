import { BigNumber } from "ethers";
import { GetMinimumPositionCollateralArgs } from "../../legacyInterface";
import { getMinimumPositionCollateral } from "../../../utils/getMinimumPositionCollateral";
import { LIQUIDATION_FEE_USD, MIN_PURCHASE_AMOUNT_USD } from "../config";

export const getMinimumPositionCollateralGlp = (
  args: GetMinimumPositionCollateralArgs
): BigNumber => {
  return getMinimumPositionCollateral(
    args,
    LIQUIDATION_FEE_USD,
    MIN_PURCHASE_AMOUNT_USD
  );
};
