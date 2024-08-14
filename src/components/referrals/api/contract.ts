import {
  BigNumber,
  BytesLike,
  ContractReceipt,
  ContractTransaction,
  Signer,
} from "ethers";
import { Referrals__factory, Referrals } from "../../../contracts";
import config from "../../../config";
import { ReferralsNetwork, referralsNetworks } from "../../../types/network";
import { getEventData, validateNetworkType } from "../../../utils/web3";
import { formatBytes32String } from "ethers/lib/utils";
import { ReferrerAccountOpenedEvent } from "../../../contracts/Referrals";

export type ReferrerId = number;

export type ReferrerAccountOpenResponse = {
  receipt: ContractReceipt;
  referrerId: ReferrerId;
};

export type ChildReferrerAccountOpenResponse = ReferrerAccountOpenResponse;

export const openReferrerAccount = async (
  recipientAddress: string,
  signer: Signer
): Promise<ReferrerAccountOpenResponse> => {
  const network = await validateNetworkType(signer, referralsNetworks);
  const referrals = getReferralsContract(network, signer);
  const tx = await referrals.openReferrerAccount(recipientAddress);
  return fetchOpenAccountTxResponse(tx, referrals);
};

export const openChildReferrerAccount = async (
  recipientAddress: string,
  parentReferrerId: ReferrerId,
  weight: BigNumber,
  signer: Signer
): Promise<ChildReferrerAccountOpenResponse> => {
  const network = await validateNetworkType(signer, referralsNetworks);
  const referrals = getReferralsContract(network, signer);
  const tx = await referrals.openChildReferrerAccount(
    recipientAddress,
    parentReferrerId,
    weight
  );
  return fetchOpenAccountTxResponse(tx, referrals);
};

export const closeReferrerAccount = async (
  referrerId: ReferrerId,
  signer: Signer
): Promise<ContractReceipt> => {
  const network = await validateNetworkType(signer, referralsNetworks);
  const referrals = getReferralsContract(network, signer);
  const tx = await referrals.closeReferrerAccount(referrerId);
  return tx.wait(1);
};

const fetchOpenAccountTxResponse = async (
  tx: ContractTransaction,
  referrals: Referrals
): Promise<ChildReferrerAccountOpenResponse> => {
  const receipt = await tx.wait(1);
  const eventData = getEventData<ReferrerAccountOpenedEvent>(
    "ReferrerAccountOpened",
    referrals,
    receipt
  );
  if (!eventData) {
    throw new Error("no event data");
  }
  return {
    receipt,
    referrerId: eventData.args.referrerId.toNumber(),
  };
};

export type ReferrerWeightArg = {
  referrerId: ReferrerId;
  weight: BigNumber;
};

export const setChildWeights = async (
  parentReferrerId: ReferrerId,
  args: ReferrerWeightArg[],
  signer: Signer
): Promise<ContractReceipt> => {
  const childReferrerIds = args.map((a) => a.referrerId);
  const weights = args.map((a) => a.weight);
  const network = await validateNetworkType(signer, referralsNetworks);
  const referrals = getReferralsContract(network, signer);
  const tx = await referrals.setChildWeights(
    parentReferrerId,
    childReferrerIds,
    weights
  );
  return tx.wait(1);
};

export type ReferralCodeArg = {
  code: string;
  userRebate: BigNumber;
};

export const configureReferralCodes = async (
  referrerId: ReferrerId,
  args: ReferralCodeArg[],
  signer: Signer
): Promise<ContractReceipt> => {
  const codes = args.map((a) => a.code);
  const rebates = args.map((a) => a.userRebate);
  const network = await validateNetworkType(signer, referralsNetworks);
  const referrals = getReferralsContract(network, signer);
  const tx = await referrals.configureReferralCodes(
    codes.map(codeStringToBytes32),
    rebates,
    referrerId
  );
  return tx.wait(1);
};

export const deleteReferralCodes = async (
  referrerId: ReferrerId,
  codes: string[],
  signer: Signer
): Promise<ContractReceipt> => {
  const network = await validateNetworkType(signer, referralsNetworks);
  const referrals = getReferralsContract(network, signer);
  const tx = await referrals.deleteReferralCodes(
    codes.map(codeStringToBytes32),
    referrerId
  );
  return tx.wait(1);
};

export const obtainChildReferrerOwnership = async (
  childReferrerId: ReferrerId,
  parentReferrerId: ReferrerId,
  signer: Signer
): Promise<ContractReceipt> => {
  const network = await validateNetworkType(signer, referralsNetworks);
  const referrals = getReferralsContract(network, signer);
  const tx = await referrals.obtainChildReferrerOwnership(
    childReferrerId,
    parentReferrerId
  );
  return tx.wait(1);
};

const getReferralsContract = (
  network: ReferralsNetwork,
  signer?: Signer
): Referrals =>
  Referrals__factory.connect(
    config.protocol[network].referrals,
    signer ?? config.providers[network]
  );

const codeStringToBytes32 = (code: string): BytesLike => {
  if (code.length > 32) {
    throw new Error("code cannot be more than 32 characters");
  }
  return formatBytes32String(code);
};
