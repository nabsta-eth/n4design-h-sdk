import { TokenInfo } from "@uniswap/token-lists";
import { BigNumber } from "ethers";
import glpTokenList from "../../../../../config/token-lists/glp-tokens.json";
import { validateTokenList } from "../../../../../utils/tokenlist";
import TokenManager, { getNativeTokenInfo } from "../../../../token-manager";
import {
  GetCollateralTokensArgs,
  TradePairInternal,
} from "../../legacyInterface";
import { isEtherAddress } from "../../../utils";
import { GLP_NETWORK } from "../config";

export type TokenInfoGlp = TokenInfo & {
  extensions: {
    isUsdg?: boolean;
    isNative?: boolean;
    isWrappedNative?: boolean;
    isShortable?: boolean;
    isStable?: boolean;
  };
};

export type GlpToken = TokenInfoGlp & {
  hasMaxAvailableLong?: boolean;
  hasMaxAvailableShort?: boolean;
  usdgAmount?: BigNumber;
  maxUsdgAmount?: BigNumber;
  poolAmount?: BigNumber;
  bufferAmount?: BigNumber;
  managedAmount?: BigNumber;
  managedUsd?: BigNumber;
  availableAmount?: BigNumber;
  availableUsd?: BigNumber;
  guaranteedUsd?: BigNumber;
  redemptionAmount?: BigNumber;
  reservedAmount?: BigNumber;
  balance?: BigNumber;
  weight?: BigNumber;
  maxPrice?: BigNumber;
  maxPrimaryPrice?: BigNumber;
  minPrice?: BigNumber;
  minPrimaryPrice?: BigNumber;
  contractMaxPrice?: BigNumber;
  contractMinPrice?: BigNumber;
  cumulativeFundingRate?: BigNumber;
  fundingRate?: BigNumber;
  globalShortSize?: BigNumber;
  maxAvailableLong?: BigNumber;
  maxAvailableShort?: BigNumber;
  maxGlobalLongSize?: BigNumber;
  maxGlobalShortSize?: BigNumber;
  maxLongCapacity?: BigNumber;
};

export type TradePairGlpInternals = {
  glpToken: GlpToken;
};

export type TradePairGlp = TradePairInternal<TradePairGlpInternals>;

export const glpTokenManager = new TokenManager({
  tokens: validateTokenList(glpTokenList).tokens,
});

/// Returns the first stable token found. Throws if not found.
export const getStableToken = (): TokenInfoGlp => {
  const tokens = glpTokenManager.getLoadedTokens(GLP_NETWORK) as TokenInfoGlp[];
  const stableTokens =
    tokens.filter((token) => token.extensions.isStable) ?? [];
  const token = stableTokens[0];
  if (!token) {
    throw new Error("getStableToken: not found");
  }
  return token;
};

export const getTokens = (includeEth = true): TokenInfoGlp[] =>
  [
    glpTokenManager.getLoadedTokens(GLP_NETWORK) as TokenInfoGlp[],
    // Also include ETH.
    includeEth ? [getNativeTokenInfo(GLP_NETWORK) as TokenInfoGlp] : [],
  ].flat();

export const getCollateralTokens = (_: GetCollateralTokensArgs) => getTokens();

export const getTokenInfoGlpBySymbol = (symbol: string): TokenInfoGlp => {
  const whitelistedTokens = glpTokenManager.getLoadedTokens(
    GLP_NETWORK
  ) as TokenInfoGlp[];
  const token = whitelistedTokens.find((token) => token.symbol == symbol);
  if (!token) {
    throw new Error("getTokenInfoGlpBySymbol: token not found");
  }
  return token;
};

export const getTokenInfoGlpByAddress = (
  address: string
): {
  token: TokenInfoGlp;
  isInputNative: boolean;
} => {
  const whitelistedTokens = glpTokenManager.getLoadedTokens(
    GLP_NETWORK
  ) as TokenInfoGlp[];
  const isInputNative = isEtherAddress(address);
  const token = whitelistedTokens.find((token) =>
    !isInputNative
      ? token.address.toLowerCase() === address.toLowerCase()
      : token.symbol === "WETH"
  );
  if (!token) {
    throw new Error("getTokenInfoGlpByAddress: collateral token not found");
  }
  return {
    token,
    isInputNative,
  };
};
