import { BigNumber } from "ethers";
import { DATA_FEED_PRICE_DECIMALS } from "../../../../../config";
import {
  BASIS_POINTS_DIVISOR,
  H2SO_PRICE_DECIMALS,
} from "../../../../../constants";
import { config } from "../../../../../index";
import { Network } from "../../../../../types/network";
import { Pair, PairStringified } from "../../../../../types/trade";
import {
  allSettledResults,
  getReversedMarketPriceLegacy,
  isSamePair,
  pairToString,
  transformDecimals,
} from "../../../../../utils/general";
import { fetchTimedEncodedSignedQuotes } from "../../../../h2so";
import { EncodedSignedQuote, fetchApiQuote } from "../../../../h2so/fetcher";
import {
  fromParsedDataFeedPair,
  toParsedDatafeedPair,
} from "../../../../h2so/toParsedDatafeedPair";
import { HandleTokenManagerInstance } from "../../../../token-manager/HandleTokenManager";
import {
  MarketPrice,
  NumericSpread,
  PRICE_DECIMALS,
} from "../../legacyInterface";
import {
  DEFAULT_HLP_NETWORK,
  getActualHlpPairIfReversed,
  getReversedHlpPairIfApplicable,
  shouldHlpPairBeReversed,
} from "../config";
import { getTokenSpreadBasisPoints } from "./getTokenSpreadBasisPoints";
import { TradePairHlp, getTradePairHlpFromPair } from "./tokens";

export type SignedPrices = [EncodedSignedQuote, ...MarketPrice[]];

/**
 * Gets a signed H2SO quote for all the input pairs and calculates the
 * price spread for each pair.
 * The prices follow the pair, returning the price of the base symbol
 * quoted against the quote symbol.
 * One of the symbols in each pair must be USD.
 * @example const [{ encoded }, aud] = await getQuotedPrices(pairFromString("AUD/USD"));
 */
export const getSignedPrices = async (
  pairs: Pair[],
  network: Network = DEFAULT_HLP_NETWORK
): Promise<SignedPrices> => {
  const provider = config.providers[network];
  // Map pairs to "actual" pairs, in case any of the inputs are reversed.
  const usdQuotedPairs = pairs.map(getActualHlpPairIfReversed);
  // Fetch H2SO quote, waiting (if needed) for the quote to become valid.
  const quote = await fetchTimedEncodedSignedQuotes(usdQuotedPairs, provider);
  // Calculate the spread for each token.
  const baseTokenAddresses = usdQuotedPairs.map(
    (pair) =>
      HandleTokenManagerInstance.getTokenBySymbol(
        fromParsedDataFeedPair(pair).baseSymbol,
        network
      ).address
  );
  const spreads = await Promise.all(
    baseTokenAddresses.map((token) =>
      getTokenSpreadBasisPoints({
        tokenAddress: token,
      })
    )
  );
  const spreadPrices: MarketPrice[] = quote.decoded.map(
    ({ signatureParams: { value } }, i) => {
      const price = transformDecimals(
        value,
        H2SO_PRICE_DECIMALS,
        PRICE_DECIMALS
      );
      let marketPrice = {
        index: price,
        bestBid: getSpreadPrice(value, spreads[i], false),
        bestAsk: getSpreadPrice(value, spreads[i], true),
      };
      if (pairs[i].baseSymbol === "USD")
        marketPrice = getReversedMarketPriceLegacy(marketPrice);
      return marketPrice;
    }
  );
  return [quote, ...spreadPrices];
};

/**
 * Gets (unsigned) H2SO prices for all the input pairs and calculates the
 * price spread for each pair, transforming prices to 30 decimals.
 * For hLP, all pairs must be quoted by USD.
 * If a price is not found, it is not included in the returned map.
 * @example const [aud] = await getUnsignedPrices(pairFromString("AUD/USD"));
 * @returns Mapping from stringified pair to the market price.
 */
export const getUnsignedPrices = async (
  pairs: Pair[],
  network: Network = DEFAULT_HLP_NETWORK
): Promise<Record<PairStringified, MarketPrice | undefined>> =>
  allSettledResults(
    pairs.map(async (pair) => fetchUnsignedMarketPriceForPair(pair, network))
  ).then(mapPriceArrayToDictionary);

