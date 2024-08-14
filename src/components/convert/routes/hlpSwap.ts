import { ethers } from "ethers";
import { config } from "../../..";
import {
  ConvertQuoteRouteArgs,
  ConvertTransactionRouteArgs,
  RawQuote,
} from "../";
import { HLP_SWAP_WEIGHT, WeightInput } from "./weights";
import { fetchEncodedSignedQuotes } from "../../h2so";
import { getUsdQuotedPair, pairFromString } from "../../../utils/general";
import { isHlpMarketClosed } from "../../../utils/trade";
import { HandleTokenManagerInstance } from "../../token-manager/HandleTokenManager";
import { getSwapFeeBasisPoints } from "../../trade/platforms/hlp/internals";
import {
  getHlpContracts,
  isHlpAvailableForNetwork,
} from "../../trade/platforms/hlp/config";
import { hlp } from "../../trade/platforms";
import { PRICE_DECIMALS } from "../../trade/platforms/legacyInterface";
import { TradePairHlp } from "../../trade/platforms/hlp/internals/tokens";
import sdk from "../../../utils/sdk";

const hlpSwapWeight = async (input: WeightInput): Promise<number> => {
  if (!isHlpAvailableForNetwork(input.network)) return 0;
  if (
    isHlpMarketClosed(input.fromToken.symbol) ||
    isHlpMarketClosed(input.toToken.symbol)
  ) {
    return 0;
  }
  const isToTokenValid =
    HandleTokenManagerInstance.isHlpTokenBySymbol(
      input.toToken.symbol,
      input.network
    ) || input.toToken.extensions?.isNative;
  const isFromTokenValid =
    HandleTokenManagerInstance.isHlpTokenBySymbol(
      input.fromToken.symbol,
      input.network
    ) || input.fromToken.extensions?.isNative;
  if (isToTokenValid && isFromTokenValid) {
    return HLP_SWAP_WEIGHT;
  }
  return 0;
};

const hlpSwapQuoteHandler = async (
  input: ConvertQuoteRouteArgs
): Promise<RawQuote> => {
  const start = Date.now();
  const { network, fromToken, toToken, sellAmount: fromAmount } = input;
  const routerAddress = getHlpContracts(network).router.address;
  if (!routerAddress)
    throw new Error(`Network ${network} does not have a Router contract`);
  // Parse ETH address into WETH address.
  const {
    parsedToken: { address: parsedFromTokenAddress, symbol: fromSymbol },
  } = HandleTokenManagerInstance.parseNativeToWrapped(fromToken);
  const {
    parsedToken: { address: parsedToTokenAddress, symbol: toSymbol },
  } = HandleTokenManagerInstance.parseNativeToWrapped(toToken);
  const [
    { marketPrice: priceInSpread },
    { marketPrice: priceOutSpread },
    usdHlpSupplyTokenIn,
    usdHlpSupplyTokenOut,
    totalTokenWeights,
    targetUsdHlpAmountTokenIn,
    targetUsdHlpAmountTokenOut,
  ] = await Promise.all([
    hlp.internals.fetchUnsignedMarketPriceForPair(getUsdQuotedPair(fromSymbol)),
    hlp.internals.fetchUnsignedMarketPriceForPair(getUsdQuotedPair(toSymbol)),
    hlp.internals.getTokenUsdHlpAmount(parsedFromTokenAddress),
    hlp.internals.getTokenUsdHlpAmount(parsedToTokenAddress),
    hlp.trade
      .getTradePairs()
      .then((tokens) =>
        (tokens as TradePairHlp[]).reduce(
          (sum, token) => sum.add(token.internals.hlpToken.tokenWeight),
          ethers.constants.Zero
        )
      ),
    hlp.internals.getTokenTargetUsdHlpAmount(parsedFromTokenAddress),
    hlp.internals.getTokenTargetUsdHlpAmount(parsedToTokenAddress),
  ]);
  if (!priceInSpread || !priceOutSpread) {
    throw new Error("hlpSwapQuoteHandler: could not fetch prices");
  }
  const priceIn = priceInSpread.bestBid;
  const priceOut = priceOutSpread.bestAsk;
  if (priceIn.isZero() || priceOut.isZero()) {
    console.error(
      `Price in: ${priceIn.toString()}. Price out: ${priceOut.toString()}`
    );
    throw new Error("hLP price is zero");
  }
  const amountOut = fromAmount.mul(priceIn).div(priceOut);
  const feeBasisPoints = getSwapFeeBasisPoints({
    tokenIn: parsedFromTokenAddress,
    tokenOut: parsedToTokenAddress,
    usdHlpDelta: priceIn
      .mul(fromAmount)
      .mul(ethers.utils.parseUnits("1", 18))
      .div(ethers.utils.parseUnits("1", PRICE_DECIMALS))
      .div(ethers.utils.parseUnits("1", fromToken.decimals)),
    usdHlpSupplyTokenIn,
    usdHlpSupplyTokenOut,
    totalTokenWeights,
    targetUsdHlpAmountTokenIn,
    targetUsdHlpAmountTokenOut,
    config: await hlp.config.fetch(network),
  });
  const allowanceTarget = {
    target: routerAddress,
    token: input.fromToken,
    amount: input.sellAmount,
  };
  sdk.trace(`hlpSwapQuoteHandler: ${Date.now() - start}ms`);
  return {
    allowanceTarget: input.fromToken.extensions?.isNative
      ? []
      : [allowanceTarget],
    buyAmount: amountOut.toString(),
    sellAmount: fromAmount.toString(),
    gas: config.convert.gasEstimates.hlp,
    feeBasisPoints: feeBasisPoints.toNumber(),
    feeChargedBeforeConvert: false,
  };
};

const hlpSwapTransactionHandler = async (
  input: ConvertTransactionRouteArgs
): Promise<ethers.PopulatedTransaction> => {
  const {
    network,
    receivingAccount: connectedAccount,
    signer,
    fromToken,
    toToken,
    sellAmount,
    minOut,
  } = input;
  const router = getHlpContracts(network).router.connect(signer);
  if (!router) throw new Error("hLP Router not available in this network");
  const {
    parsedToken: { address: fromAddress },
    isInputNative: isFromNative,
  } = HandleTokenManagerInstance.parseNativeToWrapped(fromToken);
  const {
    parsedToken: { address: toAddress },
    isInputNative: isToNative,
  } = HandleTokenManagerInstance.parseNativeToWrapped(toToken);

  const encodedSignedQuotes = await fetchEncodedSignedQuotes([
    pairFromString(`${fromToken.symbol}/USD`),
    pairFromString(`${toToken.symbol}/USD`),
  ]);

  if (!isFromNative && !isToNative) {
    return router.populateTransaction.swap(
      [fromAddress, toAddress],
      sellAmount,
      minOut,
      connectedAccount,
      encodedSignedQuotes.encoded
    );
  }

  if (isFromNative) {
    return router.populateTransaction.swapETHToTokens(
      [fromAddress, toAddress],
      minOut,
      connectedAccount,
      encodedSignedQuotes.encoded,
      { value: sellAmount }
    );
  }

  return router.populateTransaction.swapTokensToETH(
    [fromAddress, toAddress],
    sellAmount,
    minOut,
    connectedAccount,
    encodedSignedQuotes.encoded
  );
};

export default {
  weight: hlpSwapWeight,
  quote: hlpSwapQuoteHandler,
  transaction: hlpSwapTransactionHandler,
};
