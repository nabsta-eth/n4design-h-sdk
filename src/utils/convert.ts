import { BigNumber, ethers } from "ethers";
import { gql, request } from "graphql-request";
import config from "../config";
import { Network, TokenTransferProxyNetwork } from "../types/network";
import { BASIS_POINTS_DIVISOR, FIVE_MINUTES_MILLIS } from "../constants";
import { CachedObject } from "./cachedObject";

export type Peg = {
  fxToken: string;
  peggedToken: string;
};

export const cachedArbitrumPegs = new CachedObject<Peg[]>(FIVE_MINUTES_MILLIS);

type PsmFeeCache = Record<string, { deposit?: number; withdraw?: number }>;
// record of token to fee (this assumes a token is not both an fxToken and a pegged token)
export const cachedArbitrumFees = new CachedObject<PsmFeeCache>(
  FIVE_MINUTES_MILLIS
);

const fetchTokenPegs = async (): Promise<Peg[]> => {
  const graphUrl = config.theGraphEndpoints.arbitrum.hpsm;
  const response = await request(
    graphUrl,
    gql`
      query {
        pairs(first: 1000) {
          fxToken
          peggedToken
        }
      }
    `
  );
  if (response && Array.isArray(response.pairs)) {
    return response.pairs;
  }
  throw new Error(
    `Response does not contain property 'pairs' of type array. Response: ${response}`
  );
};

const TRANSACTION_FEE_UNIT = ethers.utils.parseEther("1");

export const fetchPsmFeesBasisPoints = async (): Promise<PsmFeeCache> => {
  const graphUrl = config.theGraphEndpoints.arbitrum.hpsm;
  const response = await request<{
    transactionFees: { id: string; value: string; isDeposit: boolean }[];
  }>(
    graphUrl,
    gql`
      query {
        transactionFees(first: 1000) {
          id
          value
          isDeposit
        }
      }
    `
  );
  return response.transactionFees.reduce((acc, curr) => {
    const address = curr.id.toLowerCase().split("-fee-")[1];
    const fees = Math.floor(
      +BigNumber.from(curr.value)
        .mul(BASIS_POINTS_DIVISOR)
        .div(TRANSACTION_FEE_UNIT)
    );

    if (!acc[address]) acc[address] = {};
    acc[address][curr.isDeposit ? "deposit" : "withdraw"] = fees;
    return acc;
  }, {} as PsmFeeCache);
};

export const getPsmFeeBasisPoints = async (
  token: string,
  isDeposit: boolean,
  force = false
): Promise<number | undefined> => {
  const cache = await cachedArbitrumFees.fetch(fetchPsmFeesBasisPoints, force);
  return cache[token.toLowerCase()]?.[isDeposit ? "deposit" : "withdraw"];
};

export const getPsmFeeBasisPointsFromCache = (
  token: string,
  isDeposit: boolean
): number | undefined => {
  return cachedArbitrumFees.get()[token.toLowerCase()]?.[
    isDeposit ? "deposit" : "withdraw"
  ];
};

export const getTokenPegs = async (
  network: Network,
  force = false
): Promise<Peg[]> => {
  if (network !== "arbitrum") return [];
  return cachedArbitrumPegs.fetch(fetchTokenPegs, force);
};

export const isTokenPegged = async (
  fxToken: string,
  peggedToken: string,
  network: Network
): Promise<boolean> => {
  try {
    const pegged = await getTokenPegs(network);
    return !!pegged.find(
      (peg) =>
        peg.fxToken.toLowerCase() == fxToken.toLowerCase() &&
        peg.peggedToken.toLowerCase() == peggedToken.toLowerCase()
    );
  } catch (e) {
    console.error(e);
    return false;
  }
};

/**
 * Combines fees and returns the total fee in basis points.
 * @note this only works if the fees are compounded on the same amount,
 * e.g amount -> fee collected -> fee collected again.
 */
export const combineFees = (
  fee1: number,
  fee2: number,
  fee1Divisor = BASIS_POINTS_DIVISOR,
  fee2Divisor = BASIS_POINTS_DIVISOR
): number => {
  const decimalFee = 1 - (1 - fee1 / fee1Divisor) * (1 - fee2 / fee2Divisor);
  return Math.floor(decimalFee * BASIS_POINTS_DIVISOR);
};

/**
 * Returns a new amount accounting for slippage.
 * @param amount The amount to calculate the slippage-tolerant amount for.
 * @param slippage The slippage as a percentage.
 */
export const getMinOut = (amount: BigNumber, slippage: number) =>
  amount
    .mul((1 - slippage / 100) * BASIS_POINTS_DIVISOR)
    .div(BASIS_POINTS_DIVISOR);

export const getTokenTransferProxyAddress = (
  network: TokenTransferProxyNetwork
): string => config.protocol[network].tokenTransferProxy;
