import { BigNumber } from "ethers";
import { gql, request } from "graphql-request";
import { Network, config } from "../../../../..";
import { FIVE_MINUTES_MILLIS } from "../../../../../constants";
import { Pair } from "../../../../../types/trade";
import { CachedObject } from "../../../../../utils/cachedObject";
import { cachedArbitrumPegs, getTokenPegs } from "../../../../../utils/convert";
import {
  getReversedPair,
  isSamePair,
  pairFromString,
  pairToBaseTokenAddress,
  pairToQuoteTokenAddress,
  pairToString,
  transformDecimals,
} from "../../../../../utils/general";
import {
  fetchCacheApi,
  getCacheServerErrorMessage,
} from "../../../../../utils/sdk";
import { isHlpMarketClosed } from "../../../../../utils/trade";
import { getNativeTokenInfo } from "../../../../token-manager";
import { HandleTokenManagerInstance } from "../../../../token-manager/HandleTokenManager";
import {
  Availability,
  GetCollateralTokensArgs,
  GetTradePairArgs,
  PRICE_DECIMALS,
  PositionInternal,
  Trade,
  TradePair,
  TradePairInternal,
  TokenInfoGlp,
} from "../../legacyInterface";
import { isEtherAddress } from "../../../utils";
import {
  DEFAULT_HLP_NETWORK,
  HLP_PLATFORM_NAME,
  HlpConfig,
  fetch,
  getActualHlpPairIfReversed,
  getHlpContracts,
  isReversedPair,
  shouldHlpPairBeReversed,
} from "../config";
import { TokenFundingRate, getAllTokenFundingRates } from "./fundingRate";
import { getAllTokenSpreadBasisPoints } from "./getTokenSpreadBasisPoints";
import { fetchUnsignedMarketPriceForPair } from "./prices";

const UNAVAILABLE_REASON_WHITELIST = "disabled";
const UNAVAILABLE_REASON_MARKET_CLOSED = "weekend trading";
const UNAVAILABLE_REASON_MARKET_PRICE_FEED = "unavailable";

type IndexedHlpToken = {
  token: string;
  isWhitelisted: boolean;
  tokenDecimals: string;
  tokenWeight: string;
  minProfitBasisPoints: string;
  maxUsdgAmount: string;
  isStable: boolean;
  isShortable: boolean;
};

export type HlpToken = {
  address: string;
  isWhitelisted: boolean;
  tokenDecimals: number;
  tokenWeight: number;
  minProfitBasisPoints: number;
  maxUsdHlpAmount: BigNumber;
  isStable: boolean;
  isShortable: boolean;
  poolAmount: BigNumber;
  reservedAmount: BigNumber;
};

enum PriceAvailabilityStatus {
  Unknown,
  Available,
  Unavailable,
}

export type TradePairHlpInternals = {
  hlpToken: HlpToken;
  priceAvailabilityStatus: PriceAvailabilityStatus;
};

export type PositionHlpInternals = {
  entryFundingRate: BigNumber;
  cumulativeFundingRate: BigNumber;
};

export type TradePairHlp = TradePairInternal<TradePairHlpInternals>;

export type PositionHlp = PositionInternal<PositionHlpInternals>;

const cachedTokens = new CachedObject<HlpToken[]>(FIVE_MINUTES_MILLIS);
const cachedTradePairs = new CachedObject<TradePairHlp[]>(FIVE_MINUTES_MILLIS);

export const fetchTokens = async (): Promise<HlpToken[]> =>
  cachedTokens.fetch(fetchTokensUncached);

/// Gets cached tokens; throws if cache is empty.
export const getTokens = () => cachedTokens.get();

const fetchTokensUncached = async (): Promise<HlpToken[]> => {
  if (config.sdk.shouldUseCacheServer) {
    const tokens = await fetchTradePairsHlpFromServer();
    return tokens
      .map((t) => t.internals.hlpToken)
      .filter((token) => token.isWhitelisted);
  }
  const indexed = await fetchIndexedTokenConfigs();
  const liquidity = await fetchLiquidityInfo(indexed.map((i) => i.token));
  return indexed.map((raw) => ({
    address: raw.token,
    isWhitelisted: raw.isWhitelisted,
    tokenDecimals: +raw.tokenDecimals,
    tokenWeight: +raw.tokenWeight,
    minProfitBasisPoints: +raw.minProfitBasisPoints,
    maxUsdHlpAmount: BigNumber.from(raw.maxUsdgAmount),
    isStable: raw.isStable,
    isShortable: raw.isShortable,
    poolAmount: liquidity.get(raw.token.toLowerCase())!.poolAmount,
    reservedAmount: liquidity.get(raw.token.toLowerCase())!.reservedAmount,
  }));
};

