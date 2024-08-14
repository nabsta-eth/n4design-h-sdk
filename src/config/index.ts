import { ethers, providers } from "ethers";
import { CollateralSymbolMap } from "../types/collaterals";
import { BridgeConfigByNetwork } from "../components/Bridge";
import { StableType } from "../types/tokens";
import { LpStakingName, AnyLpStaking } from "../types/lp/staking";
import { TokenInfo } from "@uniswap/token-lists";
import StakingTokens from "./token-lists/staking-tokens.json";
import HandleTokens from "./token-lists/handle-tokens.json";
import ChainlinkUsdFeeds from "./chainlink-usd-feeds.json";
import { validateTokenList, getTokenFromTokenList } from "../utils/tokenlist";
import { mustExist } from "../utils/general";
import {
  MainNetwork,
  Network,
  NetworkMap,
  ReferralsNetwork,
  ReferralsNetworkMap,
  SingleCollateralVaultNetwork,
  TokenTransferProxyNetwork,
  TradeNetwork,
} from "../types/network";
import { Provider } from "@ethersproject/providers";
import { AnyLp, LpName } from "../types/lp";
import { providers as multicall } from "@0xsequence/multicall";
import providersList from "./providers.json";
import { FallbackProvider } from "../utils/fallbackProvider";
import { FxTokenSymbol } from "../types/fxTokens";
import { H2SO_PRICE_DECIMALS } from "../constants";

const stakingTokens = validateTokenList(StakingTokens);
const handleTokens = validateTokenList(HandleTokens);

export type FxTokenAddressMap = Record<FxTokenSymbol, string>;
export type CollateralDetails = CollateralSymbolMap<{
  address: string;
  decimals: number;
}>;

export type KashiPoolConfig = {
  address: string;
  fxToken: string;
  collateral: TokenInfo;
};

export type SingleCollateralVaults = Record<
  SingleCollateralVaultNetwork,
  { [key: string]: KashiPoolConfig }
>;

export type ConfigProtocol = Record<MainNetwork, ConfigProtocolMain> &
  Record<ReferralsNetwork, ConfigProtocolReferrals> &
  Record<TradeNetwork, ConfigProtocolTrade> &
  Record<TokenTransferProxyNetwork, ConfigProtocolRouterTransferProxy>;

export type ConfigProtocolMain = {
  protocol: ProtocolContractAddressMap;
  chainlinkFeeds: TokenSymbolToChainlinkUsdFeedAddress;
  collaterals: CollateralDetails;
};

export type ConfigProtocolReferrals = {
  referrals: string;
  /// New rebate contract. Not the same as "rebates".
  rebate: string;
};

export type ConfigProtocolRouterTransferProxy = {
  tokenTransferProxy: string;
};

export type ConfigProtocolTrade = {
  tradeAccount: string;
  tradeBeacon: string;
  tradeTreasury: string;
  tradeLiquidityTokenFactory: string;
  tradeLiquidityPool: string;
  tradeApiWsUrl: string;
};

export type Config = {
  forexAddress: string;
  fxTokenAddresses: FxTokenAddressMap;
  fxTokenSymbols: FxTokenSymbol[];
  /// Public providers.
  providers: NetworkMap<Provider>;
  protocol: ConfigProtocol;
  lp: {
    arbitrum: Record<LpName, AnyLp>;
  };
  lpStaking: {
    arbitrum: Record<LpStakingName, AnyLpStaking>;
  };
  theGraphEndpoints: {
    arbitrum: {
      fx: string;
      hpsm: string;
      /// This is for hLP, not synths.
      trade: string;
      synths: string;
      balancer: string;
    };
    "arbitrum-sepolia": {
      referrals: string;
      synths: string;
    };
  };
  bridge: {
    apiBaseUrl: string;
    byNetwork: BridgeConfigByNetwork;
  };
  singleCollateralVaults: SingleCollateralVaults;
  singleCollateralVaultParams: {
    minimumMintingRatio: ethers.BigNumber;
    minimumCollateralRatio: ethers.BigNumber;
  };
  convert: {
    feeAddress: string;
    fees: {
      buyingForex: number;
      stableToStable: number; // eur -> usd
      sameStableToStable: number; // usd -> usd
      nonStable: number;
    };
    tokenSymbolToStableType: { [key: string]: StableType };
    gasEstimates: {
      hpsm: number;
      hlp: number;
      curve: number;
      weth: number;
      hpsmToHlpToCurve: number;
      hlpToCurve: number;
      hpsmToHlp: number;
      balancer: number;
      hlpBalancer: number;
      hpsmHlpBalancer: number;
    };
  };
  coingecko: {
    tokenPriceUrl: string;
    networkAlias: NetworkMap<string>;
  };
  sdk: {
    /// Whether logs should be printed to stdout.
    printLogs: boolean;
    /**
     * Whether read requests should be redirected to the cache server
     * when available.
     * This is not used only for caching but also for some gas-less operations
     * such as permit.
     */
    shouldUseCacheServer: boolean;
  };
  api: {
    baseUrl: string;
  };
};