export const fetchUnsignedMarketPriceForPair = async (
  pair: Pair,
  network: Network = DEFAULT_HLP_NETWORK
): Promise<{ pair: PairStringified; marketPrice: MarketPrice }> => {
  const actualPair = getActualHlpPairIfReversed(pair);
  const tokenAddress = HandleTokenManagerInstance.getTokenBySymbol(
    actualPair.baseSymbol,
    network
  ).address;
  const [price, spreadBasisPoints] = await Promise.all([
    await fetchApiQuote(actualPair).then((v) => v.data.result),
    getTokenSpreadBasisPoints({ tokenAddress }),
  ]);
  const priceBn = transformDecimals(
    BigNumber.from(price),
    H2SO_PRICE_DECIMALS,
    PRICE_DECIMALS
  );
  let marketPrice = {
    index: priceBn,
    bestAsk: getSpreadPrice(BigNumber.from(price), spreadBasisPoints, true),
    bestBid: getSpreadPrice(BigNumber.from(price), spreadBasisPoints, false),
  };
  if (!isSamePair(actualPair, pair))
    marketPrice = getReversedMarketPriceLegacy(marketPrice);
  return {
    pair: pairToString(pair),
    marketPrice,
  };
};

const mapPriceArrayToDictionary = (
  prices: Array<{ pair: PairStringified; marketPrice: MarketPrice }>
): Record<PairStringified, MarketPrice | undefined> =>
  prices.reduce(
    (object, price) => ({
      ...object,
      [price.pair]: price.marketPrice,
    }),
    {} as Record<string, MarketPrice | undefined>
  );

export const applySpread = (
  pair: TradePairHlp,
  oraclePrice: BigNumber
): NumericSpread => {
  // The maximum spread is used for both as hLP spread is symmetric.
  const {
    spreadBps: { maximum: spread },
  } = pair;
  return {
    maximum: getSpreadPrice(oraclePrice, spread, true),
    minimum: getSpreadPrice(oraclePrice, spread, false),
  };
};

const getSpreadPrice = (
  oraclePrice: BigNumber,
  spread: BigNumber,
  maximise: boolean
) => {
  const price = transformDecimals(
    oraclePrice,
    DATA_FEED_PRICE_DECIMALS,
    PRICE_DECIMALS
  );
  const multiplier = getSpreadMultiplierBps(spread, maximise);
  return price.mul(multiplier).div(BASIS_POINTS_DIVISOR);
};

export const getSpreadMultiplierBps = (
  spreadBps: BigNumber,
  maximise: boolean
): BigNumber =>
  maximise
    ? spreadBps.add(BASIS_POINTS_DIVISOR)
    : spreadBps.mul(-1).add(BASIS_POINTS_DIVISOR);

const symbolToAddressCache: Record<string, string | undefined> = {};

/**
 * Maps an h2so datafeed pair and index price to an hLP pair
 * and MarketPrice object.
 */
const getMarketPriceFromH2soIndex = (
  dataFeedPair: Pair,
  indexPrice: BigNumber,
  reversePriceIfApplicable = true
): { marketPrice: MarketPrice; pair: Pair } => {
  // The actual hLP pair, i.e. must not be reversed, even if the pair
  // is configured to be when facing the user.
  const pair = fromParsedDataFeedPair(dataFeedPair);
  if (!symbolToAddressCache[pair.baseSymbol])
    symbolToAddressCache[pair.baseSymbol] =
      HandleTokenManagerInstance.getTokenBySymbol(
        pair.baseSymbol,
        DEFAULT_HLP_NETWORK
      ).address;
  // Potentially reverse the pair, e.g. from fxJPY/USD to USD/fxJPY.
  const pairParsed = getReversedHlpPairIfApplicable(pair);
  const tradePair = getTradePairHlpFromPair(pairParsed);
  const { maximum, minimum } = applySpread(tradePair, indexPrice);
  let marketPrice: MarketPrice = {
    index: transformDecimals(indexPrice, H2SO_PRICE_DECIMALS, PRICE_DECIMALS),
    bestBid: minimum,
    bestAsk: maximum,
  };
  if (reversePriceIfApplicable && shouldHlpPairBeReversed(pair))
    marketPrice = getReversedMarketPriceLegacy(marketPrice);
  return { marketPrice, pair: pairParsed };
};

export const getHlpMarketPriceFromIndex = (
  pair: Pair,
  indexPrice: BigNumber
): MarketPrice => {
  const dataFeedPair = toParsedDatafeedPair(getActualHlpPairIfReversed(pair));
  const { marketPrice } = getMarketPriceFromH2soIndex(
    dataFeedPair,
    transformDecimals(indexPrice, PRICE_DECIMALS, H2SO_PRICE_DECIMALS),
    false
  );
  return marketPrice;
};
