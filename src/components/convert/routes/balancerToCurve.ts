import { TokenInfo } from "@uniswap/token-lists";
import { ethers } from "ethers";
import config from "../../../config";
import {
  BASIS_POINTS_DIVISOR,
  CURVE_FEE_DENOMINATOR,
} from "../../../constants";
import { RouterBalancerCurve__factory } from "../../../contracts";
import {
  BalancerPool,
  calculateBalancerWeightedPoolAmountOut,
  getBalancerPools,
  getBalancerPoolPairData,
} from "./utils/balancer";
import { CurvePool, getCurveAmountOut, getCurvePools } from "./utils/curve";
import {
  ConvertQuoteRouteArgs,
  ConvertTransactionRouteArgs,
  RawQuote,
} from "../";
import { BALANCER_TO_CURVE, WeightInput } from "./weights";
import { parseMainNetwork } from "../../../types/network";

const isTokenInOrOut = (address: string, tokenIn: string, tokenOut: string) =>
  address.toLowerCase() === tokenIn.toLowerCase() ||
  address.toLowerCase() === tokenOut.toLowerCase();

// finds a token that is in both balancer pool and curve pool, and is neither token in or token out
const getIntermediateToken = (
  balancerPool: BalancerPool,
  curvePool: CurvePool,
  tokenIn: string,
  tokenOut: string
) => {
  const curveTokens = [...curvePool.tokens, ...curvePool.underlying].filter(
    (t) => !isTokenInOrOut(t, tokenIn, tokenOut)
  );
  const balancerTokens = balancerPool.tokens.filter(
    (t) => !isTokenInOrOut(t, tokenIn, tokenOut)
  );
  return curveTokens.find((ct) =>
    balancerTokens.some((bt) => ct.toLowerCase() === bt.toLowerCase())
  );
};

const getBalancerToCurvePath = async (from: TokenInfo, to: TokenInfo) => {
  // get balancer pools containing from token
  const balancerPools = getBalancerPools(from.address);
  // get curve pools containing to token
  const curvePools = getCurvePools(to.address);
  // find pool with common token that isn't token in or token out
  for (const balancerPool of balancerPools) {
    for (const curvePool of curvePools) {
      const intermediateToken = getIntermediateToken(
        balancerPool,
        curvePool,
        from.address,
        to.address
      );
      if (!intermediateToken) continue;

      return {
        tokenIn: from,
        intermediateToken: intermediateToken,
        tokenOut: to,
        curvePool: curvePool.address,
        curveFactory: curvePool.factory,
        balancerPool: balancerPool.poolId,
        weight: BALANCER_TO_CURVE,
      };
    }
  }
  throw new Error(
    `No balancer to curve path found for ${from.symbol} to ${to.symbol}`
  );
};

const balancerToCurveWeight = async (input: WeightInput): Promise<number> => {
  const path = await getBalancerToCurvePath(input.fromToken, input.toToken);
  return path.weight;
};

const balancerToCurveQuote = async (
  input: ConvertQuoteRouteArgs
): Promise<RawQuote> => {
  const { sellAmount, fromToken, toToken, network, provider } = input;
  const path = await getBalancerToCurvePath(fromToken, toToken);

  const balancerData = await getBalancerPoolPairData(
    network,
    path.balancerPool,
    fromToken.address,
    path.intermediateToken
  );

  const balancerAmountOut = calculateBalancerWeightedPoolAmountOut(
    sellAmount,
    balancerData
  );

  const { fees, amountOutWithoutFees } = await getCurveAmountOut(
    path.curvePool,
    provider,
    path.intermediateToken,
    toToken.address,
    balancerAmountOut
  );

  return {
    allowanceTarget: [
      {
        target: config.protocol.arbitrum.protocol.routers.routerBalancerCurve,
        amount: input.sellAmount,
        token: input.fromToken,
      },
    ],
    sellAmount: sellAmount.toString(),
    buyAmount: amountOutWithoutFees.toString(),
    feeBasisPoints: +fees / (CURVE_FEE_DENOMINATOR / BASIS_POINTS_DIVISOR),
    feeChargedBeforeConvert: false,
    gas: 0,
  };
};

const balancerToCurveTransaction = async ({
  network,
  signer,
  fromToken,
  toToken,
  sellAmount,
  minOut,
  receivingAccount,
}: ConvertTransactionRouteArgs): Promise<ethers.PopulatedTransaction> => {
  const protocol = config.protocol[parseMainNetwork(network)].protocol;
  const routerAddress = protocol.routers.routerBalancerCurve;
  const router = RouterBalancerCurve__factory.connect(routerAddress, signer);
  const path = await getBalancerToCurvePath(fromToken, toToken);

  return router.populateTransaction.swapBalancerToCurve(
    path.tokenIn.address,
    path.intermediateToken,
    path.tokenOut.address,
    path.curveFactory,
    path.curvePool,
    path.balancerPool,
    sellAmount,
    minOut,
    receivingAccount
  );
};

export default {
  weight: balancerToCurveWeight,
  quote: balancerToCurveQuote,
  transaction: balancerToCurveTransaction,
};