const fetchIndexedTokenConfigs = async (): Promise<IndexedHlpToken[]> => {
  const response = await request<{ tokenConfigs: IndexedHlpToken[] }>(
    config.theGraphEndpoints.arbitrum.trade,
    gql`
      query {
        tokenConfigs(first: 1000, where: { isWhitelisted: true }) {
          token
          isWhitelisted
          tokenDecimals
          tokenWeight
          minProfitBasisPoints
          maxUsdgAmount
          isStable
          isShortable
        }
      }
    `
  );
  if (!Array.isArray(response.tokenConfigs))
    throw new Error("Response is not an array");
  return response.tokenConfigs;
};

export const hlpTokenToUsdPair = ({ address }: HlpToken) => {
  const { symbol } = HandleTokenManagerInstance.getTokenByAddress(
    address,
    DEFAULT_HLP_NETWORK
  );
  return pairFromString(`${symbol}/USD`);
};

export const fetchTradePairsHlp = async (): Promise<TradePairHlp[]> =>
  cachedTradePairs
    .fetch(fetchTradePairsHlpUncached)
    .then(filterTradableTradePairsHlp);

const fetchTradePairsHlpFromServer = async (): Promise<TradePairHlp[]> =>
  fetchCacheApi<TradePairHlp[]>("trade-pairs-hlp");

export const fetchStablePairsHlp = async (): Promise<TradePairHlp[]> =>
  cachedTradePairs
    .fetch(fetchTradePairsHlpUncached)
    .then(filterStableTradePairsHlp);

/**
 * Fetches a stable pair from the hLP.
 * If there is more than one, this will return the first stable available.
 */
export const fetchStablePairHlp = async (): Promise<TradePairHlp> => {
  const pair = (await fetchStablePairsHlp())?.[0];
  if (!pair) throw new Error("Stable pair not found for hLP");
  return pair;
};

/// Gets cached tokens; throws if cache is empty.
export const getTradePairsHlp = () => cachedTradePairs.get();

/// Gets trade pair from cache; throws if not found.
export const getTradePairHlpFromPair = (pair: Pair): TradePairHlp => {
  const cache = cachedTradePairs.get();
  const tradePair = cache.find((p) => isSamePair(p.pair, pair));
  if (!tradePair)
    throw new Error(
      `getTradePairHlpFromPair: not found: ${pairToString(pair)}`
    );
  return tradePair;
};

/**
 * Filters hLP pairs which are actually tradable, (e.g. excluding "stable"
 * tokens hLP tokens such as fxUSD).
 */
const filterTradableTradePairsHlp = (pairs: TradePairHlp[]) =>
  pairs.filter(
    (pair) =>
      !pair.internals.hlpToken.isStable && pair.pair.baseSymbol !== "WETH"
  );

/**
 * Filters hLP pairs which are quoted on USD, and "stable" tokens,
 * e.g. fxUSD/USD, and not actually tradable.
 */
const filterStableTradePairsHlp = (pairs: TradePairHlp[]) =>
  pairs.filter((pair) => pair.internals.hlpToken.isStable);

/**
 * Returns all hLP pairs, even if they are not tradable (e.g. including
 * stable hLP tokens such as fxUSD).
 */
const fetchTradePairsHlpUncachedUnfiltered = async (): Promise<
  TradePairHlp[]
> => {
  const tokens = await fetchTokens();
  const spreads = await getAllTokenSpreadBasisPoints(
    DEFAULT_HLP_NETWORK,
    false
  );
  const fundingRates = await getAllTokenFundingRates();
  const hlpConfig = await fetch(DEFAULT_HLP_NETWORK);
  return tokens.map((token) =>
    mapHlpTokenToTradePairHlp(
      token,
      spreads[token.address],
      fundingRates[token.address],
      hlpConfig
    )
  );
};

export const fetchTradePairsHlpUncached = async (): Promise<TradePairHlp[]> => {
  if (config.sdk.shouldUseCacheServer) {
    try {
      return await fetchTradePairsHlpFromServer();
    } catch (error) {
      console.error(getCacheServerErrorMessage(), error);
    }
  }
  return fetchTradePairsHlpUncachedUnfiltered().then(
    setInternalPriceAvailabilityStatus
  );
};