export type ProtocolContractAddressMap = {
  handle: string;
  vaultLibrary: string;
  comptroller: string;
  treasury: string;
  fxKeeperPool: string;
  governanceLock: string;
  governanceLockRetired: string;
  rewardPool: string;
  hpsm: string;
  /// Deprecated. This is the old rebates contract.
  rebates: string;
  routers: {
    routerHpsmHlp: string;
    routerHpsmHlpCurve: string;
    routerHlpBalancer: string;
    routerEthHlpBalancer: string;
    routerHpsmHlpBalancer: string;
    routerBalancerCurve: string;
  };
};

export type TokenSymbolToChainlinkUsdFeedAddress = Record<string, string>;

const API_BASE_URL = "https://api.handle.fi";
export const REFERRALS_NETWORK_TO_BASE_URL: ReferralsNetworkMap<string> = {
  "arbitrum-sepolia": "https://staging.ref.handle.fi",
};
export const DATA_FEED_API_BASE_URL = "https://oracle.handle.fi";
export const DATA_FEED_API_BASE_URL_STAGING =
  "https://staging.oracle.handle.fi";
export const DATA_FEED_API_WS_URL_QUOTES = "wss://oracle.handle.fi/quotes";
export const DATA_FEED_API_WS_URL_QUOTES_STAGING =
  "wss://staging.oracle.handle.fi/quotes";
export const DATA_FEED_SIGNING_ADDRESS =
  "0xfff98D80aCC2CE312225e08eb9fA88F19D737577";
export const DATA_FEED_PRICE_DECIMALS = H2SO_PRICE_DECIMALS;
export const BALANCER_FXUSD_FOREX_POOL_ID =
  "0x4f14d06cb1661ce1dc2a2f26a10a7cd94393b29c000200000000000000000097";
export const BALANCER_VAULT_ADDRESS_ARBITRUM =
  "0xba12222222228d8ba445958a75a0704d566bf2c8";
export const CURRENT_INSTRUMENT_SCHEMA_VERSION = 1;
export const INSTRUMENTS_LIST_URL_BASE =
  "https://handle.blr1.cdn.digitaloceanspaces.com/instruments";

const forexAddress = mustExist(
  getTokenFromTokenList(handleTokens, "FOREX", "arbitrum"),
  "FOREX on arbitrum"
).address;

const getMulticallProvider = (provider: Provider): Provider =>
  new multicall.MulticallProvider(provider, {
    batchSize: 500,
    timeWindow: 100,
    contract: "0xd130B43062D875a4B7aF3f8fc036Bc6e9D3E1B3E",
  });

const fallbackProviders = Object.keys(providersList).reduce(
  (map, network) => ({
    ...map,
    [network]: new FallbackProvider(
      (providersList[network as Network] as Array<{ url: string }>).map(
        ({ url }) => new providers.JsonRpcProvider(url)
      ),
      1
    ),
  }),
  {} as NetworkMap<FallbackProvider>
);

const fxTokenAddresses = handleTokens.tokens.reduce((acc: any, token: any) => {
  if (!token.extensions?.isFxToken) return acc;
  return {
    ...acc,
    [token.symbol]: token.address,
  };
}, {}) as FxTokenAddressMap;

