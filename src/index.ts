import config, {
  DATA_FEED_API_WS_URL_QUOTES as H2SO_API_WS_URL,
  KashiPoolConfig,
} from "./config";
import {
  Vault,
  SingleCollateralVaultSymbol,
  SingleCollateralVault,
} from "./types/vaults";
import {
  Collateral,
  CollateralSymbol,
  CollateralSymbolWithNative,
} from "./types/collaterals";
import { FxToken, FxTokenSymbol } from "./types/fxTokens";
import {
  Network,
  NetworkMap,
  SingleCollateralVaultNetwork,
  SingleCollateralVaultNetworkMap,
  BridgeNetwork,
  BridgeNetworkMap,
} from "./types/network";
import { FxKeeperPoolPool } from "./types/fxKeeperPool";
import { GovernanceLockData } from "./types/governanceLock";
import { RewardPoolData, RewardPoolRaw } from "./types/rewardPool";
import { LpStakingData, LpStakingName, AnyLpStaking } from "./types/lp/staking";
import { Lp, LpData, LpPlatform } from "./types/lp";
import FxTokensSDK from "./components/FxTokens";
import VaultsSDK from "./components/Vaults";
import CollateralsSDK from "./components/Collaterals";
import GraphSDK, {
  IndexedFxToken,
  IndexedVault,
  IndexedFxKeeperPool,
} from "./components/graph";
import BridgeSDK, { PendingWithdrawal } from "./components/Bridge";
import VaultController from "./components/VaultController";
import ConvertSDK, { Quote } from "./components/convert";
import LpStakingSDK from "./components/LpStaking";
import SingleCollateralVaultController from "./components/SingleCollateralVaultController";
import ProtocolSDK, { ProtocolParameters } from "./components/Protocol";
import FxKeeperPoolSDK from "./components/FxKeeperPool";
import * as governance from "./components/governance";
import * as rewards from "./components/rewards";
import { getIsKashiApproved, signKashiApproval } from "./utils/allowance";
import { getNetworkName } from "./utils/web3";
import {
  H2SO_PRICE_DECIMALS,
  NETWORK_NAMES,
  NETWORK_NAME_TO_CHAIN_ID,
  SECONDS_IN_A_YEAR_BN,
} from "./constants";
import { vaultUtils } from "./utils/vault";
import * as utils from "./utils";
import * as trade from "./components/trade";
import TokenManager from "./components/token-manager";
import HandleTokenManager from "./components/token-manager/HandleTokenManager";
import { TokenInfo, TokenList } from "@uniswap/token-lists";
import * as h2so from "./components/h2so";
import * as ConvertUtils from "./components/convert";
import * as rebates from "./components/rebates";
import * as prices from "./components/prices";
import * as referrals from "./components/referrals";
import { PricePoint, fetchTokenPriceUsd } from "./components/prices";

const SINGLE_COLLATERAL_NETWORK_NAMES = Object.keys(
  config.singleCollateralVaults
) as SingleCollateralVaultNetwork[];

export {
  FxTokensSDK,
  VaultsSDK,
  CollateralsSDK,
  GraphSDK,
  VaultController,
  SingleCollateralVaultController,
  ProtocolSDK,
  BridgeSDK,
  ConvertSDK,
  FxKeeperPoolSDK,
  LpStakingSDK,
  NETWORK_NAMES,
  SINGLE_COLLATERAL_NETWORK_NAMES,
  NETWORK_NAME_TO_CHAIN_ID,
  SECONDS_IN_A_YEAR_BN,
  H2SO_PRICE_DECIMALS,
  H2SO_API_WS_URL,
  getNetworkName,
  getIsKashiApproved,
  signKashiApproval,
  vaultUtils,
  TokenManager,
  HandleTokenManager,
  h2so,
  ConvertUtils,
  utils,
  config,
  trade,
  rebates,
  rewards,
  governance,
  prices,
  referrals,
  fetchTokenPriceUsd,
};

export type {
  IndexedFxToken,
  IndexedVault,
  IndexedFxKeeperPool,
  Vault,
  Collateral,
  CollateralSymbol,
  CollateralSymbolWithNative,
  FxToken,
  ProtocolParameters,
  Network,
  NetworkMap,
  SingleCollateralVaultNetworkMap,
  SingleCollateralVaultNetwork,
  SingleCollateralVaultSymbol,
  SingleCollateralVault,
  BridgeNetwork,
  BridgeNetworkMap,
  PendingWithdrawal,
  Quote,
  FxKeeperPoolPool,
  GovernanceLockData,
  RewardPoolData,
  RewardPoolRaw,
  LpStakingData,
  LpStakingName,
  AnyLpStaking,
  Lp,
  LpData,
  LpPlatform,
  KashiPoolConfig,
  TokenInfo,
  TokenList,
  PricePoint,
  FxTokenSymbol,
};
