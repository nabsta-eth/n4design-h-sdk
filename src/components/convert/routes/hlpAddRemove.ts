import { BigNumber, ethers } from "ethers";
import { config } from "../../..";
import {
  AllowanceTarget,
  ConvertQuoteRouteArgs,
  ConvertTransactionRouteArgs,
  RawQuote,
} from "../";
import { HLP_ADD_REMOVE_WEIGHT, WeightInput } from "./weights";
import { fetchEncodedSignedQuotes } from "../../h2so";
import { pairFromString } from "../../../utils/general";
import {
  getTokenAmount,
  getUsdTokenAmount,
  isTradeWeekend,
} from "../../../utils/trade";
import { HandleTokenManagerInstance } from "../../token-manager/HandleTokenManager";
import { getMinOut } from "../../../utils/convert";
import { getHlpFeeBasisPoints } from "../../trade/platforms/hlp/internals";
import { hlp } from "../../trade/platforms";
import {
  getHlpContracts,
  isHlpAvailableForNetwork,
} from "../../trade/platforms/hlp/config";
import { PRICE_UNIT } from "../../trade/platforms/legacyInterface";

const hlpAddRemoveWeight = async (input: WeightInput) => {
  if (!isHlpAvailableForNetwork(input.network) || isTradeWeekend()) {
    return 0;
  }
  const isToValidHlp =
    HandleTokenManagerInstance.isHlpTokenByAddress(
      input.toToken.address,
      input.network
    ) || input.toToken.extensions?.isNative;
  const isFromValidHlp =
    HandleTokenManagerInstance.isHlpTokenByAddress(
      input.fromToken.address,
      input.network
    ) || input.fromToken.extensions?.isNative;
  if (
    (input.toToken.extensions?.isLiquidityToken && isFromValidHlp) ||
    (input.fromToken.extensions?.isLiquidityToken && isToValidHlp)
  ) {
    return HLP_ADD_REMOVE_WEIGHT;
  }
  return 0;
};

const hlpAddRemoveQuoteHandler = async (
  input: ConvertQuoteRouteArgs
): Promise<RawQuote> => {
  const { network, fromToken, toToken, sellAmount: fromAmount } = input;
  const { hlpManager, hlpRewardRouter } = getHlpContracts(network);

  // Parse ETH address into WETH address.
  const {
    parsedToken: { address: parsedFromTokenAddress, symbol: fromSymbol },
  } = HandleTokenManagerInstance.parseNativeToWrapped(fromToken);
  const {
    parsedToken: { address: parsedToTokenAddress, symbol: toSymbol },
  } = HandleTokenManagerInstance.parseNativeToWrapped(toToken);
  const isBuyingHlp = toToken.extensions?.isLiquidityToken;
  const nonLiquidityTokenSymbol = isBuyingHlp ? fromSymbol : toSymbol;

  const [
    hlpPrice,
    {
      marketPrice: { bestBid, bestAsk },
    },
    totalTokenWeights,
    usdHlpAmount,
    targetUsdHlpAmount,
  ] = await Promise.all([
    hlp.internals
      .getHlpPrice()
      .then((price) => (isBuyingHlp ? price.maximum : price.minimum)),
    hlp.internals.fetchUnsignedMarketPriceForPair(
      pairFromString(`${nonLiquidityTokenSymbol}/USD`)
    ),
    hlp.internals
      .fetchTokens()
      .then((tokens) =>
        tokens.reduce(
          (sum, token) => sum.add(token.tokenWeight),
          ethers.constants.Zero
        )
      ),
    hlp.internals.getTokenUsdHlpAmount(
      isBuyingHlp ? parsedFromTokenAddress : parsedToTokenAddress
    ),
    hlp.internals.getTokenTargetUsdHlpAmount(
      isBuyingHlp ? parsedFromTokenAddress : parsedToTokenAddress
    ),
  ]);

  // If buying hlp, then usdHlp delta is the price of the swap token (mul by the amount)
  let usdHlpDelta = getUsdTokenAmount(
    isBuyingHlp ? bestBid : hlpPrice,
    fromAmount
  );

  const feeBasisPoints = getHlpFeeBasisPoints({
    token: isBuyingHlp ? parsedFromTokenAddress : parsedToTokenAddress,
    usdHlpDelta,
    isBuy: !!isBuyingHlp,
    totalTokenWeights,
    targetUsdHlpAmount,
    usdHlpSupply: usdHlpAmount,
    config: await hlp.config.fetch(network),
  });

  if (isBuyingHlp) {
    const hlpAmount = usdHlpDelta.mul(PRICE_UNIT).div(hlpPrice);

    const allowanceTarget: AllowanceTarget = [
      {
        target: hlpRewardRouter.address,
        token: hlp.config.getInternalHlpToken(input.network),
        amount: hlpAmount,
      },
    ];

    if (!fromToken.extensions?.isNative) {
      allowanceTarget.push({
        target: hlpManager.address,
        token: fromToken,
        amount: fromAmount,
      });
    }

    return {
      allowanceTarget,
      sellAmount: fromAmount.toString(),
      buyAmount: hlpAmount.toString(),
      gas: config.convert.gasEstimates.hlp,
      feeBasisPoints: feeBasisPoints.toNumber(),
      feeChargedBeforeConvert: false,
    };
  }

  // The buy amount is the usdHlp delta divided by the price of the token (adjusted for decimals)
  if (bestAsk.isZero())
    throw new Error("hlpAddRemove: buy token price is zero");
  const buyAmount = getTokenAmount(bestAsk, usdHlpDelta, toToken.decimals);

  return {
    allowanceTarget: [],
    sellAmount: fromAmount.toString(),
    buyAmount: buyAmount.toString(),
    gas: config.convert.gasEstimates.hlp,
    feeBasisPoints: feeBasisPoints.toNumber(),
    feeChargedBeforeConvert: false,
  };
};