const mapHlpTokenToTradePairHlp = (
  hlpToken: HlpToken,
  spread: BigNumber | undefined,
  fundingRate: TokenFundingRate | undefined,
  hlpConfig: HlpConfig
): TradePairHlp => {
  const symbol = HandleTokenManagerInstance.getTokenByAddress(
    hlpToken.address,
    DEFAULT_HLP_NETWORK
  ).symbol;
  if (!fundingRate)
    throw new Error("hlp getTradePairs: funding rate not found");
  if (!spread) throw new Error("hlp getTradePairs: spread not found");
  const internals: TradePairHlpInternals = {
    hlpToken,
    priceAvailabilityStatus: PriceAvailabilityStatus.Unknown,
  };
  const pair = pairFromString(`${symbol}/USD`);
  return {
    pair: shouldHlpPairBeReversed(pair) ? getReversedPair(pair) : pair,
    spreadBps: {
      // Spread is symmetric for hLP.
      maximum: spread,
      minimum: spread,
    },
    indexAddress: hlpToken.address,
    internals,
    marginFeeBps: BigNumber.from(hlpConfig.marginFeeBasisPoints),
    platformName: HLP_PLATFORM_NAME,
    maxLeverageBps: BigNumber.from(hlpConfig.maxLeverage),
    liquidationFeeUsd: hlpConfig.liquidationFee,
  };
};

export const getAvailableLiquidity: Trade["getAvailableLiquidity"] = async ({
  pair,
  forceFetch = false,
}) => {
  const hlpTokens = await cachedTradePairs.fetch(
    fetchTradePairsHlpUncached,
    forceFetch
  );
  const normalHlpToken = hlpTokens.find((t) => isSamePair(pair, t.pair));
  const stable = hlpTokens.find((t) => t.internals.hlpToken.isStable);
  if (!stable) throw new Error("stable token not found");
  if (!normalHlpToken) throw new Error("index token not found");

  const isReversed = isReversedPair(pair);
  // null checks safe here as error thrown if both don't exist
  const indexData = normalHlpToken.internals.hlpToken;
  const stableData = stable.internals.hlpToken;

  if (!isReversed) {
    return {
      long: indexData.poolAmount.sub(indexData.reservedAmount),
      short: transformDecimals(
        stableData.poolAmount.sub(stableData.reservedAmount),
        stableData.tokenDecimals,
        PRICE_DECIMALS
      ),
    };
  } else {
    return {
      short: transformDecimals(
        indexData.poolAmount.sub(indexData.reservedAmount),
        indexData.tokenDecimals,
        PRICE_DECIMALS
      ),
      long: stableData.poolAmount.sub(stableData.reservedAmount),
    };
  }
};

export const getAvailabilityHlp = (pair: Pair): Availability => {
  const tradePair = getTradePairHlpFromPair(pair);
  const tokenSymbol = tradePair.pair.baseSymbol;

  if (!tradePair.internals.hlpToken.isWhitelisted) {
    return {
      isAvailable: false,
      reason: UNAVAILABLE_REASON_WHITELIST,
    };
  }
  if (isHlpMarketClosed(tokenSymbol)) {
    return {
      isAvailable: false,
      reason: UNAVAILABLE_REASON_MARKET_CLOSED,
    };
  }
  if (
    tradePair.internals.priceAvailabilityStatus ===
    PriceAvailabilityStatus.Unavailable
  ) {
    return {
      isAvailable: false,
      reason: UNAVAILABLE_REASON_MARKET_PRICE_FEED,
    };
  }
  return {
    isAvailable: true,
  };
};

/***
 * Returns a TradePairsHlp array with available set to false if
 * the H2SO price is not available for the pair.
 */
const setInternalPriceAvailabilityStatus = async (
  pairs: TradePairHlp[]
): Promise<TradePairHlp[]> => {
  return Promise.all(
    pairs.map(async (pair): Promise<TradePairHlp> => {
      // if already unavailable, return current reason
      if (
        pair.internals.priceAvailabilityStatus !==
        PriceAvailabilityStatus.Unknown
      ) {
        return pair;
      }

      try {
        await fetchUnsignedMarketPriceForPair(pair.pair);
        pair.internals.priceAvailabilityStatus =
          PriceAvailabilityStatus.Available;
      } catch {
        pair.internals.priceAvailabilityStatus =
          PriceAvailabilityStatus.Unavailable;
      }
      return pair;
    })
  );
};

