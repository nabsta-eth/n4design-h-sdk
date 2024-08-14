import { ethers } from "ethers";
import Graph, { IndexedVault } from "./graph";
import { Provider as MultiCallProvider } from "ethers-multicall";
import { FxToken } from "../types/fxTokens";
import { Collateral, CollateralSymbolWithNative } from "../types/collaterals";
import {
  SingleCollateralVault,
  SingleCollateralVaultSymbol,
  Vault,
  VaultData,
} from "../types/vaults";
import {
  ProtocolContractAddressMap,
  CollateralDetails,
  FxTokenAddressMap,
  SingleCollateralVaults,
} from "../config";
import {
  createMulticallProtocolContracts,
  getCdpContracts,
  callMulticallObject,
  callMulticallObjects,
} from "../utils/contract";
import { Promisified } from "../types/general";
import { CollateralSymbolMap } from "../types/collaterals";
import sdkConfig from "../config";
import CollateralsSDK from "./Collaterals";
import FxTokensSDK from "./FxTokens";
import { getDeadline } from "../utils/general";
import { createSingleCollateralVault, createVault } from "../utils/vault";
import { getFxTokenByAddress, getFxTokenBySymbol } from "../utils/fxToken";
import {
  getCollateralByAddress,
  getCollateralBySymbol,
} from "../utils/collateral";
import { ProtocolSDK } from "..";
import { ProtocolParameters } from "./Protocol";
import {
  getKashiPoolMulticall,
  kashiMulticallResultToSingleCollateralVaultData,
} from "../utils/sushiswap";
import KashiCooker from "../utils/KashiCooker";
import { SingleCollateralVaultNetwork } from "../types/network";
import { NETWORK_NAME_TO_CHAIN_ID } from "../constants";

export type VaultsConfig = {
  forexTokenAddress: string;
  protocolAddresses: ProtocolContractAddressMap;
  fxTokenAddresses: FxTokenAddressMap;
  collaterals: CollateralDetails;
  singleCollateralVaults: SingleCollateralVaults;
  chainId: number;
  graphEndpoint: string;
};

type VaultMulticall = {
  debt: ethers.BigNumber;
};

type vaultCollateralMulticall = Promisified<
  CollateralSymbolMap<ethers.BigNumber>
>;

type MintArguments = {
  fxToken: string;
  amount: ethers.BigNumber;
  collateral?: {
    symbol: CollateralSymbolWithNative;
    amount: ethers.BigNumber;
  };
  deadline?: number;
  referral?: string;
};

type DepositCollateralArguments = {
  account: string;
  fxToken: string;
  collateral: CollateralSymbolWithNative;
  amount: ethers.BigNumber;
  referral?: string;
};

type BurnArguments = {
  amount: ethers.BigNumber;
  fxToken: string;
  deadline?: number;
};

type WithdrawCollateralArguments = {
  account: string;
  fxToken: string;
  collateral: CollateralSymbolWithNative;
  amount: ethers.BigNumber;
};

type SingleCollateralMintAndDepositArguments = {
  network: SingleCollateralVaultNetwork;
  vaultSymbol: SingleCollateralVaultSymbol;
  mintAmount?: ethers.BigNumber;
  depositAmount?: ethers.BigNumber;
  approveKashiSignature?: ethers.Signature;
};

type SingleCollateralBurnAndWithdrawArguments = {
  network: SingleCollateralVaultNetwork;
  vaultSymbol: SingleCollateralVaultSymbol;
  burnAmount?: ethers.BigNumber;
  withdrawAmount?: ethers.BigNumber;
};

type SingleCollateralSupplyFxToken = {
  network: SingleCollateralVaultNetwork;
  vaultSymbol: SingleCollateralVaultSymbol;
  amount: ethers.BigNumber;
  approveKashiSignature?: ethers.Signature;
};

export default class Vaults {
  private config: VaultsConfig;
  private fxTokens: FxToken[] = [];
  private collaterals: Collateral[] = [];
  private protocolParameters!: ProtocolParameters;
  private fxTokensSDK: FxTokensSDK;
  private collateralsSDK: CollateralsSDK;
  private protocolSDK: ProtocolSDK;
  private graph: Graph;

  private initialised = false;