const hlpAddRemoveTransactionHandler = async ({
  network,
  signer,
  fromToken,
  toToken,
  receivingAccount: connectedAccount,
  sellAmount,
  minOut,
  slippage,
  referrer,
  gasPrice,
}: ConvertTransactionRouteArgs): Promise<ethers.PopulatedTransaction> => {
  const { hlpRewardRouter } = getHlpContracts(network, signer);
  referrer = referrer || ethers.constants.AddressZero;
  const {
    parsedToken: { address: fromAddress, symbol: fromSymbol },
    isInputNative: isFromNative,
  } = HandleTokenManagerInstance.parseNativeToWrapped(fromToken);
  const {
    parsedToken: { address: toAddress },
    isInputNative: isToNative,
  } = HandleTokenManagerInstance.parseNativeToWrapped(toToken);
  const { encoded: encodedSignedQuotes } = await fetchEncodedSignedQuotes(
    HandleTokenManagerInstance.getHlpTokens(network).map(({ symbol }) =>
      pairFromString(`${symbol}/USD`)
    )
  );

  // If selling Hlp and toToken is native
  if (fromToken.extensions?.isLiquidityToken && isToNative) {
    return hlpRewardRouter.populateTransaction.removeStakedLiquidityEth(
      BigNumber.from(sellAmount),
      minOut,
      connectedAccount,
      encodedSignedQuotes,
      { gasPrice }
    );
  }
  if (fromToken.extensions?.isLiquidityToken && !isToNative) {
    // If selling Hlp and toToken is not native
    return hlpRewardRouter.populateTransaction.removeStakedLiquidity(
      toAddress,
      BigNumber.from(sellAmount),
      minOut,
      connectedAccount,
      encodedSignedQuotes,
      { gasPrice }
    );
  }

  const {
    marketPrice: { bestBid: minFromPrice },
  } = await hlp.internals.fetchUnsignedMarketPriceForPair(
    pairFromString(`${fromSymbol}/USD`)
  );

  // buying hlp
  const usdAmount = getUsdTokenAmount(minFromPrice, sellAmount);
  const minPriceInUsdHlp = getMinOut(usdAmount, slippage);

  if (isFromNative) {
    return hlpRewardRouter.populateTransaction.addStakedLiquidityEth(
      minPriceInUsdHlp,
      minOut,
      referrer,
      encodedSignedQuotes,
      {
        value: BigNumber.from(sellAmount),
        gasPrice,
      }
    );
  }
  return hlpRewardRouter.populateTransaction.addStakedLiquidity(
    fromAddress,
    BigNumber.from(sellAmount),
    minPriceInUsdHlp,
    minOut,
    referrer,
    encodedSignedQuotes,
    { gasPrice }
  );
};

export default {
  weight: hlpAddRemoveWeight,
  quote: hlpAddRemoveQuoteHandler,
  transaction: hlpAddRemoveTransactionHandler,
};
