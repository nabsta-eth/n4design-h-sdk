import { ethers } from "ethers";
import config from "../../../config";
import {
  BASIS_POINTS_DIVISOR,
  CURVE_FEE_DENOMINATOR,
} from "../../../constants";
import {
  CurveMetapoolFactory__factory,
  CurveMetapool__factory,
} from "../../../contracts";
import { getCurveAmountOut, getCurvePoolsWithBothTokens } from "./utils/curve";
import {
  ConvertQuoteRouteArgs,
  ConvertTransactionRouteArgs,
  RawQuote,
} from "../";
import { WeightInput, CURVE_BUY_HLP, CURVE_SELL_HLP } from "./weights";

const handleCurvePoolWeight = async (input: WeightInput): Promise<number> => {
  if (!input.provider) return 0;
  if (
    !input.fromToken.extensions?.isHlpToken &&
    !input.toToken.extensions?.isHlpToken
  ) {
    return 0; // cannot use handle curve pool if there is no hLP token
  }

  const pools = getCurvePoolsWithBothTokens(
    input.fromToken.address,
    input.toToken.address
  );

  if (pools.length === 0) return 0; // no pools available to use

  // note at this point at least one token (either from or to) is hLP token
  return input.fromToken.extensions?.isHlpToken
    ? CURVE_SELL_HLP
    : CURVE_BUY_HLP;
};

const handleCurvePoolQuote = async (
  input: ConvertQuoteRouteArgs
): Promise<RawQuote> => {
  const { provider, fromToken, toToken, sellAmount } = input;

  const pools = getCurvePoolsWithBothTokens(
    input.fromToken.address,
    input.toToken.address
  );
  if (pools.length === 0) throw new Error("No applicable curve pools found");
  const pool = pools[0]; // gets the first pool with both tokens

  const { fees, amountOutWithoutFees } = await getCurveAmountOut(
    pool.address,
    provider,
    fromToken.address,
    toToken.address,
    sellAmount
  );

  return {
    feeBasisPoints: (+fees / CURVE_FEE_DENOMINATOR) * BASIS_POINTS_DIVISOR,
    allowanceTarget: [
      {
        target: pool.address,
        amount: input.sellAmount,
        token: input.fromToken,
      },
    ],
    sellAmount: sellAmount.toString(),
    buyAmount: amountOutWithoutFees.toString(),
    feeChargedBeforeConvert: false,
    gas: config.convert.gasEstimates.curve,
  };
};

const handleCurvePoolTransaction = async (
  input: ConvertTransactionRouteArgs
): Promise<ethers.PopulatedTransaction> => {
  const pools = getCurvePoolsWithBothTokens(
    input.fromToken.address,
    input.toToken.address
  );
  if (pools.length === 0) throw new Error("No applicable curve pools found");
  const pool = pools[0]; // gets the first pool with both tokens

  const factory = CurveMetapoolFactory__factory.connect(
    pool.factory,
    input.signer
  );

  const [fromIndex, toIndex, useUnderlying] = await factory.get_coin_indices(
    pool.address,
    input.fromToken.address,
    input.toToken.address
  );

  const metapool = CurveMetapool__factory.connect(pool.address, input.signer);

  const method = useUnderlying
    ? "exchange_underlying(int128,int128,uint256,uint256)"
    : "exchange(int128,int128,uint256,uint256)";

  return metapool.populateTransaction[method](
    fromIndex,
    toIndex,
    input.sellAmount,
    input.minOut
  );
};

export default {
  weight: handleCurvePoolWeight,
  quote: handleCurvePoolQuote,
  transaction: handleCurvePoolTransaction,
};
