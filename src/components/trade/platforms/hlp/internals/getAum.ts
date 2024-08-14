import { BigNumber, constants, ethers } from "ethers";
import { config, Network } from "../../../../..";
import { Vault } from "../../../../../contracts";
import sdk, {
  fetchCacheApi,
  getCacheServerErrorMessage,
} from "../../../../../utils/sdk";
import { Spread } from "../../legacyInterface";
import { fetchTokens, HlpToken, hlpTokenToUsdPair } from "./tokens";
import { DEFAULT_HLP_NETWORK, getHlpContracts } from "../config";
import { getUnsignedPrices } from "./prices";
import { CachedObject } from "../../../../../utils/cachedObject";
import { FIVE_MINUTES_MILLIS } from "../../../../../constants";
import { pairToString } from "../../../../../utils/general";

export type Aum = Spread<BigNumber>;

/**
 * Token object containing token-specific properties from the `Vault` contract
 * which are required for the Aum calculation.
 */
type VaultToken = {
  token: string;
  poolAmount: BigNumber;
  size: BigNumber;
  averagePrice: BigNumber;
  guaranteedUsd: BigNumber;
  reservedAmount: BigNumber;
};

/// The token object required to calculate the aum value.
export type AumToken = Omit<
  HlpToken,
  "tokenWeight" | "minProfitBasisPoints" | "maxUsdHlpAmount" | "isShortable"
> &
  Omit<VaultToken, "token"> & {
    price: BigNumber;
  };

const cachedAumTokens = new CachedObject<Spread<AumToken[]>>(
  FIVE_MINUTES_MILLIS
);

/**
 * This function replicates `HlpManager` contract's `getAums`
 * ("get assets under management"), but using the input price getters directly
 * instead of fetching the `Vault` contract's `getMinPrice` or `getMaxPrice`.
 */
export const getAum = async (network: Network): Promise<Aum> => {
  const start = Date.now();
  const { hlpManager } = getHlpContracts(network);
  const [aumAddition, aumDeduction] = await Promise.all([
    hlpManager.aumAddition(),
    hlpManager.aumDeduction(),
  ]);
  const { minimum, maximum } = await fetchAumTokens();
  sdk.trace(`getAum: ${Date.now() - start}ms`);
  return {
    minimum: calculateAum(minimum, aumAddition, aumDeduction),
    maximum: calculateAum(maximum, aumAddition, aumDeduction),
  };
};

export const fetchAumTokens = async (): Promise<Spread<AumToken[]>> =>
  cachedAumTokens.fetch(fetchAumTokensUncached);

export const fetchAumTokensUncached = async (): Promise<Spread<AumToken[]>> => {
  if (config.sdk.shouldUseCacheServer) {
    try {
      return await fetchAumTokensUncachedServer();
    } catch (error) {
      console.error(getCacheServerErrorMessage(), error);
    }
  }
  const { vault } = getHlpContracts(DEFAULT_HLP_NETWORK);
  const tokens = await fetchTokens();
  const mappedTokens = tokens.map((tokenConfig) => ({
    tokenConfig,
    pair: hlpTokenToUsdPair(tokenConfig),
  }));
  const prices = await getUnsignedPrices(mappedTokens.map((m) => m.pair));
  const vaultTokens = await Promise.all(
    tokens.map(({ address: token }) => fetchVaultToken(token, vault))
  );
  const [minimum, maximum] = mappedTokens.reduce(
    ([min, max], { tokenConfig, pair }) => {
      const address = tokenConfig.address;
      const price = prices[pairToString(pair)];
      const vaultState = vaultTokens.find(({ token }) => token === address);
      if (!price) throw new Error(`Could not find price for token ${address}`);
      if (!vaultState)
        throw new Error(
          `Could not find Vault contract data for token ${address}`
        );
      return [
        [...min, mapAumToken(tokenConfig, vaultState, price.bestBid)],
        [...max, mapAumToken(tokenConfig, vaultState, price.bestAsk)],
      ];
    },
    [[], []] as AumToken[][]
  );
  return { minimum, maximum };
};

const fetchAumTokensUncachedServer = async (): Promise<Spread<AumToken[]>> =>
  fetchCacheApi<Spread<AumToken[]>>("aum-tokens-hlp");

const fetchVaultToken = async (
  token: string,
  vault: Vault
): Promise<VaultToken> => {
  const [poolAmount, size, averagePrice, guaranteedUsd, reservedAmount] =
    await Promise.all([
      vault.poolAmounts(token),
      vault.globalShortSizes(token),
      vault.globalShortAveragePrices(token),
      vault.guaranteedUsd(token),
      vault.reservedAmounts(token),
    ]);
  return {
    token,
    poolAmount,
    size,
    averagePrice,
    guaranteedUsd,
    reservedAmount,
  };
};

const mapAumToken = (
  token: HlpToken,
  tokenVaultState: VaultToken,
  price: BigNumber
): AumToken => ({
  ...token,
  ...tokenVaultState,
  price,
});

export const calculateAum = (
  tokens: AumToken[],
  aumAddition: BigNumber,
  aumDeduction: BigNumber
): BigNumber => {
  const { aum: grossAum, shortProfits } = tokens.reduce(reduceAum, {
    aum: aumAddition,
    shortProfits: constants.Zero,
  });
  const netAum = shortProfits.gt(grossAum)
    ? ethers.constants.Zero
    : grossAum.sub(shortProfits);
  return aumDeduction.gt(netAum)
    ? ethers.constants.Zero
    : netAum.sub(aumDeduction);
};

const reduceAum = (
  { aum, shortProfits }: { aum: BigNumber; shortProfits: BigNumber },
  {
    isWhitelisted,
    price,
    poolAmount,
    tokenDecimals: decimals,
    isStable,
    size,
    averagePrice,
    guaranteedUsd,
    reservedAmount,
  }: AumToken
) => {
  if (!isWhitelisted) return { aum, shortProfits };
  if (isStable)
    return {
      shortProfits,
      aum: aum.add(poolAmount.mul(price).div(BigNumber.from(10).pow(decimals))),
    };
  const increasedAum = aum
    .add(guaranteedUsd)
    .add(
      poolAmount
        .sub(reservedAmount)
        .mul(price)
        .div(BigNumber.from(10).pow(decimals))
    );
  if (size.lte(0)) return { aum: increasedAum, shortProfits };
  // add global short profit / loss
  const priceDelta = averagePrice.gt(price)
    ? averagePrice.sub(price)
    : price.sub(averagePrice);
  const delta = size.mul(priceDelta).div(averagePrice);
  return {
    aum: price.gt(averagePrice) ? increasedAum.add(delta) : increasedAum,
    shortProfits: price.lte(averagePrice)
      ? shortProfits.add(delta)
      : shortProfits,
  };
};
