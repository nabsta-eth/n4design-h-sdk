import { BigNumber } from "ethers";
import { Network } from "../../../../../types/network";
import { GetTokenSpreadBasisPointsArgs } from "../../legacyInterface";
import {
  CACHE_DURATION_INFINITE,
  CachedObject,
} from "../../../../../utils/cachedObject";
import { DEFAULT_HLP_NETWORK, getHlpContracts } from "../config";
import { fetchTokens } from "./tokens";

const spreads: {
  [network: string]: { [token: string]: CachedObject<BigNumber> };
} = {};

export type GetHlpTokenSpreadBasisPointsArgs = GetTokenSpreadBasisPointsArgs & {
  useCache?: boolean;
  network?: Network;
};

export const getTokenSpreadBasisPoints = async ({
  tokenAddress,
  useCache = true,
  network = DEFAULT_HLP_NETWORK,
}: GetHlpTokenSpreadBasisPointsArgs): Promise<BigNumber> => {
  if (!spreads[network]) spreads[network] = {};
  if (!spreads[network][tokenAddress]) {
    spreads[network][tokenAddress] = new CachedObject<BigNumber>(
      CACHE_DURATION_INFINITE
    );
  }
  return spreads[network][tokenAddress].fetch(
    () =>
      getHlpContracts(network).vaultPriceFeed.spreadBasisPoints(tokenAddress),
    !useCache
  );
};

/// Returns all spreads in an object indexed by token address.
export const getAllTokenSpreadBasisPoints = async (
  network = DEFAULT_HLP_NETWORK,
  useCache = true
): Promise<Record<string, BigNumber>> => {
  const tokens = await fetchTokens();
  const spreads = await Promise.all(
    tokens.map(({ address }) =>
      getTokenSpreadBasisPoints({
        tokenAddress: address,
        network,
        useCache,
      })
    )
  );
  return tokens.reduce(
    (object, token, i) => ({
      ...object,
      [token.address]: spreads[i],
    }),
    {} as Record<string, BigNumber>
  );
};