  constructor(c?: VaultsConfig) {
    this.config = c || {
      forexTokenAddress: sdkConfig.forexAddress,
      protocolAddresses: sdkConfig.protocol.arbitrum.protocol,
      fxTokenAddresses: sdkConfig.fxTokenAddresses,
      collaterals: sdkConfig.protocol.arbitrum.collaterals,
      chainId: NETWORK_NAME_TO_CHAIN_ID.arbitrum,
      graphEndpoint: sdkConfig.theGraphEndpoints.arbitrum.fx,
      singleCollateralVaults: sdkConfig.singleCollateralVaults,
    };

    this.fxTokensSDK = new FxTokensSDK(c);
    this.collateralsSDK = new CollateralsSDK(c);
    this.protocolSDK = new ProtocolSDK(c);
    this.graph = new Graph(this.config.graphEndpoint);
  }

  public initAsync = async (
    provider: ethers.providers.Provider = sdkConfig.providers.arbitrum
  ) => {
    const fxTokensPromise = this.fxTokensSDK.getFxTokens(provider);
    const collateralsPromise = this.collateralsSDK.getCollaterals(provider);
    const protocolParametersPromise =
      this.protocolSDK.getProtocolParameters(provider);
    const [fxTokens, collaterals, protocolParameters] = await Promise.all([
      fxTokensPromise,
      collateralsPromise,
      protocolParametersPromise,
    ]);
    this.fxTokens = fxTokens;
    this.collaterals = collaterals;
    this.protocolParameters = protocolParameters;
    this.initialised = true;
  };

  public initSync = (
    protocolParamters: ProtocolParameters,
    fxTokens: FxToken[],
    collaterals: Collateral[]
  ) => {
    this.protocolParameters = protocolParamters;
    this.fxTokens = fxTokens;
    this.collaterals = collaterals;
    this.initialised = true;
  };

  public getVaults = async (
    account: string,
    provider: ethers.providers.Provider = sdkConfig.providers.arbitrum,
    shouldAutoInitialise = true
  ): Promise<Vault[]> => {
    if (!shouldAutoInitialise) {
      this.initialisationCheck();
    } else if (!this.initialised) {
      await this.initAsync(provider);
    }

    const { provider: multicallProvider } = createMulticallProtocolContracts(
      this.config.protocolAddresses,
      this.config.chainId,
      provider
    );

    const vaultMulticalls = this.fxTokens.map((t) =>
      this.getVaultMulitcall(account, t.address, provider)
    );

    const collateralBalancesMulticalls = this.fxTokens.map((fxToken) =>
      this.createMulticallObjectForVaultCollateralBalance(
        account,
        fxToken.address,
        provider
      )
    );

    const vaultsPromise = callMulticallObjects(
      vaultMulticalls,
      multicallProvider
    );
    const collateralsPromise = callMulticallObjects(
      collateralBalancesMulticalls,
      multicallProvider
    );

    const [vaultData, collaterals] = await Promise.all([
      vaultsPromise,
      collateralsPromise,
    ]);

    return vaultData.map((vault, index) =>
      this.chainDataToVault(
        account,
        this.fxTokens[index].address,
        vault,
        collaterals[index]
      )
    );
  };

  public getVault = async (
    account: string,
    fxTokenSymbol: string,
    signer: ethers.Signer
  ): Promise<Vault> => {
    this.initialisationCheck();

    const provider = new MultiCallProvider(
      signer.provider!,
      this.config.chainId
    );

    const fxToken = this.fxTokens.find((t) => t.symbol === fxTokenSymbol);

    if (!fxToken) {
      throw new Error(`Could not find fxToken with symbol: ${fxTokenSymbol}`);
    }

    const vaultMulticall = this.getVaultMulitcall(
      account,
      fxToken.address,
      signer
    );
    const collateralBalanceMulticall =
      this.createMulticallObjectForVaultCollateralBalance(
        account,
        fxToken.address,
        signer
      );
    const vaultMulticallPromise = callMulticallObject(vaultMulticall, provider);

    const collateralMulticallResponsePromise = callMulticallObject(
      collateralBalanceMulticall,
      provider
    );

    const [vaultData, collateralData] = await Promise.all([
      vaultMulticallPromise,
      collateralMulticallResponsePromise,
    ]);

    return this.chainDataToVault(
      account,
      fxToken.address,
      vaultData,
      collateralData
    );
  };

