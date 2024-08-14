import { ethers, Signer } from "ethers";
import { config, Network } from "../../..";
import { HPSM2, HPSM2__factory } from "../../../contracts";
import { getPsmFeeBasisPoints, isTokenPegged } from "../../../utils/convert";
import { transformDecimals } from "../../../utils/general";
import {
  ConvertQuoteRouteArgs,
  ConvertTransactionRouteArgs,
  RawQuote,
} from "../";
import { PSM_WEIGHT, WeightInput } from "./weights";
import { TokenInfo } from "@uniswap/token-lists";
import { isFxTokenSymbol } from "../../../utils/fxToken";
import { Provider } from "@ethersproject/providers";
import { BASIS_POINTS_DIVISOR } from "../../../constants";
import { parseMainNetwork } from "../../../types/network";

export const psmWeight = async (input: WeightInput) => {
  const { fromToken, toToken, network } = input;
  const isDeposit = await isTokenPegged(
    toToken.address,
    fromToken.address,
    network
  );
  return isDeposit ? PSM_WEIGHT : 0;
};

export const psmQuoteHandler = async (
  input: ConvertQuoteRouteArgs
): Promise<RawQuote> => {
  const {
    fromToken,
    toToken,
    provider,
    network,
    sellAmount: fromAmount,
  } = input;

  const hpsm = getContract(network, provider);
  const isDeposit = await isTokenPegged(
    toToken.address,
    fromToken.address,
    network
  );
  const peggedTokenAddress = getPsmTransactionCollateral(fromToken, toToken);
  const transactionFeeBasisPoints =
    (await getPsmFeeBasisPoints(peggedTokenAddress, isDeposit)) || 0;
  const buyAmount = transformDecimals(
    fromAmount,
    fromToken.decimals,
    toToken.decimals
  );
  const allowanceTarget = {
    target: hpsm.address,
    token: fromToken,
    amount: fromAmount,
  };
  return {
    allowanceTarget: isDeposit ? [allowanceTarget] : [],
    sellAmount: fromAmount.toString(),
    buyAmount: buyAmount.toString(),
    gas: config.convert.gasEstimates.hpsm,
    feeBasisPoints: transactionFeeBasisPoints,
    feeChargedBeforeConvert: false,
  };
};

export const psmTransactionHandler = async (
  input: ConvertTransactionRouteArgs
): Promise<ethers.PopulatedTransaction> => {
  const { network, signer, fromToken, toToken, sellAmount } = input;
  const hpsm = getContract(network, signer);
  const [isWithdraw, isDeposit] = await Promise.all([
    isTokenPegged(fromToken.address, toToken.address, network),
    isTokenPegged(toToken.address, fromToken.address, network),
  ]);

  const peggedTokenAddress = getPsmTransactionCollateral(fromToken, toToken);
  const fee = (await getPsmFeeBasisPoints(peggedTokenAddress, isDeposit)) || 0;

  // there is no min out built into the contract, so that is handled here
  if (fee > (input.slippage * BASIS_POINTS_DIVISOR) / 100) {
    throw new Error(`Min out not met`);
  }

  if (!isDeposit && !isWithdraw) {
    throw new Error(`There is no peg between ${fromToken} and ${toToken}`);
  }

  return isDeposit
    ? hpsm.populateTransaction.deposit(
        toToken.address,
        fromToken.address,
        sellAmount
      )
    : hpsm.populateTransaction.withdraw(
        fromToken.address,
        toToken.address,
        sellAmount
      );
};

/// This function assumes the pair peg is valid.
const getPsmTransactionCollateral = (
  fromToken: TokenInfo,
  toToken: TokenInfo
) => {
  const isDeposit = isFxTokenSymbol(toToken.symbol);
  return isDeposit
    ? fromToken.address // deposits from collateral token
    : toToken.address; // withdraws to collateral token
};

const getContract = (
  network: Network,
  signerOrProvider: Signer | Provider
): HPSM2 => {
  const hpsmAddress = config.protocol[parseMainNetwork(network)].protocol.hpsm;
  return HPSM2__factory.connect(hpsmAddress, signerOrProvider);
};

export default {
  weight: psmWeight,
  quote: psmQuoteHandler,
  transaction: psmTransactionHandler,
};
