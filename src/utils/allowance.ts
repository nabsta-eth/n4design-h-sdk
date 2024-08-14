import {
  BigNumber,
  Signer,
  ethers,
  ContractTransaction,
  Signature,
} from "ethers";
import { BENTOBOX_ADDRESS, KASHI_ADDRESS } from "@sushiswap/core-sdk";
import { SingleCollateralVaultNetwork } from "../types/network";
import {
  ERC20,
  ERC20__factory,
  ERC2612,
  ERC2612__factory,
  SushiBento__factory,
} from "../contracts";
import { NETWORK_NAME_TO_CHAIN_ID } from "../constants";
import { TokenInfo } from "../index";
import { Provider } from "@ethersproject/providers";
import { didUserCancelTransaction } from "./web3";
import config from "../config";
import { splitSignature } from "ethers/lib/utils";
import axios from "axios";

const PERMIT_TOKEN_SYMBOLS = ["USDC", "USDC.e", "DAI", "USDT", "FRAX"] as const;

const PERMIT_IMPLEMENTATION_NAMES = ["ERC2612"] as const;

type PermitImplementation = (typeof PERMIT_IMPLEMENTATION_NAMES)[number];

type PermitTokenSymbol = (typeof PERMIT_TOKEN_SYMBOLS)[number];

type PermitHandler = (
  token: ERC2612,
  allowanceTarget: string,
  signer: Signer,
  provider: Provider,
  minimumAllowance: BigNumber
) => Promise<void>;

const PERMIT_TOKEN_SYMBOL_BY_IMPLEMENTATION: Record<
  PermitImplementation,
  PermitTokenSymbol[]
> = {
  ERC2612: ["USDC", "USDC.e", "DAI", "USDT", "FRAX"],
};

export type AllowanceResult = {
  didAlreadyHaveEnough: boolean;
  getApprovalTxToExecute?: () => Promise<ContractTransaction>;
};

/**
 * Checks if the account has enough allowance for the given ERC20 token.
 * If not, it will request the allowance.
 * This will try to use permits if the contract supports ERC2612.
 * @param account The account to ensure allowance for.
 * @param tokenInfo The ERC20 to approve.
 * @param allowanceTarget The spender (EOA or contract) address for the allowance.
 * @param signer The signer of the account.
 * @param minimumAllowance The minimum amount that must be approved.
 * @param currentAllowance If provided, it will skip the allowance check and use this value instead.
 * @returns an AllowanceResult struct.
 */
export const ensureHasAllowance = async (
  account: string,
  tokenInfo: TokenInfo,
  allowanceTarget: string,
  signer: Signer,
  minimumAllowance: BigNumber,
  currentAllowance?: BigNumber
): Promise<AllowanceResult> => {
  const token = ERC20__factory.connect(tokenInfo.address, signer);
  const allowance =
    currentAllowance ?? (await token.allowance(account, allowanceTarget));
  if (allowance.gte(minimumAllowance)) {
    return {
      didAlreadyHaveEnough: true,
    };
  }
  const doesImplementPermit = PERMIT_TOKEN_SYMBOLS.includes(
    tokenInfo.symbol as PermitTokenSymbol
  );
  if (doesImplementPermit && signer.provider) {
    const result = await tryPermit(
      tokenInfo,
      token,
      allowanceTarget,
      signer,
      signer.provider,
      minimumAllowance
    );
    if (result) {
      return result;
    }
  }
  const getApprovalTxToExecute = () =>
    token.approve(allowanceTarget, minimumAllowance);
  return {
    didAlreadyHaveEnough: false,
    getApprovalTxToExecute,
  };
};

const tryPermit = async (
  tokenInfo: TokenInfo,
  token: ERC20,
  allowanceTarget: string,
  signer: Signer,
  provider: Provider,
  minimumAllowance: BigNumber
): Promise<AllowanceResult | null> => {
  try {
    await permit(
      tokenInfo,
      ERC2612__factory.connect(token.address, signer),
      allowanceTarget,
      signer,
      provider,
      minimumAllowance
    );
    return {
      didAlreadyHaveEnough: false,
    };
  } catch (error) {
    if (didUserCancelTransaction(error)) {
      throw error;
    }
    // Fall back to the approval implementation.
  }
  return null;
};

const permit = async (
  tokenInfo: TokenInfo,
  token: ERC2612,
  allowanceTarget: string,
  signer: Signer,
  provider: Provider,
  minimumAllowance: BigNumber
) => {
  const implementation = findPermitImplementation(tokenInfo.symbol);
  if (!implementation) {
    throw new Error(`${tokenInfo.symbol} is not configured for permits`);
  }
  const handler = PERMIT_HANDLERS[implementation];
  return handler(token, allowanceTarget, signer, provider, minimumAllowance);
};

const findPermitImplementation = (
  tokenSymbol: string
): PermitImplementation | null => {
  for (const key in PERMIT_TOKEN_SYMBOL_BY_IMPLEMENTATION) {
    const implementation = key as PermitImplementation;
    const values = PERMIT_TOKEN_SYMBOL_BY_IMPLEMENTATION[implementation];
    const isCurrentImplementation = values?.includes(
      tokenSymbol as PermitTokenSymbol
    );
    if (isCurrentImplementation) {
      return implementation;
    }
  }
  return null;
};

