import { BigNumber } from "ethers";
import { gql, request } from "graphql-request";
import {
  ERC20,
  HLP,
  Vault__factory,
  Router,
  Vault,
  VaultUtils,
  HlpManagerRouter,
  HlpManager,
  Reader,
  VaultUtils__factory,
  HlpManager__factory,
  Router__factory,
  Reader__factory,
  HLP__factory,
  HlpManagerRouter__factory,
  ERC20__factory,
  VaultPriceFeed,
  VaultPriceFeed__factory,
  HlpRewardRouter,
  HlpRewardRouter__factory,
  HpsmTrade,
  HpsmTrade__factory,
  OrderBook__factory,
  OrderBook,
} from "../../../../contracts";
import {
  getReversedPair,
  isSamePair,
  pairFromString,
  SignerOrProvider,
} from "../../../../utils/general";
import { Network, NetworkMap } from "../../../../types/network";
import { config, NETWORK_NAME_TO_CHAIN_ID } from "../../../../index";
import { BASIS_POINTS_DIVISOR } from "../../../../constants";
import { TokenInfo } from "@uniswap/token-lists";
import { Pair } from "../../../../types/trade";
import {
  cachedArbitrumFees,
  fetchPsmFeesBasisPoints,
  getTokenPegs,
} from "../../../../utils/convert";
import { fetchTokens, getAllTokenFundingRates } from "./internals";
import {
  CachedObject,
  CACHE_DURATION_INFINITE,
} from "../../../../utils/cachedObject";

/** Currently the only available hLP network */
export const DEFAULT_HLP_NETWORK: Network = "arbitrum";

export const HLP_PLATFORM_NAME = "hlp" as const;
export const HLP_IMAGE_URL =
  "https://app.handle.fi/assets/images/handle.fiLogoLightNewCut.png";
export const MIN_LEVERAGE = 1 * BASIS_POINTS_DIVISOR;
export const FUNDING_FEE_DIVISOR = BASIS_POINTS_DIVISOR;
export const FUNDING_RATE_PRECISION = 1_000_000;
export const READER_POSITION_PROPS_LENGTH = 7;
// for experimental features
export const HANDLE_SUBGRAPH_STAGING =
  "https://api.thegraph.com/subgraphs/name/handle-fi/handle-trade-staging";
const REVERSED_PAIRS: Pair[] = [
  pairFromString("fxJPY/USD"),
  pairFromString("fxCNY/USD"),
  pairFromString("fxCAD/USD"),
  pairFromString("fxCHF/USD"),
  pairFromString("fxKRW/USD"),
  pairFromString("fxSGD/USD"),
  pairFromString("fxPHP/USD"),
];

/**
 * Map from symbol to subgraph entity ID for Chainlink aggregator.
 * Used to fetch historic price data from Chainlink's subgraph.
 */
export const CHAINLINK_GQL_FEED_ID_MAP: { [key: string]: string } = {
  BTC_USD: "0xae74faa92cb67a95ebcab07358bc222e33a34da7",
  ETH_USD: "0x37bc7498f4ff12c19678ee8fe19d713b87f6a9e6",
  BNB_USD: "0xc45ebd0f901ba6b2b8c7e70b717778f055ef5e6d",
  AUD_USD: "0x23641e6957805a800ca1e5339813e05ee35ede77",
  EUR_USD: "0x02f878a94a1ae1b15705acd65b5519a46fe3517e",
  KRW_USD: "0x256b6e10c153b49ac7800e2603167026f75eb765",
  PHP_USD: "0x835e3a06e4889030d059495f075d73781383e2b7",
  JPY_USD: "0x01a1f73b1f4726eb6eb189ffa5cbb91af8e14025",
  CNY_USD: "0x673816c92ec977003eb2e6e5ba5d7ef1a4ef6c4a",
};

export type HlpContracts = {
  vault: Vault;
  vaultUtils: VaultUtils;
  vaultPriceFeed: VaultPriceFeed;
  router: Router;
  reader: Reader;
  hlpManager: HlpManager;
  hlp: HLP;
  hlpManagerRouter: HlpManagerRouter;
  hlpRewardRouter: HlpRewardRouter;
  usdHlp: ERC20;
  sHlp: ERC20;
  hpsmTradeRouter: HpsmTrade;
  orderBook: OrderBook;
};

