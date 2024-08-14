import { BigNumber } from "ethers";
import { AMOUNT_UNIT } from "../reader";

export const calculatePriceImpact = (
  openInterestLong: BigNumber,
  openInterestShort: BigNumber,
  indexPrice: BigNumber,
  priceImpactFraction: BigNumber,
  skewScale: BigNumber,
  orderSize: BigNumber
): BigNumber => {
  if (orderSize.isNegative()) {
    // If selling, the spread should be negated so that the price is lower.
    priceImpactFraction = priceImpactFraction.abs().mul(BigNumber.from(-1));
  }
  const premiumAverage = calculateAveragePremium(
    openInterestLong,
    openInterestShort,
    orderSize,
    skewScale
  );
  const executionPrice = indexPrice.add(
    indexPrice.mul(premiumAverage).div(AMOUNT_UNIT)
  );

  return modulatePriceByFixedFraction(executionPrice, priceImpactFraction);
};

export const calculateMarketPrice = (
  openInterestLong: BigNumber,
  openInterestShort: BigNumber,
  indexPrice: BigNumber,
  skewScale: BigNumber
): BigNumber => {
  const premiumAverage = calculateAveragePremium(
    openInterestLong,
    openInterestShort,
    BigNumber.from(0),
    skewScale
  );

  return indexPrice.add(indexPrice.mul(premiumAverage).div(AMOUNT_UNIT));
};

function calculateAveragePremium(
  openInterestLong: BigNumber,
  openInterestShort: BigNumber,
  orderSize: BigNumber,
  skewScale: BigNumber
) {
  const numeratorBefore = openInterestLong.sub(openInterestShort);
  const premiumBefore = numeratorBefore.mul(AMOUNT_UNIT).div(skewScale);

  const numeratorAfter = openInterestLong.add(orderSize).sub(openInterestShort);
  const premiumAfter = numeratorAfter.mul(AMOUNT_UNIT).div(skewScale);
  const premiumAverage = premiumBefore.add(premiumAfter).div(2);

  return premiumAverage;
}

function modulatePriceByFixedFraction(
  price: BigNumber,
  fraction: BigNumber
): BigNumber {
  return price.add(price.mul(fraction).div(AMOUNT_UNIT));
}
