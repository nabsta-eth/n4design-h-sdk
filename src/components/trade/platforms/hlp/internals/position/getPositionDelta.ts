import { BigNumber, ethers } from "ethers";
import { Position } from "../../../legacyInterface";
import { BASIS_POINTS_DIVISOR } from "../../../../../../constants";

export const getPositionDeltaForActualPosition = (
  indexPrice: BigNumber,
  position: Pick<
    Position,
    "size" | "collateral" | "isLong" | "averagePrice" | "lastIncreasedTime"
  >,
  minProfitTime: number,
  minProfitBasisPoints: number
) => {
  const { size, collateral, isLong, averagePrice, lastIncreasedTime } =
    position;
  const priceDelta = averagePrice.gt(indexPrice)
    ? averagePrice.sub(indexPrice)
    : indexPrice.sub(averagePrice);
  let delta = size.mul(priceDelta).div(averagePrice);
  const pendingDelta = delta;
  const minProfitExpired = lastIncreasedTime
    .add(minProfitTime)
    .lt(Math.floor(Date.now() / 1000));
  const hasProfit = isLong
    ? indexPrice.gt(averagePrice)
    : indexPrice.lt(averagePrice);
  const isDeltaTooLow = delta
    .mul(BASIS_POINTS_DIVISOR)
    .lte(size.mul(minProfitBasisPoints));
  if (!minProfitExpired && hasProfit && isDeltaTooLow) {
    delta = ethers.constants.Zero;
  }
  const deltaPercentage = delta.mul(BASIS_POINTS_DIVISOR).div(collateral);
  const pendingDeltaPercentage = pendingDelta
    .mul(BASIS_POINTS_DIVISOR)
    .div(collateral);
  return {
    delta,
    pendingDelta,
    pendingDeltaPercentage,
    hasProfit,
    deltaPercentage,
  };
};