  public getSingleCollateralVault = async (
    account: string,
    vaultSymbol: SingleCollateralVaultSymbol,
    network: SingleCollateralVaultNetwork,
    signer: ethers.Signer
  ): Promise<SingleCollateralVault> => {
    this.initialisationCheck();
    const chainId = NETWORK_NAME_TO_CHAIN_ID[network];

    const provider = new MultiCallProvider(signer.provider!, chainId);

    const pool = this.config.singleCollateralVaults[network][vaultSymbol];

    if (!pool) {
      throw new Error(`Unable to find vault: ${network}-${vaultSymbol}`);
    }

    const fxToken = getFxTokenBySymbol(this.fxTokens, pool.fxToken);
    const multicall = getKashiPoolMulticall(account, pool, chainId);
    const result = await callMulticallObject(multicall, provider);

    return createSingleCollateralVault(
      kashiMulticallResultToSingleCollateralVaultData(account, pool, result),
      fxToken
    );
  };

  public getIndexedVault = async (
    account: string,
    fxTokenSymbol: string
  ): Promise<Vault> => {
    this.initialisationCheck();

    const fxToken = getFxTokenBySymbol(this.fxTokens, fxTokenSymbol);

    const indexedVault = await this.graph.vaults.queryOne({
      where: {
        account: account.toLowerCase(),
        fxToken: fxToken.address.toLowerCase(),
      },
    });

    return this.indexedDataToVault(
      indexedVault || this.createEmptyIndexedVault(account, fxToken.address)
    );
  };

  public getIndexedVaults = async (account: string): Promise<Vault[]> => {
    this.initialisationCheck();
    const indexedVaults = await this.graph.vaults.query({
      where: { account: account.toLowerCase() },
    });
    const allVaults = this.fxTokens.map((fxToken) => {
      const existingVault = indexedVaults.find(
        (vault) => vault.fxToken.toLowerCase() === fxToken.address.toLowerCase()
      );

      return (
        existingVault || this.createEmptyIndexedVault(account, fxToken.address)
      );
    });
    return allVaults.map(this.indexedDataToVault);
  };

  public getSingleCollateralVaults = async (
    account: string,
    network: SingleCollateralVaultNetwork,
    signer: ethers.Signer
  ): Promise<SingleCollateralVault[]> => {
    this.initialisationCheck();
    const chainId = NETWORK_NAME_TO_CHAIN_ID[network];

    const provider = new MultiCallProvider(signer.provider!, chainId);

    const poolConfigs = this.config.singleCollateralVaults[network];

    const vaultsSymbols = Object.keys(
      poolConfigs
    ) as SingleCollateralVaultSymbol[];

    const multicalls = vaultsSymbols.map((symbol) =>
      getKashiPoolMulticall(account, poolConfigs[symbol], chainId)
    );

    const results = await callMulticallObjects(multicalls, provider);

    return results.map((r, index) => {
      const poolConfig = poolConfigs[vaultsSymbols[index]];

      const fxToken = getFxTokenBySymbol(this.fxTokens, poolConfig.fxToken);

      return createSingleCollateralVault(
        kashiMulticallResultToSingleCollateralVaultData(account, poolConfig, r),
        fxToken
      );
    });
  };

