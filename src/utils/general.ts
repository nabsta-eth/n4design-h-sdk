import { BigNumber, ethers } from "ethers";
import { Provider } from "@ethersproject/providers";
import { CHAIN_ID_TO_NETWORK_NAME } from "../constants";
import { Network } from "../types/network";
import { Pair } from "../types/trade";
import {
  MarketPrice as LegacyMarketPrice,
  PRICE_UNIT as LEGACY_PRICE_UNIT,
} from "../components/trade/platforms/legacyInterface";
import { HandleTokenManagerInstance } from "../components/token-manager/HandleTokenManager";

export type SignerOrProvider = ethers.Signer | ethers.providers.Provider;

export const getDeadline = (deadline?: number) =>
  deadline ?? getCurrentUnixTimestamp() + 300;

export const getCurrentUnixTimestamp = (): number =>
  Math.floor(Date.now() / 1000);

/**
 * Adjusts a BigNumber by the difference between the current and desired decimals
 * @param value The value to transform
 * @param fromDecimals the current decimals of the number
 * @param toDecimals the desired decimals of the number
 * @returns the transformed value
 */
export const transformDecimals = (
  value: BigNumber,
  fromDecimals: number,
  toDecimals: number
) => {
  const TEN = BigNumber.from(10);
  if (fromDecimals < toDecimals) {
    return value.mul(TEN.pow(toDecimals - fromDecimals));
  }
  if (fromDecimals > toDecimals) {
    return value.div(TEN.pow(fromDecimals - toDecimals));
  }
  return value;
};

export function mustExist<Type>(
  value: Type | undefined | null,
  name: string
): Type {
  if (value == null) {
    throw new Error(`mustExist: "${name}" does not exist`);
  }
  return value;
}

export const getNetworkFromSignerOrProvider = async (
  signerOrProvider: SignerOrProvider
): Promise<Network> => {
  const provider = Provider.isProvider(signerOrProvider)
    ? signerOrProvider
    : mustExist(signerOrProvider.provider, "Provider on signer");

  const chainId = (await provider.getNetwork()).chainId;
  return CHAIN_ID_TO_NETWORK_NAME[chainId];
};

export const pairToString = (pair: Pair): string =>
  `${pair.baseSymbol}/${pair.quoteSymbol}`;

export const pairsToStringCsv = (pairs: Pair[]): string =>
  pairs.map(pairToString).join(",");

export const pairFromString = (value: string): Pair => {
  const split = value.split("/");
  if (split.length !== 2)
    throw new Error(`Pair is not in the format of "BASE/QUOTE"`);
  return {
    baseSymbol: split[0],
    quoteSymbol: split[1],
  };
};

export const pairToBaseTokenAddress = (
  pair: Pair,
  network: Network = "arbitrum"
): string =>
  HandleTokenManagerInstance.getTokenBySymbol(pair.baseSymbol, network).address;

export const pairToQuoteTokenAddress = (
  pair: Pair,
  network: Network = "arbitrum"
): string =>
  HandleTokenManagerInstance.getTokenBySymbol(pair.quoteSymbol, network)
    .address;

export const getUsdQuotedPair = (baseSymbol: string): Pair => ({
  baseSymbol,
  quoteSymbol: "USD",
});

export const isSamePair = (a: Pair, b: Pair): boolean =>
  a.baseSymbol === b.baseSymbol && a.quoteSymbol === b.quoteSymbol;

export const getReversedPair = (pair: Pair): Pair => ({
  baseSymbol: pair.quoteSymbol,
  quoteSymbol: pair.baseSymbol,
});

/**
 * Reverses a market price or legacy market price object by calculating the
 * inverse of its index, best ask, and best bid values. If the input is a
 * legacy market price object, the calculation is done using `BigNumber` with
 * `LEGACY_PRICE_UNIT` precision.
 * @param price The market price or legacy market price object to reverse
 * @returns The reversed market price or legacy market price object
 */
export const getReversedMarketPriceLegacy = (
  price: LegacyMarketPrice
): LegacyMarketPrice => {
  return {
    index: LEGACY_PRICE_UNIT.pow(2).div(price.index),
    bestAsk: LEGACY_PRICE_UNIT.pow(2).div(price.bestBid),
    bestBid: LEGACY_PRICE_UNIT.pow(2).div(price.bestAsk),
  };
};

export const getReversedPrice = (price: BigNumber): BigNumber =>
  price.gt(0) ? LEGACY_PRICE_UNIT.pow(2).div(price) : price;

/**
 * @param percentage the percent to be turned to bps
 * @example percentageToBasisPoints(1) // 100
 */
export const percentageToBasisPoints = (percentage: number) =>
  Math.floor(percentage * 100);

export const removeArrayDuplicates = <T>(array: T[]): T[] => [
  ...new Set(array),
];

export const allSettledResults = async <T>(
  promises: Promise<T>[]
): Promise<T[]> =>
  (await Promise.allSettled(promises))
    .filter((result) => result.status === "fulfilled")
    .map((result) => (result as PromiseFulfilledResult<T>).value);

export const bnToNumber = (bn: BigNumber, decimals: number): number =>
  +ethers.utils.formatUnits(bn, decimals);

export const isSameAddress = (
  a: string | undefined | null,
  b: string | undefined | null
) =>
  !!(
    a &&
    b &&
    ethers.utils.isAddress(a) &&
    ethers.utils.isAddress(b) &&
    a.toLowerCase() === b.toLowerCase()
  );

export const replaceWrappedSymbolForNative = (symbol: string) =>
  symbol === "WETH" ? "ETH" : symbol;
