import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import {
  calculateMarketPrice,
  calculatePriceImpact,
} from "../../../src/components/trade/utils/priceImpact";
import { AMOUNT_DECIMALS } from "../../../src/components/trade";
import { defaultTradePairWithPriceImpact } from "../synths/utils";
import { BigNumber } from "ethers";
import { parseAmount } from "../../../src/components/trade/reader";

const openInterestLong = parseUnits("500", AMOUNT_DECIMALS);
const openInterestShort = parseUnits("400", AMOUNT_DECIMALS);
const indexPrice = parseUnits("2000", AMOUNT_DECIMALS);
const tradePair = defaultTradePairWithPriceImpact({
  quoteSymbol: "fxUSD",
  baseSymbol: "ETH",
});

function calculatePriceImpactDefault(
  orderSize: BigNumber,
  manualLongOi?: BigNumber,
  manualShortOi?: BigNumber
) {
  return calculatePriceImpact(
    manualLongOi || openInterestLong,
    manualShortOi || openInterestShort,
    indexPrice,
    tradePair.priceImpactFraction ?? parseUnits("0.00003", AMOUNT_DECIMALS),
    tradePair.skewScale ?? parseUnits("1000000", AMOUNT_DECIMALS),
    orderSize
  );
}

describe.only("price impact", () => {
  it("should calculate the spread correctly for long position", () => {
    // Given a long position of 1 lot
    const orderSize = parseUnits("1", AMOUNT_DECIMALS);
    // When the market is skewed at 100, then the premium before
    // (defined as the difference between the long and short open interest)
    // averaged with the premium after (defined as long OI + order size - short OI)
    // will be 0.0001005
    const spread = calculatePriceImpactDefault(orderSize);

    // Then after modulating the price by the price impact fraction
    // (set by default to 0.0030%), should be 2000.26100603
    expect(spread.toString()).to.eq(parseAmount("2000.26100603").toString());
  });

  it("should calculate the spread correctly for short position", () => {
    // Given a short position of 1 lot
    const orderSize = parseUnits("-1", AMOUNT_DECIMALS);
    // When the market is skewed at -100,
    // the average premium will be 0.0000995
    const spread = calculatePriceImpactDefault(orderSize);

    // Then after modulating the price by the price impact fraction
    // (set by default to 0.0030%), should be 2000.13899403
    expect(spread.toString()).to.eq(parseAmount("2000.13899403").toString());
  });

  it("should calculate the spread correctly for long position with order size of 80", () => {
    // Given a long position of 80 lots
    const orderSize = parseUnits("80", AMOUNT_DECIMALS);
    // Considering a market skewed at -100, the premium before
    // the average premium will be 0.00014
    const spread = calculatePriceImpactDefault(orderSize);

    // Then after modulating the price by the price impact fraction
    // (set by default to 0.0030%), should be 2000.3400084
    expect(spread.toString()).to.eq(parseAmount("2000.3400084").toString());
  });

  it("should calculate the spread correctly for short position with order size of 80", () => {
    // Given a short position of 80 lots
    const orderSize = parseUnits("-80", AMOUNT_DECIMALS);
    // When the market is skewed at -100
    // the average premium will be 0.00006
    const spread = calculatePriceImpactDefault(orderSize);

    // Then after modulating the price by the price impact fraction
    // (set by default to 0.0030%), should be 2000.0599964
    expect(spread.toString()).to.eq(parseAmount("2000.0599964").toString());
  });

  it("should calculate the spread correctly for long position with order size of 0", () => {
    // Given a position of undefined size, it should default to 1 LPC.
    // 1 LPC being defined as 1 whole unit of the other side of the pair,
    // in our case, 1 whole unit of fxUSD
    const orderSize = parseUnits("0", AMOUNT_DECIMALS);
    // Then the average premium will be 0.0001
    const spread = calculatePriceImpactDefault(orderSize);

    // Then after modulating the price by the price impact fraction
    // should be 2000.260006
    expect(spread.toString()).to.eq(parseAmount("2000.260006").toString());
  });

  it("should not return a negative price for giant positions", () => {
    // Given a position of 50,000,000 lots
    // When the market is skewed at 100
    const orderSize = parseUnits("50000000", AMOUNT_DECIMALS);
    // Then the average premium will be 25.01
    const price = calculatePriceImpactDefault(
      orderSize,
      parseUnits("10000", AMOUNT_DECIMALS),
      parseUnits("0", AMOUNT_DECIMALS)
    );

    // Then after modulating the price by the price impact fraction
    // should not be negative.
    // (this test is a response to a bug previoulsy encountered)
    expect(price.gt(0)).to.eq(true);
  });

  it("should not return a price that deviates more than 5 USD for a small order size", () => {
    // Given a position of 1 USD
    // When the market is skewed at 100
    const oneUsdInLots = parseUnits("1", AMOUNT_DECIMALS).div(indexPrice);
    // Then the average premium will be 0.0001
    const price = calculatePriceImpactDefault(oneUsdInLots);

    // Then after modulating the price by the price impact fraction
    // should not deviate more than 5 USD from the index price.
    // (this test is a response to a bug previoulsy encountered)
    expect(
      price.sub(indexPrice).abs().lt(parseUnits("5", AMOUNT_DECIMALS))
    ).to.eq(true);
  });

  it("if a market is skewed to the short side, the price should be lower than the index price", () => {
    // Given a position of 1 lot long
    const orderSize = parseUnits("1", AMOUNT_DECIMALS);
    // When the market is skewed at -100
    // Then the average premium will be -0.0000995
    const price = calculatePriceImpactDefault(
      orderSize,
      parseUnits("400", AMOUNT_DECIMALS),
      parseUnits("500", AMOUNT_DECIMALS)
    );

    // Then after modulating the price by the price impact fraction
    // should be lower than the index price, due to the negative premium
    expect(price.lt(indexPrice)).to.eq(true);
  });

  it("if a market is skewed to the long side, the price should be higher than the index price", () => {
    // Given a position of 1 lot long
    const orderSize = parseUnits("1", AMOUNT_DECIMALS);
    // When the market is skewed at 100
    // Then the average premium will be 0.0001005
    const price = calculatePriceImpactDefault(orderSize);

    // Then after modulating the price by the price impact fraction
    // should be higher than the index price, due to the positive premium
    expect(price.gt(indexPrice)).to.eq(true);
  });

  it.only("market price should be able to be calculated", () => {
    // When the market is skewed at 100
    // Given an order size of 0 (forcing the calculation of raw price skew)
    const marketPrice = calculateMarketPrice(
      openInterestLong,
      openInterestShort,
      indexPrice,
      parseUnits("1000000", AMOUNT_DECIMALS)
    );

    // Should return 2000.2 (index price + average premium)
    expect(marketPrice.toString()).to.eq(
      parseUnits("2000.2", AMOUNT_DECIMALS).toString()
    );
  });
});
