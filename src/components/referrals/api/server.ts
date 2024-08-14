import { BigNumber } from "ethers";
import axios from "axios";
import { parseEther } from "ethers/lib/utils";
import { ReferralsNetwork } from "../../../types/network";
import { REFERRALS_NETWORK_TO_BASE_URL } from "../../../config";

export type Referrer = {
  id: number;
  parent: number | null;
  children: Referrer[];
  parentWeight: BigNumber;
  codes: ReferralCode[];
};

export type ReferralCode = {
  code: string;
  userRebate: BigNumber;
  referrals: Referral[];
};

export type Referral = EthAddressReferral | TradeAccountReferral;

export type EthAddressReferral = {
  EthAddress: {
    address: string;
  };
};

export type TradeAccountReferral = {
  TradeAccount: {
    accountId: number;
  };
};

export type ReferredTrade = {
  notionalUsd: BigNumber;
  feeUsd: BigNumber;
  blockNumer: number;
  txHash: string;
  timestamp: number;
  user: {
    TradeAccount: number;
  };
};

type ReferredTradesResponse = {
  trades: ReferredTrade[];
};

type ReferrersResponse = {
  referrers: Referrer[];
};

export const endpoints = {
  getReferrerById(id: number, network: ReferralsNetwork) {
    const API_BASE = REFERRALS_NETWORK_TO_BASE_URL[network];
    return `${API_BASE}/referrer/${id}`;
  },
  getReferredTrades(
    id: number,
    fromTimestamp: number,
    toTimestamp: number,
    network: ReferralsNetwork
  ) {
    const query = `from_timestamp=${fromTimestamp}&to_timestamp=${toTimestamp}`;
    return `${this.getReferrerById(id, network)}/referred/trades?${query}`;
  },
  getUserReferrers(address: string, network: ReferralsNetwork) {
    const API_BASE = REFERRALS_NETWORK_TO_BASE_URL[network];
    return `${API_BASE}/user/${address}/referrers`;
  },
  getReferrerVolume(
    id: number,
    fromTimestamp: number,
    toTimestamp: number,
    network: ReferralsNetwork
  ) {
    return `${this.getReferrerById(
      id,
      network
    )}/volume/${fromTimestamp}/${toTimestamp}`;
  },
};

export const fetchReferrerVolume = async (
  referrerId: number,
  fromTimestamp: number,
  toTimestamp: number,
  network: ReferralsNetwork
): Promise<BigNumber> =>
  axios
    .get<BigNumber>(
      endpoints.getReferrerVolume(
        referrerId,
        fromTimestamp,
        toTimestamp,
        network
      )
    )
    .then((response) => parseEther(String(response.data)));

/// Returns the referrer with all of its children, and a parent ID.
export const fetchReferrerById = async (
  referrerId: number,
  network: ReferralsNetwork
): Promise<Referrer> =>
  axios
    .get<Referrer>(endpoints.getReferrerById(referrerId, network))
    .then((response) => mapReferrerResponse(ensureJson(response.data)));

export const fetchReferrersByUserAddress = async (
  userAddress: string,
  network: ReferralsNetwork
): Promise<Referrer[]> =>
  axios
    .get<ReferrersResponse>(endpoints.getUserReferrers(userAddress, network))
    .then((response) =>
      ensureJson(response.data).referrers.map(mapReferrerResponse)
    );

/// Converts raw String types into BigNumber instances.
const mapReferrerResponse = (referrer: Referrer): Referrer => {
  referrer.parentWeight = parseEther(String(referrer.parentWeight));
  referrer.codes = referrer.codes.map((code) => ({
    ...code,
    userRebate: parseEther(String(code.userRebate)),
  }));
  referrer.children.map(mapReferrerResponse);
  return referrer;
};

export const fetchReferredTrades = async (
  referrerId: number,
  fromTimestamp: number,
  toTimestamp: number,
  network: ReferralsNetwork
): Promise<ReferredTrade[]> =>
  axios
    .get<ReferredTradesResponse>(
      endpoints.getReferredTrades(
        referrerId,
        fromTimestamp,
        toTimestamp,
        network
      )
    )
    .then((response) => response.data.trades.map(mapReferredTradeResponse));

const mapReferredTradeResponse = (
  referredTrade: ReferredTrade
): ReferredTrade => {
  referredTrade.notionalUsd = parseEther(String(referredTrade.notionalUsd));
  referredTrade.feeUsd = parseEther(String(referredTrade.feeUsd));
  return referredTrade;
};

const ensureJson = <T>(data: T): T =>
  typeof data === "string" ? JSON.parse(String(data)) : data;

export const fetchBalanceByReferrerId = async (
  referrerId: number,
  network: ReferralsNetwork
) => {
  const now = Math.round(Date.now() / 1000);
  // We can change this to the date of when we actually release the refs
  // program
  const oneYearAgo = now - 60 * 60 * 24 * 365;

  const trades = await fetchReferredTrades(
    referrerId,
    oneYearAgo,
    now,
    network
  );
  let accruedFees = BigNumber.from(0);
  for (let trade of trades) {
    accruedFees = accruedFees.add(trade.feeUsd);
  }

  return accruedFees.div(determineFeeCut());
};

const determineFeeCut = () => {
  return parseEther("0.015");
};
