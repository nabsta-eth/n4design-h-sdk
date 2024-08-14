import { BigNumber, ethers } from "ethers";
import { combineFees } from "../../../utils/convert";
import {
  getCurveAmountOut,
  getPsmToHlpToCurvePath,
  PsmToHlpToCurvePath,
} from "./utils/curve";
import {
  ConvertQuoteRouteArgs,
  ConvertTransactionRouteArgs,
  RawQuote,
} from "../";
import { PSM_TO_HLP_TO_CURVE, WeightInput } from "./weights";
import psmToHlp from "./psmToHlp";
import { HandleTokenManagerInstance } from "../../token-manager/HandleTokenManager";
import { config, Network } from "../../..";
import { RouterHpsmHlpCurveV2__factory } from "../../../contracts";
import { Pair } from "../../../types/trade";
import { fetchEncodedSignedQuotes } from "../../h2so";
import {
  BASIS_POINTS_DIVISOR,
  CURVE_FEE_DENOMINATOR,
} from "../../../constants";

const cache: Map<string, PsmToHlpToCurvePath> = new Map();

const getPsmToHlpToCurvePathFromCache = async (
  from: string,
  to: string,
  network: Network
): Promise<PsmToHlpToCurvePath> => {
  const key = `${from}${to}${network}`;
  const cacheResult = cache.get(key);
  if (cacheResult !== undefined) return cacheResult;
  cache.set(key, await getPsmToHlpToCurvePath(from, to, network));
  return cache.get(key)!;
};

const psmToHlpToCurveWeight = async (input: WeightInput): Promise<number> => {
  if (!input.provider) return 0; // must have signer to check curve pool

  const path = await getPsmToHlpToCurvePathFromCache(
    input.fromToken.address,
    input.toToken.address,
    input.network
  );

  const hlpToken = HandleTokenManagerInstance.getTokenByAddress(
    path.hlpToken,
    input.network
  );
  if (!hlpToken) return 0;

  // to go from psm to hlp to curve, one must first go from psm to hlp - Confucious
  if ((await psmToHlp.weight({ ...input, toToken: hlpToken })) === 0) {
    return 0;
  }

  return PSM_TO_HLP_TO_CURVE;
};

const psmToHlpToCurveQuoteHandler = async (
  input: ConvertQuoteRouteArgs
): Promise<RawQuote> => {
  const path = await getPsmToHlpToCurvePathFromCache(
    input.fromToken.address,
    input.toToken.address,
    input.network
  );

  const intermediateToken = HandleTokenManagerInstance.getTokenByAddress(
    path.hlpToken,
    input.network
  );
  if (!intermediateToken) throw new Error("No intermediate token");

  const psmToHlpQuote = await psmToHlp.quote({
    ...input,
    toToken: intermediateToken,
  });

  const { fees, amountOutWithoutFees } = await getCurveAmountOut(
    path.pool,
    input.provider,
    path.hlpToken,
    path.curveToken,
    psmToHlpQuote.buyAmount
  );

  const combinedFees = combineFees(
    psmToHlpQuote.feeBasisPoints,
    fees, // safely can be cast to number as it is always under 1e10
    BASIS_POINTS_DIVISOR,
    CURVE_FEE_DENOMINATOR
  );

  return {
    feeBasisPoints: combinedFees,
    allowanceTarget: [
      {
        target: config.protocol.arbitrum.protocol.routers.routerHpsmHlpCurve,
        token: input.fromToken,
        amount: BigNumber.from(psmToHlpQuote.sellAmount),
      },
    ],
    sellAmount: psmToHlpQuote.sellAmount,
    buyAmount: amountOutWithoutFees.toString(),
    feeChargedBeforeConvert: false,
    gas: config.convert.gasEstimates.hpsmToHlpToCurve,
  };
};

const psmToHlpToCurveTransactionHandler = async (
  input: ConvertTransactionRouteArgs
): Promise<ethers.PopulatedTransaction> => {
  const path = await getPsmToHlpToCurvePathFromCache(
    input.fromToken.address,
    input.toToken.address,
    input.network
  );
  if (!path) throw new Error("No path found for psmToHlpToCurve swap");
  const router = RouterHpsmHlpCurveV2__factory.connect(
    config.protocol.arbitrum.protocol.routers.routerHpsmHlpCurve,
    input.signer
  );

  const fxToken = HandleTokenManagerInstance.getTokenByAddress(
    path.fxToken,
    input.network
  );
  const hlpToken = HandleTokenManagerInstance.getTokenByAddress(
    path.hlpToken,
    input.network
  );

  if (!fxToken || !hlpToken) throw new Error("Could not find token");

  const pairs: Pair[] = [
    {
      baseSymbol: fxToken.symbol,
      quoteSymbol: "USD",
    },
  ];

  if (fxToken.symbol !== hlpToken.symbol) {
    pairs.push({
      baseSymbol: hlpToken.symbol,
      quoteSymbol: "USD",
    });
  }

  const { encoded } = await fetchEncodedSignedQuotes(pairs);

  return router.populateTransaction.swapPeggedTokenToCurveToken(
    path.peggedToken,
    path.fxToken,
    path.hlpToken,
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
  weight: psmToHlpToCurveWeight,
  quote: psmToHlpToCurveQuoteHandler,
  transaction: psmToHlpToCurveTransactionHandler,
};
