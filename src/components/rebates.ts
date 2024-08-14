// This reffers to a legacy contract, you are probably looking
// for "Rebate" (singular)
import { ethers, Signer } from "ethers";
import config, { REFERRALS_NETWORK_TO_BASE_URL } from "../config";
import { Rebates__factory, Rebates } from "../contracts";
import { Network, parseMainNetwork, ReferralsNetwork } from "../types/network";
import { SignerOrProvider } from "../utils/general";
import axios from "axios";
import {
  ReferralBalance,
  ReferrerBalanceSchema,
  ReferralClaimableBalance,
  ReferrerClaimableBalanceSchema,
  RebateClaimableBalance,
  RebateClaimableBalanceSchema,
} from "./referrals/interface";

const FOREX = config.forexAddress;

export const getFilters = (
  rebates: Rebates,
  account: string,
  token: string
) => {
  const rebateFilter = rebates.filters.Rebate(account, token);
  const claimFilter = rebates.filters.ClaimRebate(token, null, account);
  return {
    rebateFilter,
    claimFilter,
  };
};

const getRebateContract = (
  network: Network,
  signerOrProvider: SignerOrProvider
) =>
  Rebates__factory.connect(
    config.protocol[parseMainNetwork(network)].protocol.rebates,
    signerOrProvider
  );

export const addListener = async (
  account: string,
  network: Network,
  callback: () => void,
  provider = config.providers[network],
  token = FOREX
) => {
  const rebates = getRebateContract(network, provider);
  const { rebateFilter, claimFilter } = getFilters(rebates, account, token);
  rebates.on(rebateFilter, callback);
  rebates.on(claimFilter, callback);
};

export const removeListener = async (
  account: string,
  network: Network,
  callback: () => void,
  provider = config.providers[network],
  token = FOREX
) => {
  const rebates = getRebateContract(network, provider);
  const { rebateFilter, claimFilter } = getFilters(rebates, account, token);
  rebates.off(rebateFilter, callback);
  rebates.off(claimFilter, callback);
};

export const getClaimAmount = async (
  account: string,
  network: Network,
  provider = config.providers[network],
  token = FOREX
) => {
  const rebates = getRebateContract(network, provider);
  return rebates.userTokenRebates(account, token);
};

export const claimRebates = async (
  signer: Signer,
  network: Network,
  overrides?: ethers.Overrides,
  token = FOREX
) => {
  const rebates = getRebateContract(network, signer);
  return rebates.claim(token, overrides);
};

export const getReferrerEarningsByPeriod = async (
  referrerId: string,
  network: ReferralsNetwork,
  startTimestamp: number = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60,
  endTimestamp: number = Math.floor(Date.now() / 1000)
): Promise<ReferralBalance> => {
  const baseUrl = REFERRALS_NETWORK_TO_BASE_URL[network];
  const response = await axios.get(
    `${baseUrl}/referrer/${referrerId}/balance/historical/${startTimestamp}/${endTimestamp}`
  );

  return ReferrerBalanceSchema.parse(response.data);
};

export const getReferrerClaimableEarnings = async (
  referrerId: string,
  network: ReferralsNetwork
): Promise<ReferralClaimableBalance> => {
  const baseUrl = REFERRALS_NETWORK_TO_BASE_URL[network];
  const response = await axios.get(
    `${baseUrl}/referrer/${referrerId}/balance/claimable`
  );

  return ReferrerClaimableBalanceSchema.parse(response.data);
};

export const getRebateClaimableBalance = async (
  tradeAccountId: string,
  network: ReferralsNetwork
): Promise<RebateClaimableBalance> => {
  const baseUrl = REFERRALS_NETWORK_TO_BASE_URL[network];
  const response = await axios.get(
    `${baseUrl}/rebate/${tradeAccountId}/balance/claimable`
  );

  return RebateClaimableBalanceSchema.parse(response.data);
};