/** Perp contracts for each network chain ID. */
const HLP_CONTRACTS: NetworkMap<HlpContracts | undefined> = {
  // Arbitrum One
  arbitrum: {
    vault: Vault__factory.connect(
      "0x1785e8491e7e9d771b2A6E9E389c25265F06326A",
      config.providers.arbitrum
    ),
    vaultUtils: VaultUtils__factory.connect(
      "0x90A3CD038Ce4536053687F24286E388f57d7a4d7",
      config.providers.arbitrum
    ),
    vaultPriceFeed: VaultPriceFeed__factory.connect(
      "0xf28e261b89fc4479EE41044Dd55F7a4053F9844a",
      config.providers.arbitrum
    ),
    hlpManager: HlpManager__factory.connect(
      "0x034ABdFA4eADc7366f0852c00D88C1eC6cD190fE",
      config.providers.arbitrum
    ),
    router: Router__factory.connect(
      "0x434b5245f6Fe54D0C9F881d55c2Ba27fe7132d89",
      config.providers.arbitrum
    ),
    reader: Reader__factory.connect(
      "0xBb499057310709f7468E5e04c44F1621F7f48B6a",
      config.providers.arbitrum
    ),
    hlp: HLP__factory.connect(
      "0xB666b08609b2E69A8ba51AA720770053AeC0d2d3",
      config.providers.arbitrum
    ),
    hlpManagerRouter: HlpManagerRouter__factory.connect(
      "0xe7EcFcA68aCEdf2aabd016Bc7C587Cc513dDeC22",
      config.providers.arbitrum
    ),
    hlpRewardRouter: HlpRewardRouter__factory.connect(
      "0x26197f2418c9839c44ae49cA653C8d189464d255",
      config.providers.arbitrum
    ),
    usdHlp: ERC20__factory.connect(
      "0x823412ac2FfD566cFE35560A850EFec81337e67f",
      config.providers.arbitrum
    ),
    sHlp: ERC20__factory.connect(
      "0x2D57FB598c31Db8988A451eEbf1118b42C468E9B",
      config.providers.arbitrum
    ),
    hpsmTradeRouter: HpsmTrade__factory.connect(
      "0x5B2E0Bbc4757a15e3D36413E014043f138260140",
      config.providers.arbitrum
    ),
    orderBook: OrderBook__factory.connect(
      "0x2c405aFE06CBea9c73BbD308191ac025f89C9CEa",
      config.providers.arbitrum
    ),
  },
  ethereum: undefined,
  polygon: undefined,
  "arbitrum-sepolia": undefined,
};

export const getHlpContracts = (
  network: Network,
  signerOrProvider?: SignerOrProvider
): HlpContracts => {
  const contracts = HLP_CONTRACTS[network];
  if (!contracts)
    throw new Error(`hLP contracts are not available on ${network}`);
  // Return contracts connected to default provider if a signer or provider is
  // not passed as argument.
  if (!signerOrProvider) return contracts;
  // Otherwise, return a copy of the contracts connected to the signer or
  // provider passed as argument.
  return Object.keys(contracts).reduce(
    (connectedContracts, key) => ({
      ...connectedContracts,
      [key]: contracts[key as keyof HlpContracts].connect(signerOrProvider),
    }),
    {} as HlpContracts
  );
};

export const isHlpAvailableForNetwork = (network: Network): boolean =>
  !!HLP_CONTRACTS[network];

/**
 * Gets the hlp token used directly by the Handle Liquidity Manager.
 * This is internal as users should only have access to staked hLP (shLP)
 * @param network the network the internal hlp token is on
 * @throws if there is to handle liquidity token on the network
 * @returns the internal hlp token
 */
export const getInternalHlpToken = (network: Network): TokenInfo => ({
  address: getHlpContracts(network).hlp.address,
  chainId: NETWORK_NAME_TO_CHAIN_ID[network],
  decimals: 18,
  name: "Handle Liquidity Token",
  symbol: "hLP",
});

/// Checks whether a USD-quoted token is reversed.
export const shouldHlpPairBeReversed = (pair: Pair): boolean =>
  REVERSED_PAIRS.some((p) => isSamePair(p, pair));

/// Returns the "actual" hLP pair, in case the input pair is reversed.
export const getActualHlpPairIfReversed = (pair: Pair): Pair =>
  shouldHlpPairBeReversed(getReversedPair(pair)) ? getReversedPair(pair) : pair;

/// Returns the user-facing hLP pair, reversing the underlying pair if needed.
export const getReversedHlpPairIfApplicable = (pair: Pair): Pair => {
  pair = getActualHlpPairIfReversed(pair);
  return shouldHlpPairBeReversed(pair) ? getReversedPair(pair) : pair;
};

/// Returns true if the pair is reversed
export const isReversedPair = (pair: Pair): boolean =>
  shouldHlpPairBeReversed(getActualHlpPairIfReversed(pair));

