import { ethers } from "ethers";
import { config } from "../../..";
import { WETH__factory } from "../../../contracts";
import { HandleTokenManagerInstance } from "../../token-manager/HandleTokenManager";
import {
  ConvertQuoteRouteArgs,
  ConvertTransactionRouteArgs,
  RawQuote,
} from "../";
import { WeightInput, WETH_WEIGHT } from "./weights";

const wethWeight = async (input: WeightInput): Promise<number> => {
  const weth = HandleTokenManagerInstance.getHlpWrappedNativeToken(
    input.network
  )?.address;
  if (!weth) return 0;
  if (
    (input.fromToken.address.toLowerCase() === weth.toLowerCase() &&
      input.toToken.extensions?.isNative) ||
    (input.toToken.address.toLowerCase() === weth.toLowerCase() &&
      input.fromToken.extensions?.isNative)
  ) {
    return WETH_WEIGHT;
  }
  return 0;
};

const wethQuoteHandler = async (
  input: ConvertQuoteRouteArgs
): Promise<RawQuote> => {
  return {
    allowanceTarget: [],
    buyAmount: input.sellAmount.toString(), // WETH swap is always 1 to 1
    sellAmount: input.sellAmount.toString(),
    gas: config.convert.gasEstimates.weth,
    feeBasisPoints: 0,
    feeChargedBeforeConvert: false,
  };
};

const wethTransactionHandler = async (
  input: ConvertTransactionRouteArgs
): Promise<ethers.PopulatedTransaction> => {
  const { fromToken, toToken, network, sellAmount, signer } = input;
  const weth = HandleTokenManagerInstance.getHlpWrappedNativeToken(
    input.network
  )?.address;

  if (input.minOut.gt(input.sellAmount)) {
    throw new Error("Min out not met");
  }

  if (!weth) throw new Error(`No WETH contract found for ${network}`);

  if (fromToken.extensions?.isNative && toToken.address === weth) {
    return WETH__factory.connect(weth, signer).populateTransaction.deposit({
      value: sellAmount,
    });
  }

  if (toToken.extensions?.isNative && fromToken.address === weth) {
    return WETH__factory.connect(weth, signer).populateTransaction.withdraw(
      sellAmount
    );
  }

  throw new Error("Invalid WETH swap");
};

export default {
  weight: wethWeight,
  quote: wethQuoteHandler,
  transaction: wethTransactionHandler,
};
