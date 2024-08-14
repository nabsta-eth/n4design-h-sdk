import * as Paraswap from "@paraswap/sdk";
import {
  ConvertQuoteRouteArgs,
  ConvertTransactionRouteArgs,
  RawQuote,
} from "../";
import { PARASWAP_WEIGHT } from "./weights";
import axios from "axios";
import { config, NETWORK_NAME_TO_CHAIN_ID, TokenInfo } from "../../..";
import { BigNumber, ethers } from "ethers";
import { getHandleConvertFeeAsPercentage } from "../getApiFeeAsPercentage";
import { percentageToBasisPoints } from "../../../utils/general";

const getParaswapSdkQuote = async (
  from: TokenInfo,
  to: TokenInfo,
  sellAmount: BigNumber
) => {
  const paraswapInstance = Paraswap.constructSimpleSDK({
    axios,
    network: from.chainId,
  });

  const optimalRate = await paraswapInstance.getRate({
    amount: sellAmount.toString(),
    srcToken: from.address,
    srcDecimals: from.decimals,
    destToken: to.address,
    destDecimals: to.decimals,
    options: {
      maxImpact: 100, // 100% as price impact not handled in sdk
    },
  });
  return optimalRate;
};

// paraswap can be used for any network
const paraswapWeight = async () => PARASWAP_WEIGHT;

const paraswapQuote = async (
  input: ConvertQuoteRouteArgs
): Promise<RawQuote> => {
  const convertFee = getHandleConvertFeeAsPercentage(
    input.fromToken.address,
    input.toToken.address
  );

  // paraswap also uses 0xeee...eee as ETH address, so no conversion required
  const priceQuote = await getParaswapSdkQuote(
    input.fromToken,
    input.toToken,
    input.sellAmount
  );

  return {
    allowanceTarget: !input.fromToken.extensions?.isNative
      ? [
          {
            // paraswap allowance target is not the same as the target of the swap tx
            target: priceQuote.tokenTransferProxy,
            token: input.fromToken,
            amount: input.sellAmount,
          },
        ]
      : [],
    buyAmount: priceQuote.destAmount,
    feeBasisPoints: percentageToBasisPoints(convertFee),
    feeChargedBeforeConvert: false,
    gas: +priceQuote.gasCost,
    sellAmount: input.sellAmount.toString(),
  };
};

const paraswapTransaction = async (
  input: ConvertTransactionRouteArgs
): Promise<ethers.PopulatedTransaction> => {
  const convertFee = getHandleConvertFeeAsPercentage(
    input.fromToken.address,
    input.toToken.address
  );

  const [optimalRate, userAddress] = await Promise.all([
    getParaswapSdkQuote(input.fromToken, input.toToken, input.sellAmount),
    input.signer.getAddress(),
  ]);

  const paraswapInstance = Paraswap.constructSimpleSDK({
    axios,
    network: NETWORK_NAME_TO_CHAIN_ID[input.network],
  });

  const tx = await paraswapInstance.buildTx(
    {
      srcToken: input.fromToken.address,
      destToken: input.toToken.address,
      srcAmount: input.sellAmount.toString(),
      destAmount: input.minOut.toString(),
      userAddress,
      receiver: input.receivingAccount,
      priceRoute: optimalRate,
      partnerAddress: config.convert.feeAddress,
      partnerFeeBps: percentageToBasisPoints(convertFee),
    },
    {
      // paraswap is sensitive to rate changes, and will throw
      // if the price has slightly changed. However, this is handled in
      // minOut (field destAmount above), so it can be ignored safely
      ignoreChecks: true,
    }
  );

  return {
    ...tx,
    gasPrice: BigNumber.from(tx.gasPrice),
    value: BigNumber.from(tx.value),
  };
};

export default {
  weight: paraswapWeight,
  quote: paraswapQuote,
  transaction: paraswapTransaction,
};