  public mint = async (
    args: MintArguments,
    signer: ethers.Signer,
    options: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> => {
    this.initialisationCheck();
    const protocolContracts = getCdpContracts(
      this.config.protocolAddresses,
      signer
    );

    const contract = protocolContracts.comptroller;

    const fxToken = getFxTokenBySymbol(this.fxTokens, args.fxToken);
    const deadline = getDeadline(args.deadline);
    const referral = args.referral ?? ethers.constants.AddressZero;

    if (args.collateral) {
      if (args.collateral.symbol === "ETH") {
        return contract.mintWithEth(
          args.amount,
          fxToken.address,
          deadline,
          referral,
          {
            ...options,
            value: args.collateral.amount,
          }
        );
      }

      const collateral = getCollateralBySymbol(
        this.collaterals,
        args.collateral.symbol
      );

      return contract.mint(
        args.amount,
        fxToken.address,
        collateral.address,
        args.collateral.amount,
        deadline,
        referral,
        options
      );
    }

    return contract.mintWithoutCollateral(
      args.amount,
      fxToken.address,
      deadline,
      referral,
      options
    );
  };

  public mintAndDepositSingleCollateral = async (
    args: SingleCollateralMintAndDepositArguments,
    signer: ethers.Signer,
    options: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> => {
    if (!args.mintAmount && !args.depositAmount) {
      throw new Error(
        "Must supply at least one of mintAmount or depositAmount"
      );
    }

    if (args.mintAmount?.isZero() && args.depositAmount?.isZero()) {
      throw new Error("One of mintAmount or depositAmount must be non-zero");
    }

    const kashiPool =
      this.config.singleCollateralVaults[args.network][args.vaultSymbol];

    if (!kashiPool) {
      throw new Error(
        `Unable to find vault: ${args.network}-${args.vaultSymbol}`
      );
    }

    const account = await signer.getAddress();
    const chainId = NETWORK_NAME_TO_CHAIN_ID[args.network];
    const fxToken = getFxTokenBySymbol(this.fxTokens, kashiPool.fxToken);
    const cooker = new KashiCooker(kashiPool, account, fxToken, chainId);

    if (args.approveKashiSignature) {
      cooker.approve(args.approveKashiSignature);
    }

    if (args.depositAmount?.gt(0)) {
      cooker.addCollateral(args.depositAmount);
    }

    if (args.mintAmount?.gt(0)) {
      cooker.borrow(args.mintAmount);
    }

    return cooker.cook(signer, options);
  };

  public burnAndWithdrawSingleCollateral = async (
    args: SingleCollateralBurnAndWithdrawArguments,
    signer: ethers.Signer,
    options: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> => {
    if (!args.burnAmount && !args.withdrawAmount) {
      throw new Error(
        "Must supply at least one of mintAmount or depositAmount"
      );
    }

    if (args.burnAmount?.isZero() && args.withdrawAmount?.isZero()) {
      throw new Error("One of mintAmount or depositAmount must be non-zero");
    }

    const kashiPool =
      this.config.singleCollateralVaults[args.network][args.vaultSymbol];

    if (!kashiPool) {
      throw new Error(
        `Unable to find vault ${args.network}-${args.vaultSymbol}`
      );
    }

    const account = await signer.getAddress();
    const chainId = NETWORK_NAME_TO_CHAIN_ID[args.network];
    const fxToken = getFxTokenBySymbol(this.fxTokens, kashiPool.fxToken);
    const cooker = new KashiCooker(kashiPool, account, fxToken, chainId);

    if (args.burnAmount?.gt(0)) {
      cooker.repay(args.burnAmount);
    }

    if (args.withdrawAmount?.gt(0)) {
      cooker.removeCollateral(args.withdrawAmount);
    }

    return cooker.cook(signer, options);
  };

  public supplyFxTokenSingleCollateral = async (
    args: SingleCollateralSupplyFxToken,
    signer: ethers.Signer,
    options: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> => {
    const kashiPool =
      this.config.singleCollateralVaults[args.network][args.vaultSymbol];

    if (!kashiPool) {
      throw new Error(
        `Unable to find vault ${args.network}-${args.vaultSymbol}`
      );
    }

    const account = await signer.getAddress();
    const chainId = NETWORK_NAME_TO_CHAIN_ID[args.network];
    const fxToken = getFxTokenBySymbol(this.fxTokens, kashiPool.fxToken);
    const cooker = new KashiCooker(kashiPool, account, fxToken, chainId);

    if (args.approveKashiSignature) {
      cooker.approve(args.approveKashiSignature);
    }

    cooker.addAsset(args.amount);

    return cooker.cook(signer, options);
  };

  public depositCollateral = (
    args: DepositCollateralArguments,
    signer: ethers.Signer,
    options: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> => {
    this.initialisationCheck();
    const protocolContracts = getCdpContracts(
      this.config.protocolAddresses,
      signer
    );
    const fxToken = getFxTokenBySymbol(this.fxTokens, args.fxToken);

    const contract = protocolContracts.treasury;

    const referral = args.referral ?? ethers.constants.AddressZero;

    if (args.collateral === "ETH") {
      return contract.depositCollateralETH(
        args.account,
        fxToken.address,
        referral,
        {
          ...options,
          value: args.amount,
        }
      );
    }

    const collateral = getCollateralBySymbol(this.collaterals, args.collateral);

    return contract.depositCollateral(
      args.account,
      args.amount,
      collateral.address,
      fxToken.address,
      referral,
      options
    );
  };

  public burn = (
    args: BurnArguments,
    signer: ethers.Signer,
    options: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> => {
    this.initialisationCheck();

    const protocolContracts = getCdpContracts(
      this.config.protocolAddresses,
      signer
    );
    const fxToken = getFxTokenBySymbol(this.fxTokens, args.fxToken);

    return protocolContracts.comptroller.burn(
      args.amount,
      fxToken.address,
      getDeadline(args.deadline),
      options
    );
  };

  public withdrawCollateral = (
    args: WithdrawCollateralArguments,
    signer: ethers.Signer,
    options: ethers.Overrides = {}
  ): Promise<ethers.ContractTransaction> => {
    this.initialisationCheck();
    this.initialisationCheck();

    const protocolContracts = getCdpContracts(
      this.config.protocolAddresses,
      signer
    );
    const fxToken = getFxTokenBySymbol(this.fxTokens, args.fxToken);

    const contract = protocolContracts.treasury;

    if (args.collateral === "ETH") {
      return contract.withdrawCollateralETH(
        args.account,
        args.amount,
        fxToken.address,
        options
      );
    }

    const collateral = getCollateralBySymbol(this.collaterals, args.collateral);

    return contract.withdrawCollateral(
      collateral.address,
      args.account,
      args.amount,
      fxToken.address,
      options
    );
  };

  private getVaultMulitcall = (
    account: string,
    fxTokenAddress: string,
    signerOrProvider: ethers.Signer | ethers.providers.Provider
  ): Promisified<VaultMulticall> => {
    const { contracts } = createMulticallProtocolContracts(
      this.config.protocolAddresses,
      this.config.chainId,
      signerOrProvider
    );

    return {
      debt: contracts.handle.getDebt(account, fxTokenAddress),
    };
  };

  private createMulticallObjectForVaultCollateralBalance = (
    account: string,
    fxTokenAddress: string,
    signerOrProvider: ethers.Signer | ethers.providers.Provider
  ): vaultCollateralMulticall => {
    const { contracts } = createMulticallProtocolContracts(
      this.config.protocolAddresses,
      this.config.chainId,
      signerOrProvider
    );

    return this.collaterals.reduce((progress, collateral) => {
      return {
        ...progress,
        [collateral.symbol]: contracts.handle.getCollateralBalance(
          account,
          collateral.address,
          fxTokenAddress
        ),
      };
    }, {} as vaultCollateralMulticall);
  };

  private chainDataToVault = (
    account: string,
    fxTokenAddress: string,
    vault: VaultMulticall,
    collateralMap: CollateralSymbolMap<ethers.BigNumber>
  ): Vault => {
    const { debt } = vault;

    const collateral = this.collaterals.map((c) => ({
      ...c,
      amount: collateralMap[c.symbol],
    }));

    const fxToken = getFxTokenByAddress(this.fxTokens, fxTokenAddress);

    const vaultData: VaultData = {
      account: account.toLowerCase(),
      fxToken: fxToken,
      debt,
      collateral,
    };

    return createVault(
      vaultData,
      this.protocolParameters,
      fxToken,
      this.collaterals
    );
  };

  private indexedDataToVault = (vault: IndexedVault): Vault => {
    const fxToken = getFxTokenByAddress(this.fxTokens, vault.fxToken);

    const collateral = vault.collateralTokens.map((c) => {
      const collateral = getCollateralByAddress(this.collaterals, c.address);
      return {
        address: c.address.toLowerCase(),
        symbol: collateral.symbol,
        amount: ethers.BigNumber.from(c.amount),
        decimals: collateral.decimals,
        name: collateral.name,
        chainId: collateral.chainId,
      };
    });

    const vaultData: VaultData = {
      account: vault.account.toLowerCase(),
      fxToken: fxToken,
      debt: ethers.BigNumber.from(vault.debt),
      collateral,
    };

    return createVault(
      vaultData,
      this.protocolParameters,
      fxToken,
      this.collaterals
    );
  };

  private initialisationCheck = () => {
    if (!this.initialised) {
      throw new Error("Vaults SDK not initialised");
    }
  };

  private createEmptyIndexedVault = (
    account: string,
    fxTokenAddress: string
  ): IndexedVault => {
    return {
      account: account,
      fxToken: fxTokenAddress,
      debt: "0",
      redeemableTokens: "0",
      collateralAsEther: "0",
      collateralRatio: "0",
      minimumRatio: "0",
      isRedeemable: false,
      isLiquidatable: false,
      collateralTokens: this.collaterals.map((c) => ({
        address: c.address,
        amount: "0",
      })),
    };
  };
}
