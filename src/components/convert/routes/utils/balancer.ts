import { TokenInfo } from "@uniswap/token-lists";
import { BigNumber, ethers } from "ethers";
import request, { gql } from "graphql-request";
import config from "../../../../config";
import { Network } from "../../../../types/network";
import { BalancerPoolType } from "../../../../types/lp";
import data from "../data.json";
import { HandleTokenManagerInstance } from "../../../token-manager/HandleTokenManager";

export type BalancerPool = (typeof data)["balancer"][0];

type BalancerPoolPairBase = {
  id: string;
  poolType: BalancerPoolType;
  address: string;
  swapFee: number;
  tokenIn: string;
  tokenOut: string;
  decimalsIn: number;
  decimalsOut: number;
  balanceIn: number;
  balanceOut: number;
};

type BalancerWeightedPoolPairData = BalancerPoolPairBase & {
  weightIn: number;
  weightOut: number;
};

export const getBalancerPoolPairData = async (
  network: Network,
  poolId: string,
  tokenIn: string,
  tokenOut: string
): Promise<BalancerWeightedPoolPairData> => {
  if (network !== "arbitrum")
    throw new Error("can only get pool pair data on arbitrum");
  const graphUrl = config.theGraphEndpoints.arbitrum.balancer;

  const { pool } = await request(
    graphUrl,
    gql`
        query {
          pool(id:"${poolId.toLowerCase()}") {
            id
            address
            poolType
            factory
            swapFee
            tokens(first:1000) {
              address
              decimals
              balance
              weight
            }
          }
        }
    `
  );

  const tokenInResponse = pool.tokens.find(
    (token: any) => token.address.toLowerCase() === tokenIn.toLowerCase()
  );
  const tokenOutResponse = pool.tokens.find(
    (token: any) => token.address.toLowerCase() === tokenOut.toLowerCase()
  );

  if (!tokenInResponse)
    throw new Error(`token in not in pool with id ${poolId}`);
  if (!tokenOutResponse)
    throw new Error(`token out not in pool with id ${poolId}`);

  return {
    id: pool.id,
    address: pool.address,
    swapFee: +pool.swapFee,
    tokenIn: tokenInResponse.address,
    tokenOut: tokenOutResponse.address,
    decimalsIn: +tokenInResponse.decimals,
    decimalsOut: +tokenOutResponse.decimals,
    balanceIn: +tokenInResponse.balance,
    balanceOut: +tokenOutResponse.balance,
    weightIn: +tokenInResponse.weight,
    weightOut: +tokenOutResponse.weight,
    poolType: pool.poolType,
  };
};

export const calculateBalancerWeightedPoolAmountOut = (
  sellAmount: BigNumber,
  poolPairData: BalancerWeightedPoolPairData
) => {
  // taken from https://github.com/balancer-labs/balancer-sor/blob/john/v2-package-linear/src/pools/weightedPool/weightedMath.ts
  const Bi = poolPairData.balanceIn;
  const Bo = poolPairData.balanceOut;
  const wi = poolPairData.weightIn;
  const wo = poolPairData.weightOut;
  const Ai = +ethers.utils.formatUnits(sellAmount, poolPairData.decimalsIn);
  const f = poolPairData.swapFee;
  const output = Bo * (1 - (Bi / (Bi + Ai * (1 - f))) ** (wi / wo));
  return ethers.utils.parseUnits(
    output.toFixed(poolPairData.decimalsOut),
    poolPairData.decimalsOut
  );
};

export const getBalancerPools = (token: string): BalancerPool[] => {
  return data.balancer.filter((p) =>
    p.tokens.some((t) => t.toLowerCase() === token.toLowerCase())
  );
};

export type BalancerPath = {
  tokenIn: TokenInfo;
  hlpBalancerToken: TokenInfo;
  tokenOut: TokenInfo;
  pool: BalancerPool;
};

export const getHlpToBalancerPath = (
  from: TokenInfo,
  to: TokenInfo
): BalancerPath => {
  if (!from.extensions?.isHlpToken && !from.extensions?.isNative) {
    throw new Error(`${from.symbol} is not a hLP token`);
  }
  if (to.extensions?.isHlpToken) {
    throw new Error("use hLP directly");
  }

  const [pool] = getBalancerPools(to.address);
  if (!pool) throw new Error("No pool found");
  const hlpTokens = HandleTokenManagerInstance.getHlpTokens("arbitrum");
  const hlpToken = hlpTokens.find((ht) =>
    pool.tokens.some((pt) => ht.address.toLowerCase() === pt.toLowerCase())
  );
  if (!hlpToken) throw new Error("hlp token not found");

  return {
    tokenIn: from,
    hlpBalancerToken: hlpToken,
    tokenOut: to,
    pool,
  };
};

export const getBalancerToHlpPath = (
  from: TokenInfo,
  to: TokenInfo
): BalancerPath => {
  // if there is a path from hLP to balancer, just reverse it to go the other way
  const path = getHlpToBalancerPath(to, from);
  return {
    ...path,
    tokenIn: path.tokenOut,
    tokenOut: path.tokenIn,
  };
};

export const doesHlpToBalancerPathExist = (from: TokenInfo, to: TokenInfo) => {
  try {
    getHlpToBalancerPath(from, to);
    return true;
  } catch (e) {
    return false;
  }
};

export const doesBalancerToHlpPathExist = (from: TokenInfo, to: TokenInfo) => {
  try {
    getBalancerToHlpPath(from, to);
    return true;
  } catch (e) {
    return false;
  }
};
