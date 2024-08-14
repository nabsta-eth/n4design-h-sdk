export const networks = [
  "ethereum",
  "arbitrum",
  "polygon",
  "arbitrum-sepolia",
] as const;
export const singleCollateralVaultNetworks = ["polygon", "arbitrum"] as const;
export const mainNetworks = ["arbitrum"] as const;
export const referralsNetworks = ["arbitrum-sepolia"] as const;
export const tradeNetworks = ["arbitrum", "arbitrum-sepolia"] as const;
export const hlpNetworks: Network[] = ["arbitrum"];
export const bridgeNetworks = ["ethereum", "arbitrum", "polygon"] as const;
export const routerTransferProxyNetworks = [
  "arbitrum",
  "arbitrum-sepolia",
] as const;

export type Network = (typeof networks)[number];
export type SingleCollateralVaultNetwork =
  (typeof singleCollateralVaultNetworks)[number];
export type ConvertNetwork = Network;
export type MainNetwork = (typeof mainNetworks)[number];
export type TokenTransferProxyNetwork =
  (typeof routerTransferProxyNetworks)[number];
export type ReferralsNetwork = (typeof referralsNetworks)[number];
export type TradeNetwork = (typeof tradeNetworks)[number];
export type HlpNetwork = (typeof hlpNetworks)[number];
export type BridgeNetwork = (typeof bridgeNetworks)[number];
export type NetworkMap<T> = { [key in Network]: T };
export type ReferralsNetworkMap<T> = { [key in ReferralsNetwork]: T };
export type ConvertNetworkMap<T> = { [key in ConvertNetwork]: T };
export type BridgeNetworkMap<T> = { [key in BridgeNetwork]: T };
export type SingleCollateralVaultNetworkMap<T> = {
  [key in SingleCollateralVaultNetwork]: T;
};

export const parseMainNetwork = (network: Network): MainNetwork => {
  if (!isMainNetwork(network)) {
    throw new Error(`Invalid network: ${network}`);
  }
  return network as MainNetwork;
};

export const isMainNetwork = (network: Network) =>
  (mainNetworks as readonly string[]).includes(network);