export const pairToTradePairHlp = async (pair: Pair): Promise<TradePairHlp> => {
  // Update cache if necessary.
  await fetchTradePairsHlp();
  return pairToTradePairHlpSync(pair);
};

export const pairToTradePairHlpSync = (pair: Pair): TradePairHlp => {
  if (shouldHlpPairBeReversed(pair)) pair = getReversedPair(pair);
  const pairs = getTradePairsHlp();
  const pairHlp = pairs.find((p) => isSamePair(p.pair, pair));
  if (!pairHlp)
    throw new Error(
      `pairToHlpTradePairSync: could not find ${pairToString(pair)}`
    );
  return pairHlp;
};

export const getHlpTokenFromPair = (pair: Pair): HlpToken => {
  const tokens = getTokens();
  const isPairReversed = shouldHlpPairBeReversed(
    getActualHlpPairIfReversed(pair)
  );
  const tokenAddress = isPairReversed
    ? pairToQuoteTokenAddress(pair)
    : pairToBaseTokenAddress(pair);
  const token = tokens.find(
    (t) => t.address.toLowerCase() === tokenAddress.toLowerCase()
  );
  if (!token)
    throw new Error(
      `getHlpTokenFromPosition: index token not found (${tokenAddress})`
    );
  return token;
};

/// Fetch all (tradable and stable) hLP tokens, then append pegged tokens if available.
export const getPlatformTokens = (includeEth?: boolean) => {
  const tradeTokens = getTokensInfo(includeEth);
  if (!cachedArbitrumPegs.isAvailable) {
    return tradeTokens;
  }
  const peggedTokens = HandleTokenManagerInstance.getTokensByAddresses(
    cachedArbitrumPegs.get().map((peg) => {
      return {
        address: peg.peggedToken,
        network: DEFAULT_HLP_NETWORK,
      };
    })
  );
  return [...tradeTokens, ...peggedTokens];
};

export const getTokensInfo = (includeEth = true): TokenInfoGlp[] =>
  [
    HandleTokenManagerInstance.getHlpTokens(
      DEFAULT_HLP_NETWORK
    ) as TokenInfoGlp[],
    // Also include ETH.
    includeEth ? [getNativeTokenInfo(DEFAULT_HLP_NETWORK) as TokenInfoGlp] : [],
  ].flat();

export const getCollateralTokens = (_: GetCollateralTokensArgs) => {
  // trigger cache fetch
  getTokenPegs(DEFAULT_HLP_NETWORK);

  const hlpTokens = getTokensInfo();
  const peggedAddresses = cachedArbitrumPegs
    .get()
    .map((peg) => peg.peggedToken);
  const peggedTokens = HandleTokenManagerInstance.getTokensByAddresses(
    peggedAddresses.map((address) => ({
      address,
      network: DEFAULT_HLP_NETWORK,
    }))
  );
  return [...hlpTokens, ...peggedTokens];
};

export const getTokenInfoByAddress = (address: string): TokenInfoGlp => {
  const tokens = getTokensInfo();
  const isNative = isEtherAddress(address);
  const token = tokens.find((token) =>
    !isNative
      ? token.address.toLowerCase() === address.toLowerCase()
      : token.symbol === "WETH"
  );
  if (!token) {
    throw new Error(`could not find token with address: ${address}`);
  }
  return token;
};

export const getTradePair = ({ pair }: GetTradePairArgs): TradePair =>
  pairToTradePairHlpSync(pair);

export type LiquidityInfo = {
  poolAmount: BigNumber;
  reservedAmount: BigNumber;
};

export const fetchLiquidityInfo = async (
  addresses: string[],
  network: Network = DEFAULT_HLP_NETWORK
): Promise<Map<string, LiquidityInfo>> => {
  const { vault } = getHlpContracts(network);
  const responses = await Promise.all(
    addresses.map(async (address) => {
      return {
        reservedAmount: await vault.reservedAmounts(address),
        poolAmount: await vault.poolAmounts(address),
      };
    })
  );
  const map = new Map<string, LiquidityInfo>();
  responses.forEach((response, i) => {
    map.set(addresses[i].toLowerCase(), response);
  });
  return map;
};
