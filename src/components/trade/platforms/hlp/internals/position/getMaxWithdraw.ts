import { Position } from "../../../legacyInterface";
import { HlpConfig } from "../../config";
import { ethers } from "ethers";

export const getMaxWithdraw = (
  position: Position,
  config: Pick<HlpConfig, "liquidationFee">,
  maxDisplayLeverage: number
) => {
  // calculate the collateral required for max leverage
  const collateralForMaxLeverage = config
    ? position.size.div(maxDisplayLeverage)
    : ethers.constants.Zero;

  // calculate the withdraw required to meet this collateral. Withdraw already is usd, no conversion is needed
  const grossAmount = position.collateral.sub(collateralForMaxLeverage);
  const maxWithdrawForLeverage = position.hasProfit
    ? grossAmount.add(position.delta)
    : grossAmount.sub(position.delta);

  // The max withdraw cannot leave the position with less collateral than withdraw fee
  const maxWithdrawForFee = position.collateral.sub(
    config?.liquidationFee ?? 0
  );

  let maxWithdraw = maxWithdrawForLeverage.lt(maxWithdrawForFee)
    ? maxWithdrawForLeverage
    : maxWithdrawForFee;
  if (maxWithdraw.lt(0)) maxWithdraw = ethers.constants.Zero;

  return maxWithdraw;
};
