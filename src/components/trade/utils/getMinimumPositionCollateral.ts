import { BigNumber, ethers } from "ethers";
import { GetMinimumPositionCollateralArgs } from "../platforms/legacyInterface";

export const getMinimumPositionCollateral = (
  { isTriggerOrder, existingCollateral }: GetMinimumPositionCollateralArgs,
  liquidationFee: BigNumber,
  minimumTriggerOrder: BigNumber
): BigNumber => {
  const minForLiquidationFee = liquidationFee
    .sub(existingCollateral)
    .isNegative()
    ? ethers.constants.Zero
    : liquidationFee.sub(existingCollateral);

  if (isTriggerOrder) {
    return minimumTriggerOrder.gt(minForLiquidationFee)
      ? minimumTriggerOrder
      : minForLiquidationFee;
  }
  return minForLiquidationFee;
};
