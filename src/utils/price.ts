import { TokenInfo } from "@uniswap/token-lists";
import axios from "axios";
import { BigNumber, ethers } from "ethers";
import config from "../config";
import { CHAIN_ID_TO_NETWORK_NAME } from "../constants";
import { Network } from "../types/network";
import { fetchApiQuote } from "../components/h2so/fetcher";
import { Pair } from "../types/trade";

type CoingeckoPriceResponse = Record<string, { usd: number }>;

export const getCoingeckoPrices = async (
  tokens: string[],
  network: Network
): Promise<Record<string, number | undefined>> => {
  if (tokens.length === 0) return {};

  const query = {
    contract_addresses: tokens.join(","),
    vs_currencies: "usd",
  };

  try {
    const { data } = await axios.get<CoingeckoPriceResponse>(
      `${config.coingecko.tokenPriceUrl}${config.coingecko.networkAlias[network]}`,
      { params: query }
    );

    return Object.entries(data).reduce((prev, current) => {
      return {
        ...prev,
        [current[0].toLowerCase()]: current[1].usd,
      };
    }, {});
  } catch (e) {
    // if there is an error, it shouldn't stop the quote by erroring, but no price can be used
    console.error(e);
    return {};
  }
};

/**
 * Gets the usd price of a token
 * @param token the token for which to get the usd value
 * @param feed the price feed instance
 * @returns the usd price of a token, or undefined if it cannot be fetched
 */
export const getUsdPrice = async (
  token: TokenInfo
): Promise<number | undefined> => {
  if (
    token.extensions?.isFxToken ||
    token.extensions?.isHlpToken ||
    token.extensions?.isNative
  ) {
    try {
      const pair: Pair = {
        baseSymbol: token.symbol,
        quoteSymbol: "USD",
      };
      const price = await fetchApiQuote(pair, false).then((v) => v.data.result);
      return price / 1e8;
    } catch (e) {
      // this will leave price as undefined on error
      console.error(e);
      return;
    }
  } else {
    const response = await getCoingeckoPrices(
      [token.address],
      CHAIN_ID_TO_NETWORK_NAME[token.chainId]
    );
    return response[token.address.toLowerCase()];
  }
};

/**
 * Gets the usd value for an amount of a token
 * @param token the token for which to get the usd value
 * @param amount the amount of token for which to get the value of
 * @returns the usd value of the amount of token, or undefined if a price cannot be fetched
 */
export const getUsdValue = async (
  token: TokenInfo,
  amount: BigNumber
): Promise<number | undefined> => {
  const price = await getUsdPrice(token);
  if (!price) return;

  const precision = 1e10; // 10 decimal places
  const adjustedAmount = amount
    .mul(precision)
    .div(ethers.utils.parseUnits("1", token.decimals));
  return (+adjustedAmount * price) / precision;
};

/**
 * Returns the usd value difference as a ratio.
 * @param usdValueIn the usd value initially
 * @param usdValueOut the usd value output
 * @returns usd value difference as a ratio
 */
export const getPriceImpact = (usdValueIn: number, usdValueOut: number) =>
  1 - usdValueOut / usdValueIn;
