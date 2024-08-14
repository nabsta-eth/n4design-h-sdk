import {
  TradePairId,
  TradePair,
  TradeLpPriceFeed,
} from "../../../src/components/trade";
import { Pair } from "../../../src/types/trade";
import { testTokenList } from "../../mock-data/token-config";
import { pairToString } from "../../../src/utils/general";
import { BigNumber } from "ethers";
import { parseAmount } from "../../../src/components/trade/reader";

export const defaultTradePair = (pair: Pair, lpId = "1") =>
  new TradePair(
    new TradePairId(pair, lpId),
    BigNumber.from("0"),
    BigNumber.from("0"),
    BigNumber.from("0"),
    BigNumber.from("0"),
    BigNumber.from("0"),
    BigNumber.from("0"),
    BigNumber.from("0"),
    true,
    false,
    null,
    null,
    null,
    BigNumber.from("0"),
    BigNumber.from("0"),
    BigNumber.from("0"),
    {
      pair: pair,
    },
    false,
    null,
    null
  );

export const defaultTradePairWithPriceImpact = (pair: Pair, lpId = "1") => {
  const tradePair = defaultTradePair(pair, lpId);
  tradePair.usePriceImpact = true;
  tradePair.priceImpactFraction = parseAmount("0.00003");
  tradePair.skewScale = parseAmount("1000000");

  return tradePair;
};

export const underlyingToken = testTokenList.getTokenBySymbol(
  "fxUSD",
  "arbitrum"
);

export class MockPriceFeed implements TradeLpPriceFeed {
  public prices: Record<string, BigNumber> = {};

  getLatestPrice(pair: Pair): BigNumber {
    const price = this.prices[pairToString(pair)];
    if (price === undefined) {
      throw new Error(`Price for pair ${pairToString(pair)} not found`);
    }
    return price;
  }
  subscribe(): number {
    return 0;
  }
  unsubscribe(): void {
    return;
  }
}
