import { combineFees } from "../../../utils/convert";
import { getCurveAmountOut, getHlpToCurvePath } from "./utils/curve";
import {
  ConvertQuoteRouteArgs,
  ConvertTransactionRouteArgs,
  RawQuote,
} from "../";
import { HLP_TO_CURVE, WeightInput } from "./weights";
import hlpSwap from "./hlpSwap";
import { HandleTokenManagerInstance } from "../../token-manager/HandleTokenManager";
import { RouterHpsmHlpCurveV2__factory } from "../../../contracts";
import {
  BASIS_POINTS_DIVISOR,
  CURVE_FEE_DENOMINATOR,
} from "../../../constants";
import { config } from "../../..";
import { ethers } from "ethers";
import { Pair } from "../../../types/trade";
import { fetchEncodedSignedQuotes } from "../../h2so";

const hlpToCurveWeight = async (input: WeightInput) => {
  if (
    !input.fromToken.extensions?.isFxToken &&
    !input.fromToken.extensions?.isNative
  )
    return 0;
  if (!input.provider) return 0;
  if (input.toToken.extensions?.isNative) return 0;

  const path = await getHlpToCurvePath(
    input.fromToken.address,
    input.toToken.address,
    input.network
  );

  if (path.hlpToken === path.hlpCurveToken) return 0; // use curve directly

  return HLP_TO_CURVE;
};

const hlpToCurveQuote = async (
  input: ConvertQuoteRouteArgs
): Promise<RawQuote> => {
  const path = await getHlpToCurvePath(
    input.fromToken.address,
    input.toToken.address,
    input.network
  );

  const intermediateToken = HandleTokenManagerInstance.getTokenByAddress(
    path.hlpCurveToken,
    input.network
  );
  if (!intermediateToken) throw new Error("No intermediate token");

  const hlpSwapQuote = await hlpSwap.quote({
    ...input,
    toToken: intermediateToken,
  });

  const { fees, amountOutWithoutFees } = await getCurveAmountOut(
    path.pool,
    input.provider,
    path.hlpCurveToken,
    path.curveToken,
    hlpSwapQuote.buyAmount
  );

  const combinedFees = combineFees(
    hlpSwapQuote.feeBasisPoints,
    fees, // safely can be cast to number as it is always under 1e10
    BASIS_POINTS_DIVISOR,
    CURVE_FEE_DENOMINATOR
  );

  const allowanceTarget = {
    target: config.protocol.arbitrum.protocol.routers.routerHpsmHlpCurve,
    token: input.fromToken,
    amount: input.sellAmount,
  };

  return {
    feeBasisPoints: combinedFees,
    allowanceTarget: input.fromToken.extensions?.isNative
      ? []
      : [allowanceTarget],
    sellAmount: hlpSwapQuote.sellAmount,
    buyAmount: amountOutWithoutFees.toString(),
    feeChargedBeforeConvert: false,
    gas: config.convert.gasEstimates.hpsmToHlpToCurve,
  };
};

const hlpToCurveTransaction = async (
  input: ConvertTransactionRouteArgs
): Promise<ethers.PopulatedTransaction> => {
  const path = await getHlpToCurvePath(
    input.fromToken.address,
    input.toToken.address,
    input.network
  );

  const router = RouterHpsmHlpCurveV2__factory.connect(
    config.protocol.arbitrum.protocol.routers.routerHpsmHlpCurve,
    input.signer
  );

  const hlpToken = HandleTokenManagerInstance.getTokenByAddress(
    path.hlpToken,
    input.network
  );
  const hlpCurveToken = HandleTokenManagerInstance.getTokenByAddress(
    path.hlpCurveToken,
    input.network
  );

  if (!hlpCurveToken || !hlpToken) throw new Error("Could not find token");

  const pairs: Pair[] = [
    {
      baseSymbol: hlpToken.symbol,
      quoteSymbol: "USD",
    },
    {
      baseSymbol: hlpCurveToken.symbol,
      quoteSymbol: "USD",
    },
  ];

  const { encoded } = await fetchEncodedSignedQuotes(pairs);

  if (input.fromToken.extensions?.isNative) {
    return router.populateTransaction.swapEthToCurveToken(
      hlpCurveToken.address,
      input.toToken.address,
      input.receivingAccount,
      input.minOut,
      path.factory,
      path.pool,
      encoded,
      { value: input.sellAmount }
    );
  }

  return router.populateTransaction.swapHlpTokenToCurveToken(
    path.hlpToken,
    path.hlpCurveToken,
    path.curveToken,
    input.sellAmount,
    input.receivingAccount,
    input.minOut,
    path.factory,
    path.pool,
    encoded
  );
};

export default {
  quote: hlpToCurveQuote,
  weight: hlpToCurveWeight,
  transaction: hlpToCurveTransaction,
};
