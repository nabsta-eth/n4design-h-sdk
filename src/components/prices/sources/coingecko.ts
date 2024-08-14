import axios from "axios";
import { HandleTokenManagerInstance } from "../../token-manager/HandleTokenManager";
import { TokenInfo } from "@uniswap/token-lists";
import { Network, NetworkMap } from "../../../types/network";
import { PricePoint } from "../index";
import { NETWORK_NAME_TO_CHAIN_ID } from "../../../constants";
import config from "../../../config";

type CoinGeckoPriceData = {
  prices: [number, number][];
};

type CoinGeckoPricesData = {
  [address: string]: {
    usd: number;
  };
};

const NETWORK_MAP: NetworkMap<string> = {
  ethereum: "ethereum",
  polygon: "polygon-pos",
  arbitrum: "arbitrum-one",
  "arbitrum-sepolia": "arbitrum-one",
};

const getCoinGeckoNetworkName = (network: Network): string => {
  const networkMap = {
    polygon: "matic-network",
    ethereum: "ethereum",
    arbitrum: "arbitrum-one",
    "arbitrum-sepolia": "arbitrum-one",
  };
  return networkMap[network];
};

const getCoinGeckoNativeTokenId = (network: Network): string => {
  const networkMap = {
    polygon: "matic-network",
    ethereum: "ethereum",
    arbitrum: "ethereum",
    "arbitrum-sepolia": "arbitrum-one",
  };
  return networkMap[network];
};

export type TokenBasics = {
  symbol: string;
  id: string;
  name: string;
};

export type TokenDetails = TokenBasics & {
  image?: {
    large?: string;
  };
  market_data: {
    current_price: {
      usd: number;
    };
  };
};

export const fetchTokenBasics = async (
  address: string,
  network: Network
): Promise<TokenBasics> => {
  const NETWORK_MAP: NetworkMap<string> = {
    ethereum: "ethereum",
    polygon: "polygon-pos",
    arbitrum: "arbitrum-one",
    "arbitrum-sepolia": "arbitrum-one",
  };

  const nwk = NETWORK_MAP[network];

  const { data } = await axios.get(
    `${
      config.api.baseUrl
    }/proxy/coingecko/coins/${nwk}/contract/${address.toLowerCase()}`
  );

  return {
    symbol: data.symbol,
    id: data.id,
    name: data.name,
  };
};

export const fetchTokenDetails = async (
  address: string,
  network: Network
): Promise<TokenDetails> => {
  const { data } = await axios.get(
    `${config.api.baseUrl}/proxy/coingecko/coins/${
      NETWORK_MAP[network]
    }/contract/${address.toLowerCase()}`
  );
  return data;
};

export const fetchTokenPrice = async (
  address: string,
  network: Network
): Promise<number> => {
  const tokenData = await fetchTokenDetails(address, network);
  return tokenData.market_data.current_price?.usd;
};

export const fetchNativeUsdPrices = async (): Promise<NetworkMap<number>> => {
  const NETWORK_MAP: NetworkMap<string> = {
    ethereum: "ethereum",
    polygon: "matic-network",
    arbitrum: "ethereum",
    "arbitrum-sepolia": "ethereum",
  };

  const { data } = await axios.get(
    `${config.api.baseUrl}/proxy/coingecko/simple/price`,
    {
      params: {
        ids: `${NETWORK_MAP.ethereum},${NETWORK_MAP.polygon}`,
        vs_currencies: "usd",
      },
    }
  );

  return Object.keys(NETWORK_MAP).reduce((progress, ntw) => {
    const network = ntw as Network;

    return {
      ...progress,
      [network]: data[NETWORK_MAP[network]].usd,
    };
  }, {} as NetworkMap<number>);
};

export const fetchCoinGeckoTokenPriceData = async (
  network: Network,
  address: string,
  fiat: string,
  days: number
): Promise<PricePoint[]> => {
  try {
    const { data } = await axios.get<CoinGeckoPriceData>(
      getContractRequestUrl(network, address, fiat, days)
    );
    return data.prices.map(([date, price]) => ({
      date,
      price,
    }));
  } catch (error) {
    // Look up prices on ethereum if fails to get them on arb/polygon
    if (network !== "ethereum") {
      // Try to get token address on ETH, defaulting to input address on fail.
      const addressEth =
        HandleTokenManagerInstance.tryGetTokenByAddress(address, "ethereum")
          ?.address ?? address;
      return fetchCoinGeckoTokenPriceData("ethereum", addressEth, fiat, days);
    } else {
      throw error;
    }
  }
};

const getContractRequestUrl = (
  network: Network,
  address: string,
  fiat: string,
  days: number
) =>
  `${config.api.baseUrl}/proxy/coingecko/coins/${getCoinGeckoNetworkName(
    network
  )}/contract/${address.toLowerCase()}/market_chart?vs_currency=${fiat.toLowerCase()}&days=${days}`;

export const fetchCoinGeckoNativeTokenPriceData = async (
  network: Network,
  fiat: string,
  days: number
): Promise<PricePoint[]> => {
  const { data } = await axios.get<CoinGeckoPriceData>(
    `${config.api.baseUrl}/proxy/coingecko/coins/${getCoinGeckoNativeTokenId(
      network
    )}/market_chart?vs_currency=${fiat.toLowerCase()}&days=${days}`
  );
  return data.prices.map((p) => ({
    date: p[0],
    price: p[1],
  }));
};

export const fetchCoinGeckoTokenPricesData = async (
  network: Network,
  tokenAddresses: string[]
): Promise<CoinGeckoPricesData> => {
  const { data } = await axios.get<CoinGeckoPricesData>(
    `${
      config.api.baseUrl
    }/proxy/coingecko/simple/token_price/${getCoinGeckoNetworkName(
      network
    )}?contract_addresses=${tokenAddresses
      .join("%2C")
      .toLowerCase()}&vs_currencies=usd`
  );
  return data;
};

export const fetchTokenDetailsFromAddress = async (
  address: string,
  network: Network
): Promise<TokenInfo> => {
  const customToken = await fetchTokenDetails(address, network);
  return {
    symbol: parseIncomingTokenSymbol(customToken.symbol),
    name: customToken.name,
    address,
    // TODO: fetch correct decimal count.
    decimals: 18,
    logoURI: customToken.image?.large || "",
    chainId: NETWORK_NAME_TO_CHAIN_ID[network],
  };
};

const parseIncomingTokenSymbol = (symbol: string): string =>
  // Edge case fix because CoinGecko API returns $DG as dg
  symbol === "dg" ? "$DG" : symbol.toUpperCase();

export const fetchCoinGeckoTokenPrice = async (
  network: Network,
  token: TokenInfo,
  fiat: string
): Promise<PricePoint> => {
  const pricePoints = await fetchCoinGeckoTokenPriceData(
    network,
    token.address,
    fiat,
    0
  );
  if (pricePoints.length < 1) {
    throw new Error(`fetchCoinGeckoTokenPrice: no price for ${token.symbol}`);
  }
  return pricePoints[0];
};
