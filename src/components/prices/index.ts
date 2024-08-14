import { BigNumber, ethers } from "ethers";
import config, { TokenSymbolToChainlinkUsdFeedAddress } from "../../config";
import { ChainlinkAggregator__factory } from "../../contracts";
import { H2SO_PRICE_DECIMALS, NETWORK_NAME_TO_CHAIN_ID } from "../../constants";
import { isFxTokenSymbol, stripFx } from "../../utils/fxToken";
import * as coingecko from "../prices/sources/coingecko";
import { formatUnits, parseUnits } from "ethers/lib/utils";
import { FxTokenSymbol } from "../../types/fxTokens";
import {
  getUsdQuotedPair,
  replaceWrappedSymbolForNative,
  transformDecimals,
} from "../../utils/general";
import { TokenInfo } from "@uniswap/token-lists";
import { hlp } from "../trade/platforms";
import { PriceFeed } from "../h2so/feed";
import { fetchApiQuote } from "../h2so/fetcher";

type PricePoint = {
  date: number;
  price: number;
};

type PricesConfig = {
  feeds: TokenSymbolToChainlinkUsdFeedAddress;
  chainId: number;
};

const CONFIG: PricesConfig = {
  feeds: config.protocol.arbitrum.chainlinkFeeds,
  chainId: NETWORK_NAME_TO_CHAIN_ID.arbitrum,
};

const fetchEthUsdPrice = async (
  signer?: ethers.Signer
): Promise<{ bn: BigNumber; number: number }> => {
  const aggregator = ChainlinkAggregator__factory.connect(
    CONFIG.feeds.ETH,
    signer ?? config.providers.arbitrum
  );
  const bn = await aggregator.latestAnswer();
  const number = chainlinkPriceToNumber(bn);
  return {
    bn,
    number,
  };
};

export type FxTokenPriceMap = Record<
  FxTokenSymbol,
  { bn: BigNumber; number: number }
>;

/**
 * Returns the prices for all fxTokens in USD, using the
 * official Chainlink feed.
 * These prices are used for the CDP vaults.
 */
const fetchFxTokenTargetChainlinkUsdPrices =
  async (): Promise<FxTokenPriceMap> => {
    const fxTokenSymbols = Object.keys(CONFIG.feeds).filter((key) =>
      isFxTokenSymbol(key)
    );
    const calls = fxTokenSymbols
      // Remove fxUSD as it is a constant (one).
      .filter((symbol) => symbol !== "fxUSD")
      .map(fetchFxTokenTargetChainlinkUsPrice);
    const response: BigNumber[] = await Promise.all(calls);
    const result = response.reduce((progress, bn: BigNumber, index) => {
      return {
        ...progress,
        [fxTokenSymbols[index]]: {
          bn,
          number: chainlinkPriceToNumber(bn),
        },
      };
    }, {} as FxTokenPriceMap);
    return {
      ...result,
      fxUSD: {
        bn: parseUnits("1", H2SO_PRICE_DECIMALS),
        number: 1,
      },
    };
  };

const fetchFxTokenTargetChainlinkUsPrice = (
  symbol: FxTokenSymbol
): Promise<BigNumber> =>
  ChainlinkAggregator__factory.connect(
    CONFIG.feeds[symbol],
    config.providers.arbitrum
  ).latestAnswer();

const chainlinkPriceToNumber = (price: BigNumber): number =>
  +formatUnits(price, 8);

/// Tries to fetch a price, from any source available, for a token symbol.
/// Allows passing an optional TokenInfo, which makes it more likely the
/// price will be found, specially if the token is a non-handle token.
export const fetchTokenPriceUsd = async (
  symbol: string,
  token?: TokenInfo,
  feed?: PriceFeed
): Promise<BigNumber | null> => {
  const pair = getUsdQuotedPair(replaceWrappedSymbolForNative(stripFx(symbol)));
  // If the pair is USD/USD, return one.
  if (pair.baseSymbol === pair.quoteSymbol) {
    return parseUnits("1", H2SO_PRICE_DECIMALS);
  }
  // First, try to fetch from the pre-cached H2SO feed.
  if (feed) {
    try {
      return feed.getLatestPrice(pair);
    } catch (_) {}
  }
  // Then, try to fetch from the uncached H2SO API.
  try {
    const response = await fetchApiQuote(pair, false);
    const apiQuotePrice = BigNumber.from(String(response.data.result));
    return apiQuotePrice;
  } catch (_) {}
  if (isFxTokenSymbol(symbol)) {
    // The fxToken was not present in H2SO. Use the Chainlink price.
    try {
      return await fetchFxTokenTargetChainlinkUsPrice(symbol);
    } catch (_) {}
  }
  // If ETH, fetch from the official Chainlink oracle on Arbitrum One,
  // if it could not be fetched from H2SO.
  if (symbol.toUpperCase() === "ETH" || symbol.toUpperCase() === "WETH") {
    try {
      return await fetchEthUsdPrice().then((response) => response.bn);
    } catch (_) {}
  }
  // If the hLP token, fetch via the hlp module.
  if (isHlpToken(symbol, token)) {
    try {
      return await hlp.internals
        .getHlpPrice()
        .then((price) =>
          transformDecimals(price.maximum, 30, H2SO_PRICE_DECIMALS)
        );
    } catch (_) {}
  }
  return null;
};

export const isHlpToken = (symbol: string, token?: TokenInfo): boolean => {
  const isSymbolCorrect = symbol.toLowerCase().endsWith("hlp");
  if (!isSymbolCorrect) {
    return false;
  }
  if (!token) {
    // Only consider the symbol check, as the token is not available.
    return true;
  }
  return !!token.extensions?.isLiquidityToken;
};

export { coingecko, fetchEthUsdPrice, fetchFxTokenTargetChainlinkUsdPrices };

export type { PricePoint };