const config: Config = {
  forexAddress,
  fxTokenAddresses,
  fxTokenSymbols: Object.keys(fxTokenAddresses),
  providers: {
    arbitrum: getMulticallProvider(fallbackProviders.arbitrum),
    ethereum: getMulticallProvider(fallbackProviders.ethereum),
    polygon: getMulticallProvider(fallbackProviders.polygon),
    "arbitrum-sepolia": getMulticallProvider(
      fallbackProviders["arbitrum-sepolia"]
    ),
  },
  protocol: {
    arbitrum: {
      protocol: {
        handle: "0xA112D1bFd43fcFbF2bE2eBFcaebD6B6DB73aaD8B",
        vaultLibrary: "0xeaE0f01393114Dfc95c82AafB227f31ba5ECf886",
        comptroller: "0x140D144480e3eDEB4D1a519997BE1EdF4175BE2D",
        treasury: "0x5710B75A0aA37f4Da939A61bb53c519296627994",
        fxKeeperPool: "0xc55204d4699dCce457DBF63d4B0074E6E1fa4412",
        governanceLock: "0x3c93a55D935d95511C2c4B23EA1025cF40028bd9",
        governanceLockRetired: "0xC6008E6baD8c2c0814A32f6F494fa419E95593b6",
        rewardPool: "0xDE17Af0E4A6c870762508DcB7dCc20719584CBd0",
        hpsm: "0x0F330a53874cEa3e5A0DEe5d291c49275Fdc3260",
        rebates: "0xd5D4F5442615Db3E2DfB3F5cf6559bA1716BA362",
        routers: {
          routerHpsmHlp: "0x69328f23A090e57378e3120f622ed0697f0E7ECF",
          routerHpsmHlpCurve: "0x559844b1Df66e247F83Ba58bc39fa488A1AF1093",
          routerHlpBalancer: "0xB28735D3f5C66078507eAfCea7928B33ee5FDd19",
          routerEthHlpBalancer: "0x9bDc4094860C97d9e5f1C18C4602a4a907d0a916",
          routerHpsmHlpBalancer: "0x8dCf49e5ED92e28f8CDF3809F935cf02A07738Ad",
          routerBalancerCurve: "0xfEEe0935dE1F6Af07bf70Dda744BdFb0908F5a10",
        },
      },
      tokenTransferProxy: "0x457A1F2BF2CCbbaF7107708cD8De9367aad45e15",
      chainlinkFeeds: ChainlinkUsdFeeds,
      collaterals: {
        FOREX: {
          address: forexAddress,
          decimals: 18,
        },
        WETH: {
          address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
          decimals: 18,
        },
        wstETH: {
          address: "0x5979D7b546E38E414F7E9822514be443A4800529",
          decimals: 18,
        },
      },
      tradeAccount: "0x5A5C7CBA24bF276f06563f7dD43517E7a9e234Df",
      tradeBeacon: "0x94688ce7187d1a8331a98ca9A84BeaAf1550C9b0",
      tradeTreasury: "0x5CE8dDD04F3576C93eDdDf0eb58bf2c7f643Ad0A",
      tradeLiquidityTokenFactory: "0x096d48ac073d0739F59b95857A38D9F940B2588E",
      tradeLiquidityPool: "0x0DC29dD7d8d685257c3C8eaf153B3ce3b936f58D",
      tradeApiWsUrl: "wss://trade.api.handle.fi",
    },
    "arbitrum-sepolia": {
      referrals: "0xaE45c05Eb82474D52A0f7900639F02D3b042DaAA",
      rebate: "0x70D281dc48C7b473020f502636C0d1Ce4D827b84",
      tradeAccount: "0x51111c9714D06f8eCE692a402df1C36F17B0556a",
      tradeBeacon: "0x04112CC28893481eb3c66eD80E215cF3A1d88572",
      tradeTreasury: "0x3B1E655a8b0b32954F4065149F5381E4112dfd73",
      tradeLiquidityTokenFactory: "0x28639edcfA5D40E68d20C40011AB464204674440",
      tradeLiquidityPool: "0x78FCbB30441AcB2FA3603AC6Ab8bF0272D96ca2D",
      tradeApiWsUrl: "wss://staging.trade.api.handle.fi",
      tokenTransferProxy: "0xd2e8a33004F21b799f30b7a09EFDc9c5dFb453F1",
    },
  },
  theGraphEndpoints: {
    arbitrum: {
      fx: "https://api.thegraph.com/subgraphs/name/handle-fi/handle",
      hpsm: "https://api.thegraph.com/subgraphs/name/handle-fi/handle-psm",
      trade: "https://api.thegraph.com/subgraphs/name/handle-fi/handle-trade",
      balancer:
        "https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-arbitrum-v2",
      synths:
        "https://subgraph.satsuma-prod.com/76eeac078c25/handle-fi/handle-synths/api",
    },
    "arbitrum-sepolia": {
      referrals:
        "https://api.thegraph.com/subgraphs/name/handle-fi/handle-referrals-arb-sepolia",
      synths:
        "https://api.thegraph.com/subgraphs/name/handle-fi/handle-synths-arb-sepolia",
    },
  },
  bridge: {
    apiBaseUrl: "https://bridge.api.handle.fi/bridge",
    byNetwork: {
      ethereum: {
        address: "0xA112D1bFd43fcFbF2bE2eBFcaebD6B6DB73aaD8B",
        id: 0,
      },
      arbitrum: {
        address: "0x000877168981dDc3CA1894c2A8979A2F0C6bBF3a",
        id: 1,
      },
      polygon: { address: "0x62E13B35770D40aB0fEC1AB7814d21505620057b", id: 2 },
    },
  },
  lp: {
    arbitrum: {
      balancerFxUsdForex: {
        title: "balancer 20fxUSD-80FOREX",
        platform: "balancer",
        contractAddress: BALANCER_VAULT_ADDRESS_ARBITRUM,
        url: `https://arbitrum.balancer.fi/#/pool/${BALANCER_FXUSD_FOREX_POOL_ID}`,
        poolId: BALANCER_FXUSD_FOREX_POOL_ID,
        type: "Weighted",
        lpToken: {
          symbol: "20fxUSD-80FOREX",
          address: "0x4f14D06CB1661cE1DC2A2f26A10A7Cd94393b29C",
        },
        tokensInLp: [
          mustExist(
            getTokenFromTokenList(handleTokens, "fxUSD", "arbitrum"),
            "fxUSD on arbitrum"
          ),
          mustExist(
            getTokenFromTokenList(handleTokens, "FOREX", "arbitrum"),
            "FOREX on arbitrum"
          ),
        ],
      },
      curveFxUsdFraxUsdc: {
        title: "fxUSD-FRAX-USDC",
        platform: "curve",
        contractAddress: "0xaB174fFA530C888649C44C4d21C849BBAaBc723F",
        url: "https://arbitrum.curve.fi/factory/75/deposit",
        lpToken: {
          symbol: "fxUSD_FRAX3CRV-f",
          address: "0xaB174fFA530C888649C44C4d21C849BBAaBc723F",
        },
        tokensInLp: [
          mustExist(
            getTokenFromTokenList(handleTokens, "fxUSD", "arbitrum"),
            "fxUSD on arbitrum"
          ),
          mustExist(
            getTokenFromTokenList(stakingTokens, "FRAXBP-f", "arbitrum"),
            "FRAXBP-f on arbitrum"
          ),
        ],
      },
    },
  },
  lpStaking: {
    arbitrum: {
      sushiWethForex: {
        title: "sushiswap WETH-FOREX",
        platform: "sushi",
        stakingContractAddress: "0x5cdEb8ff5FD3a3361E27e491696515F1D119537a",
        lpToken: {
          address: "0x9745e5CC0522827958eE3Fc2C03247276D359186",
          symbol: "SP-WETH-FOREX",
        },
        tokensInLp: [
          mustExist(
            getTokenFromTokenList(handleTokens, "FOREX", "arbitrum"),
            "FOREX on arbitrum"
          ),
          mustExist(
            getTokenFromTokenList(handleTokens, "WETH", "arbitrum"),
            "WETH on arbitrum"
          ),
        ],
        url: "https://app.sushi.com/add/ETH/0xDb298285FE4C5410B05390cA80e8Fbe9DE1F259B",
      },
      curveEursFxEUR: {
        title: "curve fxEUR-EURS",
        platform: "curve",
        factoryAddress: "0xb17b674D9c5CB2e441F8e196a2f048A81355d031",
        stakingContractAddress: "0x140b808C0b7e0d24fee45155473042A6f6F841Aa",
        lpToken: {
          address: "0xb0D2EB3C2cA3c6916FAb8DCbf9d9c165649231AE",
          symbol: "CRV-fxEUR-EURS",
        },
        tokensInLp: [
          mustExist(
            getTokenFromTokenList(handleTokens, "fxEUR", "arbitrum"),
            "fxEUR on arbitrum"
          ),
          mustExist(
            getTokenFromTokenList(stakingTokens, "EURS", "arbitrum"),
            "EURS on arbitrum"
          ),
        ],
        url: "https://arbitrum.curve.fi/factory/7/deposit",
      },
      curveHandle3: {
        title: "curve fxUSD-USDC-USDT",
        platform: "curve",
        stakingContractAddress: "0x68F03C9DB2611C79AAa21b6dFcdF6baC0cd191f6",
        factoryAddress: "0xb17b674D9c5CB2e441F8e196a2f048A81355d031",
        lpToken: {
          address: "0xd0dd5d76cf0fc06dabc48632735566dca241a35e",
          symbol: "CRV-handle3",
        },
        tokensInLp: [
          mustExist(
            getTokenFromTokenList(handleTokens, "fxUSD", "arbitrum"),
            "fxUSD on arbitrum"
          ),
          mustExist(
            getTokenFromTokenList(stakingTokens, "2CRV", "arbitrum"),
            "2CRV on arbitrum"
          ),
        ],
        url: "https://arbitrum.curve.fi/factory/12/deposit",
      },
    },
  },
  singleCollateralVaults: {
    polygon: {
      "fxAUD-WETH": {
        address: "0x78c2b09973363f8111cc122AdAefB1Ae5623feBD",
        fxToken: "fxAUD",
        collateral: mustExist(
          getTokenFromTokenList(stakingTokens, "WETH", "polygon"),
          "WETH on polygon"
        ),
      },
      "fxUSD-WMATIC": {
        address: "0xcAd5da38B07CB5dA10d0Cc15783C7a8679Ba0f49",
        fxToken: "fxUSD",
        collateral: mustExist(
          getTokenFromTokenList(stakingTokens, "WMATIC", "polygon"),
          "WMATIC on polygon"
        ),
      },
    },
    arbitrum: {
      "fxAUD-WBTC": {
        address: "0x5b5906ba677f32075b3dd478d730c46eaaa48c3e",
        fxToken: "fxAUD",
        collateral: mustExist(
          getTokenFromTokenList(stakingTokens, "WBTC", "arbitrum"),
          "WBTC on arbitrum"
        ),
      },
    },
  },
  singleCollateralVaultParams: {
    minimumMintingRatio: ethers.utils.parseEther("1.75"),
    // https://github.com/sushiswap/sushiswap-interface/blob/master/src/features/kashi/constants.ts
    minimumCollateralRatio: ethers.utils.parseEther("1.33333333333334"),
  },
  convert: {
    feeAddress: "0xFa2c1bE677BE4BEc8851D1577B343F7060B51E3A",
    fees: {
      buyingForex: 0,
      stableToStable: 0.1, // eur -> usd
      sameStableToStable: 0.04, // usd -> usd
      nonStable: 0.3,
    },
    tokenSymbolToStableType: {
      USDC: "USD",
      ["USDC.e"]: "USD",
      LUSD: "USD",
      DAI: "USD",
      USDT: "USD",
      sUSD: "USD",
      EURS: "EURO",
    },
    gasEstimates: {
      hlp: 1_310_000, // https://arbiscan.io/tx/0x40d1280eb7d5f6d24ba26b705b60f1d7dedcc9ef663bb42f3a3b27ad8c890ad2
      hpsm: 340_000, // https://arbiscan.io/tx/0x64f8887469c661d7b33195beeeae8ccd90e925d18402cf4f459d6cbf6e5a2656
      weth: 230_000, // https://arbiscan.io/tx/0xac8e53e274d7c72b20fb871f837d9f9a8ae84212615c3e51b781a1da000a28da
      curve: 590_000, // https://arbiscan.io/tx/0x60e5efce2726a7f448f73691b64d82dfaebb9f7243a2cdeecda6afb9f6672b07
      balancer: 580_000, // https://arbiscan.io/tx/0x1913cad643c85f5cb8def6fd0e27331da156c5cf62b197d0306751460190e34e
      get hpsmToHlp() {
        return this.hpsm + this.hlp;
      },
      get hpsmToHlpToCurve() {
        return this.hpsm + this.hlp + this.curve;
      },
      get hlpToCurve() {
        return this.hlp + this.curve;
      },
      get hlpBalancer() {
        return this.hlp + this.balancer;
      },
      get hpsmHlpBalancer() {
        return this.hlp + this.hpsm + this.balancer;
      },
    },
  },
  coingecko: {
    tokenPriceUrl: "https://api.coingecko.com/api/v3/simple/token_price/",
    networkAlias: {
      polygon: "polygon-pos",
      ethereum: "ethereum",
      arbitrum: "arbitrum-one",
      // There is no arbitrum-sepolia endpoint for CG.
      "arbitrum-sepolia": "arbitrum-one",
    },
  },
  sdk: {
    printLogs: true,
    shouldUseCacheServer: true,
  },
  api: {
    baseUrl: API_BASE_URL,
  },
};

/// Allows overriding the default `printLogs` value.
export const setPrintLogs = (shouldPrintLogs: boolean) => {
  config.sdk.printLogs = shouldPrintLogs;
};

/// Allows overriding the default cache server usage.
export const setShouldUseCacheServer = (shouldUseCacheServer: boolean) => {
  config.sdk.shouldUseCacheServer = shouldUseCacheServer;
};

export const setApiBaseUrl = (apiBaseUrl: string) => {
  config.api.baseUrl = apiBaseUrl;
};

export const setTestnetTradeApiWsUrl = (apiWsUrl: string) => {
  config.protocol["arbitrum-sepolia"].tradeApiWsUrl = apiWsUrl;
};

export default config;
