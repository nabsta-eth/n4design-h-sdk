import { BigNumber } from "ethers";
import { Network } from "../../../../../types/network";
import {
  CACHE_DURATION_INFINITE,
  CachedObject,
} from "../../../../../utils/cachedObject";
import { DEFAULT_HLP_NETWORK, getHlpContracts } from "../config";
import { fetchTokens } from "./tokens";

const cache = new CachedObject<BigNumber>(CACHE_DURATION_INFINITE);

export const getTokenUsdHlpAmount = async (
  tokenAddress: string,
  network: Network = DEFAULT_HLP_NETWORK,
  useCache = true
): Promise<BigNumber> =>
  cache.fetch(
    () => getHlpContracts(network).vault.usdgAmounts(tokenAddress),
    !useCache
  );

/// Returns all USDhLP amounts in an object indexed by token address.
export const getAllTokenUsdHlpAmounts = async (
  network: Network = DEFAULT_HLP_NETWORK,
  useCache = true
): Promise<Record<string, BigNumber>> => {
  const tokens = await fetchTokens();
  const amounts = await Promise.all(
    tokens.map(({ address }) =>
      getTokenUsdHlpAmount(address, network, useCache)
    )
  );
  return tokens.reduce(
    (object, token, i) => ({
      ...object,
      [token.address]: amounts[i],
    }),
    {} as Record<string, BigNumber>
  );
};
