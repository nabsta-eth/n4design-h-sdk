import { TokenInfo } from "..";
import { FxToken } from "../types/fxTokens";
import { HandleTokenManagerInstance } from "../components/token-manager/HandleTokenManager";

export const getFxTokensFromAddresses = (addresses: string[]): TokenInfo[] => {
  return HandleTokenManagerInstance.getTokensByAddresses(
    addresses.map((address) => ({ address }))
  );
};

export const getFxTokenSymbolFromAddress = (
  address: string,
  config: Record<string, string>
): string => {
  const keys = Object.keys(config);

  return keys.find((k) => {
    const symbol = k;
    return config[symbol].toLowerCase() === address.toLowerCase();
  })!;
};

export const getFxTokenByAddress = (
  fxTokens: FxToken[],
  address: string
): FxToken => {
  const fxToken = fxTokens.find(
    (fxToken) => fxToken.address.toLowerCase() === address.toLowerCase()
  );

  if (!fxToken) {
    throw new Error(`Could not find fxToken: ${address}`);
  }

  return fxToken;
};

export const getFxTokenBySymbol = (
  fxTokens: FxToken[],
  symbol: string
): FxToken => {
  const fxToken = fxTokens.find((fxToken) => fxToken.symbol === symbol);

  if (!fxToken) {
    throw new Error(`Could not find fxToken: ${symbol}`);
  }

  return fxToken;
};

export const isFxTokenSymbol = (symbol: string) =>
  symbol.length === 5 &&
  symbol.startsWith("fx") &&
  symbol.substring(2) === symbol.substring(2).toUpperCase();

/**
 * Returns the underlying fiat currency symbol for an fxToken.
 * Throws if the symbol is not an fxToken.
 * @param symbol The fxToken symbol.
 * @example getUnderlyingFxSymbol("fxAUD") // "AUD"
 */
export const getUnderlyingFxSymbol = (symbol: string) => {
  if (!isFxTokenSymbol(symbol)) {
    throw new Error("getFxTokenCurrency: invalid fxToken symbol");
  }
  return stripFx(symbol);
};

/**
 * Returns the underlying fiat currency symbol for an fxToken
 * @param symbol The fxToken symbol.
 * @example stripFx("fxAUD") // "AUD"
 */
export const stripFx = (symbol: string) => {
  if (isFxTokenSymbol(symbol)) {
    return symbol.slice(2);
  }
  return symbol;
};