const loadedConfig: Record<Network, HlpConfig | undefined> = {
  arbitrum: undefined,
  ethereum: undefined,
  polygon: undefined,
  "arbitrum-sepolia": undefined,
};

/** hLP dynamic config */
export type HlpConfig = {
  maxLeverage: number;
  mintBurnFeeBasisPoints: number;
  taxBasisPoints: number;
  stableTaxBasisPoints: number;
  minProfitTime: number;
  marginFeeBasisPoints: number;
  swapFeeBasisPoints: number;
  stableSwapFeeBasisPoints: number;
  liquidationFee: BigNumber;
};

type GraphResponse = {
  vaultFees: [
    {
      mintBurnFeeBasisPoints: string;
      taxBasisPoints: string;
      stableTaxBasisPoints: string;
      minProfitTime: string;
      marginFeeBasisPoints: string;
      swapFeeBasisPoints: string;
      stableSwapFeeBasisPoints: string;
      liquidationFee: string;
    }
  ];
  vaultMaxLeverages: [{ maxLeverage: string }];
};

const configQuery = gql`
  query {
    vaultFees(first: 1) {
      mintBurnFeeBasisPoints
      taxBasisPoints
      stableTaxBasisPoints
      minProfitTime
      marginFeeBasisPoints
      swapFeeBasisPoints
      stableSwapFeeBasisPoints
      liquidationFee
    }
    vaultMaxLeverages(first: 1) {
      maxLeverage
    }
  }
`;

/**
 * Fetches and caches the hLP config, loading from cache on subsequent calls.
 * @param network The network to fetch the hLP config for.
 * @param forceReload Whether to fetch the config ignoring the cached values.
 */
export const fetch = async (
  network: Network,
  forceReload = false
): Promise<HlpConfig> => {
  if (network !== "arbitrum")
    throw new Error("config only supported on arbitrum");
  if (!forceReload && loadedConfig[network]) return loadedConfig[network]!;
  const graphUrl = config.theGraphEndpoints.arbitrum.trade;
  const response: GraphResponse = await request(graphUrl, configQuery);
  if (!response) throw new Error("Config not found");
  if (!Array.isArray(response.vaultFees))
    throw new Error("Vault fees not found");
  if (!Array.isArray(response.vaultMaxLeverages))
    throw new Error("Vault max leverage not found");
  const hlpConfig = {
    mintBurnFeeBasisPoints: +response.vaultFees[0].mintBurnFeeBasisPoints,
    taxBasisPoints: +response.vaultFees[0].taxBasisPoints,
    stableTaxBasisPoints: +response.vaultFees[0].stableTaxBasisPoints,
    minProfitTime: +response.vaultFees[0].minProfitTime,
    marginFeeBasisPoints: +response.vaultFees[0].marginFeeBasisPoints,
    swapFeeBasisPoints: +response.vaultFees[0].swapFeeBasisPoints,
    stableSwapFeeBasisPoints: +response.vaultFees[0].stableSwapFeeBasisPoints,
    liquidationFee: BigNumber.from(response.vaultFees[0].liquidationFee),
    maxLeverage: +response.vaultMaxLeverages[0].maxLeverage,
  };
  loadedConfig[network] = hlpConfig;
  return hlpConfig;
};

export const get = (network: Network): HlpConfig => {
  const config = loadedConfig[network];
  if (!config) throw new Error("config: unavailable");
  return config;
};

const minimumPurchaseTokenAmountUsd = new CachedObject<BigNumber>(
  CACHE_DURATION_INFINITE
);

const fetchMinimumPurchaseTokenAmountUsd = async () => {
  const { orderBook } = getHlpContracts(DEFAULT_HLP_NETWORK);
  return minimumPurchaseTokenAmountUsd.fetch(() =>
    orderBook.minPurchaseTokenAmountUsd()
  );
};

export const getMinimumTokenPurchaseAmountUsd = (): BigNumber =>
  minimumPurchaseTokenAmountUsd.get();

export const HLP_TRADING_ENABLED_ON_WEEKEND: Record<
  string,
  boolean | undefined
> = {
  ETH: true,
  WETH: true,
  fxUSD: true,
};

export const initialise = async () => {
  await Promise.all([
    fetch(DEFAULT_HLP_NETWORK),
    getTokenPegs(DEFAULT_HLP_NETWORK),
    cachedArbitrumFees.fetch(fetchPsmFeesBasisPoints),
    getAllTokenFundingRates(),
    fetchTokens(),
    fetchMinimumPurchaseTokenAmountUsd(),
  ]);
};
