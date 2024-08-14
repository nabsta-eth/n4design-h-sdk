import { expect } from "chai";
import { formatUnits, parseUnits } from "ethers/lib/utils";
import { AMOUNT_DECIMALS, OpenInterest } from "../../../src/components/trade";
import { defaultTradePair } from "./utils";

describe("Trade: pair config", () => {
  it("should calculate the correct funding rate", () => {
    const pair = defaultTradePair({ baseSymbol: "ETH", quoteSymbol: "USD" });
    const openInterest = new OpenInterest(
      parseUnits("150000", AMOUNT_DECIMALS),
      parseUnits("50000", AMOUNT_DECIMALS)
    );
    pair.fundingFactor = parseUnits("1", AMOUNT_DECIMALS).div(50_000);
    pair.fundingExponent = parseUnits("1", AMOUNT_DECIMALS);
    const { long, short } = pair.getFundingRate(openInterest);
    expect(formatUnits(long, AMOUNT_DECIMALS)).to.eq("0.00001");
    expect(formatUnits(short, AMOUNT_DECIMALS)).to.eq("-0.00003");
  });
  it("should calculate the correct borrow rate", () => {
    const pair = defaultTradePair({ baseSymbol: "ETH", quoteSymbol: "USD" });
    const openInterest = new OpenInterest(
      parseUnits("100000", AMOUNT_DECIMALS),
      parseUnits("50000", AMOUNT_DECIMALS)
    );
    pair.borrowFeeFactor = parseUnits("1", AMOUNT_DECIMALS).div(1_000);
    pair.maxOpenInterestLong = parseUnits("100000", AMOUNT_DECIMALS);
    pair.maxOpenInterestShort = parseUnits("100000", AMOUNT_DECIMALS);
    const { long, short } = pair.getBorrowRate(openInterest);
    expect(formatUnits(long, AMOUNT_DECIMALS)).to.eq("0.001");
    expect(formatUnits(short, AMOUNT_DECIMALS)).to.eq("0.0005");
  });
});
