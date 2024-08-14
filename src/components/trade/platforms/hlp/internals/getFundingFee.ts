import { BigNumber } from "ethers";
import { FUNDING_RATE_PRECISION } from "../config";

export const getFundingFee = (
  positionSize: BigNumber,
  entryFundingRate: BigNumber,
  cumulativeFundingRate: BigNumber
): BigNumber =>
  positionSize
    .mul(cumulativeFundingRate.sub(entryFundingRate))
    .div(FUNDING_RATE_PRECISION);
