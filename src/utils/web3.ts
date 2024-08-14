import {
  Contract,
  ContractInterface,
  ContractReceipt,
  ethers,
  Signer,
} from "ethers";
import { NETWORK_NAME_TO_CHAIN_ID } from "../constants";
import { Network } from "../types/network";
import { WETH, WETH__factory } from "../contracts";
import { HandleTokenManagerInstance } from "../components/token-manager/HandleTokenManager";
import { SignerOrProvider } from "./general";
import { Provider } from "@ethersproject/providers";
import { TypedEvent } from "../contracts/common";

export const REJECTED_ACTION_CODE_TEXT = "ACTION_REJECTED";
export const REJECTED_ACTION_CODE = 4001;

export const didUserCancelTransaction = (error: unknown): boolean => {
  const errorString = String(error).toLowerCase() || "";
  return (
    errorString.includes(REJECTED_ACTION_CODE_TEXT.toLowerCase()) ||
    errorString.includes("user rejected transaction")
  );
};

export const getNetworkName = (network: ethers.providers.Network): Network => {
  const result = Object.entries(NETWORK_NAME_TO_CHAIN_ID).find(
    ([_networkName, networkId]) => {
      return network.chainId === networkId;
    }
  );

  return (result ? result[0] : network.name) as Network;
};

export const getWrappedNativeToken = (
  network: Network,
  signerOrProvider: SignerOrProvider
): WETH =>
  WETH__factory.connect(
    HandleTokenManagerInstance.getWrappedNativeToken(network).address,
    signerOrProvider
  );

export const getProvider = (signerOrProvider: Signer | Provider): Provider =>
  Provider.isProvider(signerOrProvider)
    ? signerOrProvider
    : signerOrProvider.provider!;

/**
 * Ensures that the signer has the same network as one of the input networks.
 * @return The signer's network.
 */
export const validateNetworkType = async <T extends string>(
  signerOrProvider: Signer | Provider,
  validNetworks: readonly T[]
): Promise<T> => {
  const provider = getProvider(signerOrProvider);
  const network = await provider.getNetwork();
  const check = (validNetworkName: string) =>
    validNetworkName.toLowerCase() === getNetworkName(network) ||
    validNetworkName.toLowerCase() === network.name.toLowerCase();
  const isValid = validNetworks.map(check).includes(true);
  const networkName = getNetworkName(network);
  if (!isValid) {
    throw new Error(`network is not supported (${networkName})`);
  }
  return networkName as T;
};

export const getEventData = <T extends TypedEvent>(
  eventName: string,
  contract: Contract | ContractInterface,
  receipt: ContractReceipt
): T | null => {
  // @ts-ignore Get interface instance.
  const contractInterface = contract._isInterface
    ? contract
    : // @ts-ignore force cast.
      contract.interface;
  for (let log of receipt.logs) {
    try {
      const decoded = contractInterface.parseLog(log);
      if (decoded.name === eventName) {
        return { ...decoded } as unknown as T;
      }
    } catch (error) {}
  }
  return null;
};
