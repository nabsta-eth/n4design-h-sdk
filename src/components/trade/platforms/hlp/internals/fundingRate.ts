import { BigNumber } from "ethers";
import config from "../../../../../config";
import { Network } from "../../../../../types/network";
import {
  CachedObject,
  CACHE_DURATION_INFINITE,
} from "../../../../../utils/cachedObject";
import { fetchCacheApi } from "../../../../../utils/sdk";
import { getWrappedNativeToken } from "../../../../../utils/web3";
import { HandleTokenManagerInstance } from "../../../../token-manager/HandleTokenManager";
import { DEFAULT_HLP_NETWORK, getHlpContracts } from "../config";

export type TokenFundingRate = {
  regular: BigNumber;
  cumulative: BigNumber;
};

export type TokenFundingRates = Record<string, TokenFundingRate | undefined>;

const rates: { [network: string]: CachedObject<TokenFundingRates> } = {};

export type GetHlpTokenSpreadBasisPointsArgs = {
  network: Network;
  useCache?: boolean;
};

/// Returns all funding rates in an object indexed by token address.
export const getAllTokenFundingRates = async (
  args: GetHlpTokenSpreadBasisPointsArgs = {
    network: DEFAULT_HLP_NETWORK,
    useCache: true,
  }
): Promise<TokenFundingRates> => {
  const { network, useCache } = args;
  if (!rates[network]) {
    rates[network] = new CachedObject<TokenFundingRates>(
      CACHE_DURATION_INFINITE
    );
  }
  const tokens = HandleTokenManagerInstance.getHlpTokens(network);
  return rates[network].fetch(
    () =>
      fetch(
        tokens.map((token) => token.address),
        network
      ),
    !useCache
  );
};

const fetch = async (
  tokenAddresses: string[],
  network: Network
): Promise<TokenFundingRates> => {
  if (config.sdk.shouldUseCacheServer) {
    return fetchCacheApi("/hlp-funding-rates");
  }
  const { reader, vault } = getHlpContracts(network);
  const response = await reader.getFundingRates(
    vault.address,
    getWrappedNativeToken(network, vault.provider).address,
    tokenAddresses
  );
  if (response.length % 2 !== 0)
    throw new Error("hlp funding rate fetch: invalid response length");
  const dictionary: TokenFundingRates = {};
  for (let i = 0; i < tokenAddresses.length; i++) {
    dictionary[tokenAddresses[i].toLowerCase()] = {
      regular: response[i * 2],
      cumulative: response[i * 2 + 1],
    };
  }
  return dictionary;
};
