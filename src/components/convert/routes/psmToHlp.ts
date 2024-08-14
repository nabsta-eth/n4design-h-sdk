import { BigNumber, ethers } from "ethers";
import { combineFees, getTokenPegs } from "../../../utils/convert";
import {
  ConvertQuoteRouteArgs,
  ConvertTransactionRouteArgs,
  RawQuote,
} from "../";
import { PSM_TO_HLP, WeightInput } from "./weights";
import psm from "./psm";
import hlpSwap from "./hlpSwap";
import { HandleTokenManagerInstance } from "../../token-manager/HandleTokenManager";
import config from "../../../config";
import { fetchEncodedSignedQuotes } from "../../../components/h2so";
import { Pair } from "../../../types/trade";
import { isHlpMarketClosed } from "../../../utils/trade";
import { RouterHpsmHlp__factory } from "../../../contracts/factories/RouterHpsmHlp__factory";

const psmToHlpWeight = async (input: WeightInput): Promise<number> => {
  if (
    !input.toToken.extensions?.isHlpToken &&
    !input.toToken.extensions?.isNative
  )
    return 0;

  const pegs = await getTokenPegs(input.network);
  const validPeg = pegs.find(
    (peg) =>
      peg.peggedToken.toLowerCase() === input.fromToken.address.toLowerCase()
  );
  if (!validPeg) return 0;

  const fxToken = HandleTokenManagerInstance.getTokenByAddress(
    validPeg.fxToken,
    input.network
  );
  if (!fxToken) return 0;

  if (
    isHlpMarketClosed(fxToken.symbol) ||
    isHlpMarketClosed(input.toToken.symbol)
  )
    return 0;

  return PSM_TO_HLP;
};

const psmToHlpQuoteHandler = async (
  input: ConvertQuoteRouteArgs
): Promise<RawQuote> => {
  const pegs = await getTokenPegs(input.network);
  const validPeg = pegs.find(
    (peg) =>
      peg.peggedToken.toLowerCase() === input.fromToken.address.toLowerCase()
  );
  if (!validPeg) throw new Error("No Valid Peg");
  const fxToken = HandleTokenManagerInstance.getTokenByAddress(
    validPeg.fxToken,
    input.network
  );
  if (!fxToken) throw new Error("No fxToken found");

  const psmQuote = await psm.quote({
    ...input,
    toToken: fxToken,
  });

  const hlpSwapQuote = await hlpSwap.quote({
    ...input,
    // ignore fee here, it is adjusted for in fee basis points returned in the quote
    sellAmount: BigNumber.from(psmQuote.buyAmount),
    fromToken: fxToken,
  });

  const newFee = combineFees(
    psmQuote.feeBasisPoints,
    hlpSwapQuote.feeBasisPoints
  );

  return {
    sellAmount: psmQuote.sellAmount,
    buyAmount: hlpSwapQuote.buyAmount,
    allowanceTarget: [
      {
        target: config.protocol.arbitrum.protocol.routers.routerHpsmHlp,
        token: input.fromToken,
        amount: input.sellAmount,
      },
    ],
    feeBasisPoints: newFee,
    feeChargedBeforeConvert: false,
    gas: config.convert.gasEstimates.hpsmToHlp,
  };
};

const psmToHlpTransactionHandler = async (
  input: ConvertTransactionRouteArgs
): Promise<ethers.PopulatedTransaction> => {
  const address = config.protocol.arbitrum.protocol.routers.routerHpsmHlp;
  const routerHpsmHlp = RouterHpsmHlp__factory.connect(address, input.signer);

  const pegs = await getTokenPegs(input.network);
  const validPeg = pegs.find(
    (peg) =>
      peg.peggedToken.toLowerCase() === input.fromToken.address.toLowerCase()
  );
  if (!validPeg) throw new Error("No Valid Peg");

  const fxToken = HandleTokenManagerInstance.getTokenByAddress(
    validPeg.fxToken,
    input.network
  );
  if (!fxToken) throw new Error("Could not find fxToken");

  const pairs: Pair[] = [
    {
      baseSymbol: fxToken.symbol,
      quoteSymbol: "USD",
    },
    {
      baseSymbol: input.toToken.symbol,
      quoteSymbol: "USD",
    },
  ];

  const { encoded } = await fetchEncodedSignedQuotes(pairs);

  if (input.toToken.extensions?.isNative) {
    return routerHpsmHlp.populateTransaction.swapPeggedTokenToEth(
      input.fromToken.address,
      validPeg.fxToken,
      input.sellAmount,
      input.minOut,
      input.receivingAccount,
      encoded
    );
  }

  return routerHpsmHlp.populateTransaction.swapPeggedTokenToHlpToken(
    input.fromToken.address,
    validPeg.fxToken,
    input.toToken.address,
    input.sellAmount,
    input.minOut,
    input.receivingAccount,
    encoded
  );
};

export default {
  weight: psmToHlpWeight,
  quote: psmToHlpQuoteHandler,
  transaction: psmToHlpTransactionHandler,
};
