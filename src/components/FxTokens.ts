import { ethers } from "ethers";
import { FxTokenAddressMap, ProtocolContractAddressMap } from "../config";
import { ERC20__factory } from "../contracts";
import { FxToken } from "../types/fxTokens";
import {
  callMulticallObjects,
  createMulticallProtocolContracts,
} from "../utils/contract";
import sdkConfig from "../config";
import { Promisified } from "../types/general";
import Graph, { IndexedFxToken } from "./graph";
import { SingleCollateralVaultNetwork } from "..";
import { BENTOBOX_ADDRESS } from "@sushiswap/core-sdk";
import { NETWORK_NAME_TO_CHAIN_ID } from "../constants";
import { getFxTokensFromAddresses } from "../utils/fxToken";
import { HandleTokenManagerInstance } from "./token-manager/HandleTokenManager";

export type FxTokensConfig = {
  protocolAddresses: ProtocolContractAddressMap;
  fxTokenAddresses: FxTokenAddressMap;
  chainId: number;
  graphEndpoint: string;
};

type FxTokenMulticall = {
  price: ethers.BigNumber;
};

export default class FxTokens {
  public tokens: Omit<FxToken, "price">[];
  private config: FxTokensConfig;
  private graph: Graph;

  constructor(c?: FxTokensConfig) {
    this.config = c || {
      protocolAddresses: sdkConfig.protocol.arbitrum.protocol,
      fxTokenAddresses: sdkConfig.fxTokenAddresses,
      chainId: NETWORK_NAME_TO_CHAIN_ID.arbitrum,
      graphEndpoint: sdkConfig.theGraphEndpoints.arbitrum.fx,
    };

    this.tokens = getFxTokensFromAddresses(
      Object.values(this.config.fxTokenAddresses)
    ) as Omit<FxToken, "price">[];
    this.graph = new Graph(this.config.graphEndpoint);
  }

  public getFxTokens = async (
    provider: ethers.providers.Provider
  ): Promise<FxToken[]> => {
    const { provider: multicallProvider } = createMulticallProtocolContracts(
      this.config.protocolAddresses,
      this.config.chainId,
      provider
    );

    const multicalls = this.tokens.map((a) =>
      this.getFxTokenMulticall(a.symbol, provider)
    );
    const raw = await callMulticallObjects(multicalls, multicallProvider);
    return raw.map((t, index) =>
      this.includeTokenPrice(this.tokens[index], t.price)
    );
  };

  public getIndexedFxTokens = async (): Promise<FxToken[]> => {
    const fxTokens = await this.graph.fxTokens.query({});
    return fxTokens
      .map(this.indexedToFxToken)
      .filter((fx) =>
        this.tokens.find(
          (t) => t.address.toLowerCase() === fx.address.toLowerCase()
        )
      );
  };

  public getRepayAllowance = (
    fxToken: string,
    account: string,
    signer: ethers.Signer
  ) => {
    const contract = this.getFxTokenContract(fxToken, signer);
    return contract.allowance(
      account,
      this.config.protocolAddresses.comptroller
    );
  };

  public getSingleCollateralRepayAllowance = (
    fxToken: string,
    account: string,
    network: SingleCollateralVaultNetwork,
    signer: ethers.Signer
  ) => {
    const contract = this.getFxTokenContract(fxToken, signer);
    const chainId = NETWORK_NAME_TO_CHAIN_ID[network];
    return contract.allowance(account, BENTOBOX_ADDRESS[chainId]);
  };

  public setRepayAllowance = (
    fxTokenSymbol: string,
    amount: ethers.BigNumber,
    signer: ethers.Signer,
    options: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> => {
    const fxContract = this.getFxTokenContract(fxTokenSymbol, signer);
    return fxContract.approve(
      this.config.protocolAddresses.comptroller,
      amount,
      options
    );
  };

  public setSingleCollateralRepayAllowance = (
    fxTokenSymbol: string,
    amount: ethers.BigNumber,
    network: SingleCollateralVaultNetwork,
    signer: ethers.Signer,
    options: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> => {
    const fxContract = this.getFxTokenContract(fxTokenSymbol, signer);
    const chainId = NETWORK_NAME_TO_CHAIN_ID[network];
    return fxContract.approve(BENTOBOX_ADDRESS[chainId], amount, options);
  };

  private getFxTokenMulticall = (
    fxTokenSymbol: string,
    provider: ethers.providers.Provider
  ): Promisified<FxTokenMulticall> => {
    const tokenAddress = this.config.fxTokenAddresses[fxTokenSymbol];
    if (!tokenAddress) {
      throw new Error(
        `fxTokens not initialised with token that matches: ${fxTokenSymbol}`
      );
    }

    const { contracts } = createMulticallProtocolContracts(
      this.config.protocolAddresses,
      this.config.chainId,
      provider
    );

    return {
      price: contracts.handle.getTokenPrice(tokenAddress),
    };
  };

  private includeTokenPrice = (
    token: Omit<FxToken, "price">,
    price: ethers.BigNumber
  ): FxToken => {
    return {
      ...token,
      price,
    };
  };

  private indexedToFxToken = (fxToken: IndexedFxToken): FxToken => {
    // note that address does not matter in this case, as all fx tokens have the same addresses across chains
    const fullFxToken = HandleTokenManagerInstance.getTokenByAddress(
      fxToken.address,
      1
    );
    if (!fullFxToken)
      throw new Error("Could not find fxToken to match indexed fxToken");
    return {
      ...fullFxToken,
      ...fxToken,
      price: fxToken.rate,
    };
  };

  private getFxTokenContract = (
    fxTokenSymbol: string,
    signer: ethers.Signer
  ) => {
    const tokenAddress = this.config.fxTokenAddresses[fxTokenSymbol];
    if (!tokenAddress) {
      throw new Error(
        `fxTokens not initialised with token that matches: ${fxTokenSymbol}`
      );
    }
    return ERC20__factory.connect(tokenAddress, signer);
  };
}
