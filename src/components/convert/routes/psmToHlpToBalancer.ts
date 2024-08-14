import { TokenInfo } from "@uniswap/token-lists";
import { parseMainNetwork, Network } from "../../../types/network";
import { getBalancerPools } from "./utils/balancer";
import { combineFees, getTokenPegs } from "../../../utils/convert";
import { HandleTokenManagerInstance } from "../../token-manager/HandleTokenManager";
import {
  ConvertQuoteRouteArgs,
  ConvertTransactionRouteArgs,
  RawQuote,
} from "../";
import { HPSM_TO_HLP_TO_BALANCER, WeightInput } from "./weights";
import psm from "./psm";
import hlpBalancer from "./hlpBalancer";
import { BigNumber, ethers } from "ethers";
import config from "../../../config";
import { RouterHpsmHlpBalancer__factory } from "../../../contracts";
import { Pair } from "../../../types/trade";
import { fetchEncodedSignedQuotes } from "../../h2so";

const getPsmToHlpToBalancerPath = async (
  from: TokenInfo,
  to: TokenInfo,
  network: Network
) => {
  const pegs = await getTokenPegs(network);
  const balancerPools = getBalancerPools(to.address);

  const pool = balancerPools.find((pool) =>
    pool.tokens.some((token) =>
      HandleTokenManagerInstance.isHlpTokenByAddress(token, network)
    )
  );
  const peg = pegs.find(
    (peg) => peg.peggedToken.toLowerCase() === from.address.toLowerCase()
  );

  if (!pool || !peg) throw new Error("No pool or peg found");

  const hlpBalancerToken = pool.tokens.find(
    (token) => token.toLowerCase() !== to.address.toLowerCase()
  );

  if (!hlpBalancerToken) throw new Error("No hlpBalancer token found");

  return {
    peggedToken: peg.peggedToken,
    fxToken: peg.fxToken,
    hlpBalancerToken: hlpBalancerToken,
    tokenOut: to.address,
    poolId: pool.poolId,
    weight: HPSM_TO_HLP_TO_BALANCER,
  };
};

const psmToHlpToBalancerWeight = async (
  input: WeightInput
): Promise<number> => {
  const { weight } = await getPsmToHlpToBalancerPath(
    input.fromToken,
    input.toToken,
    input.network
  );
  return weight;
};

const psmToHlpToBalancerQuote = async (
  input: ConvertQuoteRouteArgs
): Promise<RawQuote> => {
  const protocol = config.protocol[parseMainNetwork(input.network)].protocol;
  const routerAddress = protocol.routers.routerHpsmHlpBalancer;
  if (!routerAddress) {
    throw new Error(`Router not found on network '${input.network}'`);
  }

  const path = await getPsmToHlpToBalancerPath(
    input.fromToken,
    input.toToken,
    input.network
  );

  const fxToken = HandleTokenManagerInstance.getTokenByAddress(
    path.fxToken,
    input.network
  );
  if (!fxToken) throw new Error("Could not find fxToken");

  const psmQuote = await psm.quote({
    ...input,
    toToken: fxToken,
  });

  const hlpToBalancerQuote = await hlpBalancer.quote({
    ...input,
    fromToken: fxToken,
    sellAmount: BigNumber.from(psmQuote.buyAmount),
  });

  return {
    buyAmount: hlpToBalancerQuote.buyAmount,
    sellAmount: input.sellAmount.toString(),
    feeBasisPoints: combineFees(
      psmQuote.feeBasisPoints,
      hlpToBalancerQuote.feeBasisPoints
    ),
    feeChargedBeforeConvert: false,
    allowanceTarget: [
      {
        target: routerAddress,
        amount: input.sellAmount,
        token: input.fromToken,
      },
    ],
    gas: config.convert.gasEstimates.hpsmHlpBalancer,
  };
};

const psmToHlpToBalancerTransaction = async (
  input: ConvertTransactionRouteArgs
): Promise<ethers.PopulatedTransaction> => {
  const protocol = config.protocol[parseMainNetwork(input.network)].protocol;
  const path = await getPsmToHlpToBalancerPath(
    input.fromToken,
    input.toToken,
    input.network
  );

  const router = RouterHpsmHlpBalancer__factory.connect(
    protocol.routers.routerHpsmHlpBalancer,
    input.signer
  );

  const fxToken = HandleTokenManagerInstance.getTokenByAddress(
    path.fxToken,
    input.network
  );
  const hlpBalancerToken = HandleTokenManagerInstance.getTokenByAddress(
    path.hlpBalancerToken,
    input.network
  );

  if (!fxToken || !hlpBalancerToken) {
    throw new Error("Could not find hLP tokens to swap");
  }

  const pairs: Pair[] = [
    {
      baseSymbol: fxToken.symbol,
      quoteSymbol: "USD",
    },
  ];

  if (fxToken.symbol !== hlpBalancerToken.symbol) {
    pairs.push({
      baseSymbol: hlpBalancerToken.symbol,
      quoteSymbol: "USD",
    });
  }

  const { encoded } = await fetchEncodedSignedQuotes(pairs);

  return router.populateTransaction.swapPeggedTokenToBalancer(
    path.peggedToken,
    path.fxToken,
    path.hlpBalancerToken,
    path.tokenOut,
    input.sellAmount,
    input.minOut,
    path.poolId,
    input.receivingAccount,
    encoded
  );
};

export default {
  weight: psmToHlpToBalancerWeight,
  quote: psmToHlpToBalancerQuote,
  transaction: psmToHlpToBalancerTransaction,
};
