import { ethers, Signer } from "ethers";
import {
  Contract as MultiCallContract,
  ContractCall,
  Provider as MultiCallProvider,
} from "ethers-multicall";
import {
  ERC20,
  Handle,
  VaultLibrary,
  Comptroller,
  FxKeeperPool,
  Handle__factory,
  VaultLibrary__factory,
  Comptroller__factory,
  Treasury__factory,
  GovernanceLock,
  RewardPool,
  GovernanceLock__factory,
  RewardPool__factory,
  BalancerVault,
  BalancerVault__factory,
} from "../contracts";
import handleAbi from "../abis/handle/Handle.json";
import vaultLibraryAbi from "../abis/handle/VaultLibrary.json";
import comptrollerAbi from "../abis/handle/Comptroller.json";
import fxKeeperPoolAbi from "../abis/handle/fxKeeperPool.json";
import governanceLockAbi from "../abis/handle/GovernanceLock.json";
import rewardPoolAbi from "../abis/handle/RewardPool.json";
import erc20Abi from "../abis/ERC20.json";
import sdkConfig, {
  BALANCER_VAULT_ADDRESS_ARBITRUM,
  ProtocolContractAddressMap,
} from "../config";
import { Promisified } from "../types/general";
import { Provider } from "@ethersproject/providers";
import { getProvider } from "./web3";
import { NETWORK_NAME_TO_CHAIN_ID } from "../constants";
import { Network, parseMainNetwork } from "../types/network";

type ProtocolContracts = {
  handle: Handle;
  vaultLibrary: VaultLibrary;
  comptroller: Comptroller;
  fxKeeperPool: FxKeeperPool;
  governanceLock: GovernanceLock;
  governanceLockRetired: GovernanceLock;
  rewardPool: RewardPool;
};

export const createMultiCallContract = <T>(address: string, abi: any) => {
  if (!Array.isArray(abi)) abi = abi.abi;
  return new MultiCallContract(address, abi) as unknown as T;
};

export const createERC20MulticallContract = (address: string) =>
  createMultiCallContract<ERC20>(address, erc20Abi);

export const getMulticallProtocolContracts = (
  signer?: Signer,
  network: Network = "arbitrum"
) => {
  const protocol = sdkConfig.protocol[parseMainNetwork(network)]?.protocol;
  return createMulticallProtocolContracts(
    protocol,
    NETWORK_NAME_TO_CHAIN_ID[network],
    signer ?? sdkConfig.providers[network]
  );
};

export const createMulticallProtocolContracts = (
  protocolAddresses: ProtocolContractAddressMap,
  chainId: number,
  signerOrProvider: Signer | Provider
): { provider: MultiCallProvider; contracts: ProtocolContracts } => {
  const provider = new MultiCallProvider(
    getProvider(signerOrProvider),
    chainId
  );
  const contracts = {
    handle: createMultiCallContract<Handle>(
      protocolAddresses.handle,
      handleAbi.abi
    ),
    vaultLibrary: createMultiCallContract<VaultLibrary>(
      protocolAddresses.vaultLibrary,
      vaultLibraryAbi.abi
    ),
    comptroller: createMultiCallContract<Comptroller>(
      protocolAddresses.comptroller,
      comptrollerAbi
    ),
    fxKeeperPool: createMultiCallContract<FxKeeperPool>(
      protocolAddresses.fxKeeperPool,
      fxKeeperPoolAbi
    ),
    governanceLock: createMultiCallContract<GovernanceLock>(
      protocolAddresses.governanceLock,
      governanceLockAbi
    ),
    governanceLockRetired: createMultiCallContract<GovernanceLock>(
      protocolAddresses.governanceLockRetired,
      governanceLockAbi
    ),
    rewardPool: createMultiCallContract<RewardPool>(
      protocolAddresses.rewardPool,
      rewardPoolAbi
    ),
  };
  return { provider, contracts };
};

export const getCdpContracts = (
  protocolAddresses: ProtocolContractAddressMap,
  signer: ethers.Signer
) => {
  return {
    handle: Handle__factory.connect(protocolAddresses.handle, signer),
    vaultLibrary: VaultLibrary__factory.connect(
      protocolAddresses.vaultLibrary,
      signer
    ),
    comptroller: Comptroller__factory.connect(
      protocolAddresses.comptroller,
      signer
    ),
    treasury: Treasury__factory.connect(protocolAddresses.treasury, signer),
  };
};

export const getGovernanceLockContract = (
  signerOrProvider?: Signer | Provider,
  isRetired = false
): GovernanceLock =>
  GovernanceLock__factory.connect(
    !isRetired
      ? sdkConfig.protocol.arbitrum.protocol.governanceLock
      : sdkConfig.protocol.arbitrum.protocol.governanceLockRetired,
    signerOrProvider ?? sdkConfig.providers.arbitrum
  );

export const getRewardPoolContract = (
  signerOrProvider?: Signer | Provider
): RewardPool =>
  RewardPool__factory.connect(
    sdkConfig.protocol.arbitrum.protocol.rewardPool,
    signerOrProvider ?? sdkConfig.providers.arbitrum
  );

export const callMulticallObject = async <T>(
  callObject: Promisified<T>,
  provider: MultiCallProvider
): Promise<T> => {
  const properties = Object.keys(callObject);
  const calls = Object.values(callObject) as ContractCall[];
  const response = await provider.all(calls);
  return properties.reduce((progress, property, index) => {
    return {
      ...progress,
      [property]: response[index],
    };
  }, {} as T);
};

export const callMulticallObjects = async <T>(
  callObjects: Promisified<T>[],
  provider: MultiCallProvider
): Promise<T[]> => {
  const calls = callObjects.reduce(
    (progress, callObject) => [
      ...progress,
      ...(Object.values(callObject) as ContractCall[]),
    ],
    [] as ContractCall[]
  );

  const response = await provider.all(calls);
  return multicallResponsesToObjects(callObjects, response);
};

export const fetchPromisifiedObject = async <T>(
  object: Promisified<T>
): Promise<T> => {
  const properties = Object.keys(object);
  const promises = Object.values(object);
  const response = await Promise.all(promises);
  return properties.reduce(
    (progress, property, index) => ({
      ...progress,
      [property]: response[index],
    }),
    {} as T
  );
};

export const multicallResponsesToObjects = <T>(
  callObjects: Promisified<T>[],
  results: any[]
): T[] => {
  let resultIndex = 0;

  return callObjects.map((callObject) => {
    const properties = Object.keys(callObject);

    return properties.reduce((progress, property) => {
      const newProgess = {
        ...progress,
        [property]: results[resultIndex],
      };

      resultIndex++;

      return newProgess;
    }, {} as T);
  });
};

export const getBalancerVaultContract = (): BalancerVault =>
  BalancerVault__factory.connect(
    BALANCER_VAULT_ADDRESS_ARBITRUM,
    sdkConfig.providers.arbitrum
  );