const permitErc2612 = async (
  token: ERC2612,
  allowanceTarget: string,
  signer: Signer,
  provider: Provider,
  minimumAllowance: BigNumber
) => {
  const account = await signer.getAddress();
  const chainId = await provider.getNetwork().then((n) => n.chainId);
  const nonce = await token.nonces(account);
  const name = await token.name();
  // Note that the version field is not available on all token contracts,
  // so it falls back to 1.
  const version = await token.version().catch((_) => "1");
  const deadline = Math.floor(Date.now() / 1000) + 5 * 60;
  const domain = {
    name: name,
    verifyingContract: token.address,
    version,
    chainId: chainId,
  };
  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  // Define transaction
  const values = {
    owner: account,
    spender: allowanceTarget,
    value: minimumAllowance,
    nonce,
    deadline,
  };
  const jsonRpcSigner = signer as ethers.providers.JsonRpcSigner;
  if (!jsonRpcSigner._signTypedData) {
    throw new Error("_signTypedData is not available on the signer");
  }
  const signature = await jsonRpcSigner
    ._signTypedData(domain, types, values)
    .then((signature) => splitSignature(signature));
  const recovered = ethers.utils.verifyTypedData(
    domain,
    types,
    values,
    signature
  );
  if (recovered.toLowerCase() != account.toLowerCase()) {
    throw new Error("permit signature is invalid");
  }
  await executePermit({
    tokenAddress: token.address,
    tokenHolderAddress: account,
    signature,
    allowanceTarget,
    minimumAllowance,
    deadline,
    signer,
  });
};

export const PERMIT_HANDLERS: Record<PermitImplementation, PermitHandler> = {
  ERC2612: permitErc2612,
};

export type PermitExecutionArgs = {
  tokenAddress: string;
  tokenHolderAddress: string;
  signature: Signature;
  allowanceTarget: string;
  minimumAllowance: BigNumber;
  deadline: number;
  signer: Signer;
};

const executePermit = async (args: PermitExecutionArgs) => {
  if (config.sdk.shouldUseCacheServer) {
    const success = await tryExecutePermitRemotely(args);
    if (success) {
      return;
    }
  }
  await executePermitLocally(args);
};

export type PermitExecutionArgsRemote = {
  tokenAddress: string;
  tokenHolderAddress: string;
  signature: Signature;
  allowanceTarget: string;
  minimumAllowanceHex: string;
  deadline: number;
  chainId: number;
};

const tryExecutePermitRemotely = async (args: PermitExecutionArgs) => {
  try {
    const endpoint = `${config.api.baseUrl}/permit`;
    const payload: PermitExecutionArgsRemote = {
      tokenAddress: args.tokenAddress,
      tokenHolderAddress: args.tokenHolderAddress,
      signature: args.signature,
      allowanceTarget: args.allowanceTarget,
      minimumAllowanceHex: args.minimumAllowance.toHexString(),
      deadline: args.deadline,
      chainId: await args.signer.getChainId(),
    };
    const response = await axios.post(endpoint, payload);
    return !!response?.data?.success;
  } catch (error) {
    if (config.sdk.printLogs) {
      console.error(error);
    }
    // Fallback to local execution.
  }
  return false;
};

export const executePermitLocally = (
  args: PermitExecutionArgs
): Promise<ContractTransaction> =>
  ERC2612__factory.connect(args.tokenAddress, args.signer).permit(
    args.tokenHolderAddress,
    args.allowanceTarget,
    args.minimumAllowance,
    args.deadline,
    args.signature.v,
    args.signature.r,
    args.signature.s
  );

export const getIsKashiApproved = async (
  account: string,
  network: SingleCollateralVaultNetwork,
  signer: ethers.Signer
): Promise<boolean> => {
  const chainId = NETWORK_NAME_TO_CHAIN_ID[network];
  const bentoBoxAddress = BENTOBOX_ADDRESS[chainId];
  const kashiAddress = KASHI_ADDRESS[chainId];
  const contract = SushiBento__factory.connect(bentoBoxAddress, signer);
  return contract.masterContractApproved(kashiAddress, account);
};

export const signKashiApproval = async (
  account: string,
  network: SingleCollateralVaultNetwork,
  signer: ethers.Signer
): Promise<ethers.Signature> => {
  const chainId = NETWORK_NAME_TO_CHAIN_ID[network];
  const bentoBoxAddress = BENTOBOX_ADDRESS[chainId];
  const kashiAddress = KASHI_ADDRESS[chainId];
  const contract = SushiBento__factory.connect(bentoBoxAddress, signer);

  const warning = "Give FULL access to funds in (and approved to) BentoBox?";
  const nonce = await contract.nonces(account);
  const message = {
    warning,
    user: account,
    masterContract: kashiAddress,
    approved: true,
    nonce,
  };

  const typedData = {
    types: {
      SetMasterContractApproval: [
        { name: "warning", type: "string" },
        { name: "user", type: "address" },
        { name: "masterContract", type: "address" },
        { name: "approved", type: "bool" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "SetMasterContractApproval",
    domain: {
      name: "BentoBox V1",
      chainId: chainId,
      verifyingContract: bentoBoxAddress,
    },
    message: message,
  };

  const jsonRpcSigner = signer as ethers.providers.JsonRpcSigner;
  const signature = await jsonRpcSigner._signTypedData(
    typedData.domain,
    typedData.types,
    typedData.message
  );

  return ethers.utils.splitSignature(signature);
};
