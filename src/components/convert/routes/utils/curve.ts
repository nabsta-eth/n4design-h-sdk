import { BigNumberish, ethers } from "ethers";
import { CURVE_FEE_DENOMINATOR } from "../../../../constants";
import { CurveMetapool__factory } from "../../../../contracts";
import { Network } from "../../../../types/network";
import { getTokenPegs } from "../../../../utils/convert";
import { HandleTokenManagerInstance } from "../../../token-manager/HandleTokenManager";
import data from "../data.json";

export type CurvePool = (typeof data)["curve"][0];

export const isValidCurvePoolSwap = async (
  tokenIn: string,
  tokenOut: string
): Promise<boolean> => {
  return data.curve.some((pool) => {
    const tokens = [pool.tokens, pool.underlying].flat();
    return (
      tokens.some((t) => t.toLowerCase() === tokenIn.toLowerCase()) &&
      tokens.some((t) => t.toLowerCase() === tokenOut.toLowerCase())
    );
  });
};

// The same as the findCurvePoolForHlpTokenSwap, but with a cache first approach
export const getCurvePools = (token: string) =>
  data.curve.filter((pool) =>
    [...pool.tokens, ...pool.underlying].some(
      (t) => t.toLowerCase() === token.toLowerCase()
    )
  );

export const getCurvePoolsWithBothTokens = (token1: string, token2: string) => {
  return data.curve.filter((pool) => {
    const tokens = [...pool.tokens, ...pool.underlying];
    const hasToken1 = tokens.some(
      (t) => t.toLowerCase() === token1.toLowerCase()
    );
    const hasToken2 = tokens.some(
      (t) => t.toLowerCase() === token2.toLowerCase()
    );
    return hasToken1 && hasToken2;
  });
};

export type PsmToHlpToCurvePath = {
  peggedToken: string;
  fxToken: string;
  hlpToken: string;
  curveToken: string;
  pool: string;
  factory: string;
};

export const getPsmToHlpToCurvePath = async (
  from: string,
  to: string,
  network: Network
): Promise<PsmToHlpToCurvePath> => {
  if (network !== "arbitrum")
    throw new Error(`Cannot get hLP path on ${network}`);
  const pegs = await getTokenPegs(network);

  const validPeg = pegs.find(
    (peg) => peg.peggedToken.toLowerCase() === from.toLowerCase()
  );
  const [curvePool] = getCurvePools(to);

  if (!validPeg) throw new Error("No valid peg found");
  if (!curvePool) throw new Error("No curve pool found");

  const hlpTokens = HandleTokenManagerInstance.getHlpTokens(network);
  const hlpToken = curvePool.tokens.find((token) =>
    hlpTokens.some((t) => t.address.toLowerCase() === token.toLowerCase())
  );
  // this won't happen, so long as the curve pool has a fxToken
  if (!hlpToken) throw new Error("No hLP token found");

  return {
    peggedToken: from,
    fxToken: validPeg.fxToken,
    hlpToken: hlpToken,
    curveToken: to,
    factory: curvePool.factory,
    pool: curvePool.address,
  };
};

export type HlpToCurvePath = {
  hlpToken: string;
  hlpCurveToken: string;
  curveToken: string;
  pool: string;
  factory: string;
};

export const getHlpToCurvePath = async (
  from: string,
  to: string,
  network: Network
): Promise<HlpToCurvePath> => {
  if (network !== "arbitrum") throw new Error(`Only arbitrum is supported`);

  // gets first applicable pool or undefined if none exists
  const [curvePool] = getCurvePools(to);

  // pool cannot be applicable if it has no factory address, or if it does not exist
  if (!curvePool) throw new Error("No applicable pool exists");

  const hlpTokens = HandleTokenManagerInstance.getHlpTokens(network);
  const hlpToken = curvePool.tokens.find((token) =>
    hlpTokens.some((t) => t.address.toLowerCase() === token.toLowerCase())
  );
  // this won't happen, so long as the curve pool has a fxToken
  if (!hlpToken) throw new Error("No hLP token in pool");

  return {
    hlpToken: from,
    hlpCurveToken: hlpToken,
    curveToken: to,
    pool: curvePool.address,
    factory: curvePool.factory,
  };
};

export const getCurveAmountOut = async (
  pool: string,
  signerOrProvider: ethers.Signer | ethers.providers.Provider,
  tokenIn: string,
  tokenOut: string,
  amountIn: BigNumberish
) => {
  const curvePool = data.curve.find(
    (p) => p.address.toLowerCase() === pool.toLowerCase()
  );
  if (!curvePool) throw new Error(`No pool found with address`);
  const tokens = [...curvePool.tokens, ...curvePool.underlying];

  const fromIndex = tokens.indexOf(tokenIn);
  const toIndex = tokens.indexOf(tokenOut);
  const useUnderlying =
    Math.max(fromIndex, toIndex) > curvePool.tokens.length - 1;
  if (fromIndex === -1 || toIndex === -1) throw new Error("Token not in pool");

  const poolContract = CurveMetapool__factory.connect(pool, signerOrProvider);
  const amountOut = useUnderlying
    ? await poolContract.get_dy_underlying(fromIndex, toIndex, amountIn)
    : await poolContract.get_dy(fromIndex, toIndex, amountIn);

  // multiply amount out (which includes fees) by the reciprocal of fees
  const amountOutWithoutFees = amountOut
    .mul(CURVE_FEE_DENOMINATOR)
    .div(CURVE_FEE_DENOMINATOR - curvePool.fee);

  return {
    amountOut,
    fees: curvePool.fee,
    amountOutWithoutFees,
  };
};
