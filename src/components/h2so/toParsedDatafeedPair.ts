import { Pair } from "../../types/trade";
import { pairFromString } from "../../utils/general";

/**
 * Parses a pair, in the context of hLP trade pair (quoted in USD), into an
 * H2SO pair by converting fxTokens into their respective fiat currency symbols
 * and WETH into ETH.
 * @example toParsedDatafeedPair("fxAUD") === "AUD/USD"
 * @example toParsedDatafeedPair("WETH") === "ETH/USD"
 * @param baseSymbol The base token symbol to get a parsed data feed pair for
 * @param quoteSymbol The quote token symbol to get a parsed data feed pair for
 * @returns The parsed pair string for the data feed server
 */
export const toParsedDatafeedPair = ({
  quoteSymbol,
  baseSymbol,
}: Pair): Pair => {
  // Converts fxTokens to their currency pair, also parsing WETH to ETH.
  let [base, quote] = [baseSymbol, quoteSymbol].map(toParsedDataFeedSymbol);
  // If base symbol is USD, api expects base symbol to be fx token
  if (base === "USD" && quoteSymbol === "USD") base = "fxUSD";
  return pairFromString(`${base}/${quote}`);
};

export const toParsedDataFeedSymbol = (symbol: string) =>
  symbol.startsWith("fx")
    ? symbol.substring(2)
    : symbol.replace(/weth/gi, "ETH");

/// Reverses toParseDatafeedPair.
export const fromParsedDataFeedPair = (pair: Pair): Pair => {
  if (pair.baseSymbol.includes("USD") && pair.quoteSymbol.includes("USD"))
    return pair;
  let { baseSymbol, quoteSymbol } = pair;
  baseSymbol = fromParsedDataFeedSymbol(baseSymbol);
  quoteSymbol = fromParsedDataFeedSymbol(quoteSymbol);
  return pairFromString(`${baseSymbol}/${quoteSymbol}`);
};

/// Reverses toParseDataFeedSymbol.
export const fromParsedDataFeedSymbol = (symbol: string) => {
  if (symbol.includes("ETH")) return "WETH";
  return !symbol.startsWith("fx") && symbol !== "USD" ? `fx${symbol}` : symbol;
};
