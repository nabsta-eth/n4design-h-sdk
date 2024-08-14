import { BigNumber } from "ethers";

export const getNextAveragePrice = (
  size: BigNumber,
  sizeDelta: BigNumber,
  existingDelta: BigNumber,
  hasProfit: boolean,
  isLong: boolean,
  markPrice: BigNumber,
  existingAveragePrice: BigNumber
): BigNumber => {
  // If the position is empty, the average price is the mark price.
  if (size.eq(0)) return markPrice;
  // If there is no increase, the average price has not changed.
  if (sizeDelta.eq(0)) return existingAveragePrice;
  const nextSize = size.add(sizeDelta);
  let divisor;
  if (isLong) {
    divisor = hasProfit
      ? nextSize.add(existingDelta)
      : nextSize.sub(existingDelta);
  } else {
    divisor = hasProfit
      ? nextSize.sub(existingDelta)
      : nextSize.add(existingDelta);
  }
  if (divisor.eq(0)) throw new Error("Division by zero");
  return markPrice.mul(nextSize).div(divisor);
};
