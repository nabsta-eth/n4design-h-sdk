import { ethers } from "ethers";
import { ProtocolContractAddressMap } from "../config";
import sdkConfig from "../config";
import {
  callMulticallObject,
  createMulticallProtocolContracts,
} from "../utils/contract";
import { Promisified } from "../types/general";
import { NETWORK_NAME_TO_CHAIN_ID } from "../constants";
import { TokenInfo } from "@uniswap/token-lists";
import { HandleTokenManagerInstance } from "./token-manager/HandleTokenManager";
import { mustExist } from "../utils/general";

export type ProtocolConfig = {
  forexTokenAddress: string;
  protocolAddresses: ProtocolContractAddressMap;
  chainId: number;
};

export type ProtocolParameters = {
  mintFee: ethers.BigNumber;
  burnFee: ethers.BigNumber;
  withdrawFee: ethers.BigNumber;
  depositFee: ethers.BigNumber;
  minimumMintingAmountAsEth: ethers.BigNumber;
};

export default class Vaults {
  private config: ProtocolConfig;
  public forexToken: TokenInfo & { symbol: "FOREX" };

  constructor(c?: ProtocolConfig) {
    this.config = c || {
      forexTokenAddress: sdkConfig.forexAddress,
      protocolAddresses: sdkConfig.protocol.arbitrum.protocol,
      chainId: NETWORK_NAME_TO_CHAIN_ID.arbitrum,
    };

    // Protocol on arbitrum
    this.forexToken = mustExist(
      HandleTokenManagerInstance.getTokenBySymbol("FOREX", "arbitrum"),
      "Forex on arbitrum"
    );
  }

  public getProtocolParameters = async (
    provider: ethers.providers.Provider
  ): Promise<ProtocolParameters> => {
    const { provider: multicallProvider, contracts } =
      createMulticallProtocolContracts(
        this.config.protocolAddresses,
        this.config.chainId,
        provider
      );

    const multicall: Promisified<ProtocolParameters> = {
      mintFee: contracts.handle.mintFeePerMille(),
      burnFee: contracts.handle.burnFeePerMille(),
      withdrawFee: contracts.handle.withdrawFeePerMille(),
      depositFee: contracts.handle.depositFeePerMille(),
      minimumMintingAmountAsEth: contracts.comptroller.minimumMintingAmount(),
    };

    return callMulticallObject(multicall, multicallProvider);
  };
}
