import config from "../../../config";
import {
  ConvertQuoteRouteArgs,
  ConvertTransactionRouteArgs,
  RawQuote,
} from "../";
import { BALANCER_TO_HLP, HLP_TO_BALANCER, WeightInput } from "./weights";
import hlpSwap from "./hlpSwap";
import { mustExist } from "../../../utils/general";
import {
  calculateBalancerWeightedPoolAmountOut,
  doesBalancerToHlpPathExist,
  doesHlpToBalancerPathExist,
  getBalancerPoolPairData,
  getBalancerToHlpPath,
  getHlpToBalancerPath,
  BalancerPath,
} from "./utils/balancer";
import { BigNumber, ethers } from "ethers";
import {
  RouterHlpBalancer__factory,
  RouterEthHlpBalancer__factory,
} from "../../../contracts";
import { Pair } from "../../../types/trade";
import { fetchEncodedSignedQuotes } from "../../h2so";
import { TokenInfo } from "@uniswap/token-lists";
import { HandleTokenManagerInstance } from "../../token-manager/HandleTokenManager";
import {
  MainNetwork,
  Network,
  isMainNetwork,
  parseMainNetwork,
} from "../../../types/network";
import { BASIS_POINTS_DIVISOR } from "../../../constants";

type Direction = "hlp to balancer" | "balancer to hlp";

const getDirection = (
  from: TokenInfo,
  to: TokenInfo
): Direction | undefined => {
  if (doesHlpToBalancerPathExist(from, to)) return "hlp to balancer";
  if (doesBalancerToHlpPathExist(from, to)) return "balancer to hlp";
  throw new Error(
    `No path between ${from.symbol} & ${to.symbol} in hLP/Balancer`
  );
};

const hlpBalancerWeight = async ({
  fromToken,
  toToken,
  network,
}: WeightInput): Promise<number> => {
  if (!isMainNetwork(network)) return 0;

  const direction = getDirection(fromToken, toToken);

  if (direction === "hlp to balancer") {
    return HLP_TO_BALANCER;
  }

  return BALANCER_TO_HLP;
};

const convertEthToWeth = (
  path: BalancerPath,
  network: Network
): BalancerPath => {
  const weth = mustExist(
    HandleTokenManagerInstance.getHlpWrappedNativeToken(network),
    `WETH on ${network}`
  );

  // treat eth as weth
  if (path.tokenIn.extensions?.isNative) {
    path.tokenIn = weth;
  }

  if (path.tokenOut.extensions?.isNative) {
    path.tokenOut = weth;
  }

  return path;
};

const getHlpToBalancerAmountAndFees = async (input: ConvertQuoteRouteArgs) => {
  const path = convertEthToWeth(
    getHlpToBalancerPath(input.fromToken, input.toToken),
    input.network
  );

  // initially assume there will be no hLP quote, so balancer amount in will be equal to the sell amount
  let balancerInAmount = input.sellAmount;
  let feeBasisPoints = 0;

  if (
    path.tokenIn.address.toLowerCase() !==
    path.hlpBalancerToken.address.toLowerCase()
  ) {
    // if tokenIn != hlpBalancerToken, a swap in the hLP is required
    const hlpQuote = await hlpSwap.quote({
      ...input,
      toToken: path.hlpBalancerToken,
    });

    // new balancer in amount is the amount out of the hLP swap, minus fees
    balancerInAmount = BigNumber.from(hlpQuote.buyAmount)
      .mul(BASIS_POINTS_DIVISOR - hlpQuote.feeBasisPoints)
      .div(BASIS_POINTS_DIVISOR);
    // new fees include hlpQuote fees
    feeBasisPoints += hlpQuote.feeBasisPoints;
  }

  // calculate buy amount out of balancer pool by using balancerInAmount
  const buyAmount = calculateBalancerWeightedPoolAmountOut(
    balancerInAmount,
    await getBalancerPoolPairData(
      input.network,
      path.pool.poolId,
      path.hlpBalancerToken.address,
      input.toToken.address
    )
  );

  return { buyAmount, feeBasisPoints };
};

const getBalancerToHlpAmountAndFees = async (input: ConvertQuoteRouteArgs) => {
  const path = convertEthToWeth(
    getBalancerToHlpPath(input.fromToken, input.toToken),
    input.network
  );

  // balancer is swapped first, based on the input sell amount
  const balancerAmountOut = calculateBalancerWeightedPoolAmountOut(
    input.sellAmount,
    await getBalancerPoolPairData(
      input.network,
      path.pool.poolId,
      path.tokenIn.address,
      path.hlpBalancerToken.address
    )
  );

  // assume no hLP swap is required so just set buyAmount to balancerAmountOut
  // and set feeBasisPoints to zero (see feeBasisPoints declaration as to why this is the case)
  let buyAmount = balancerAmountOut;
  let feeBasisPoints = 0;

  // if hlpBalancerToken is not the same as tokenOut, a hLP swap is required
  if (
    path.hlpBalancerToken.address.toLowerCase() !==
    path.tokenOut.address.toLowerCase()
  ) {
    const hlpQuote = await hlpSwap.quote({
      ...input,
      fromToken: path.hlpBalancerToken,
      sellAmount: balancerAmountOut,
    });
    // swap in the hLP, then set the buyAmount as the output of this swap
    buyAmount = BigNumber.from(hlpQuote.buyAmount);
    // include hlpQuote fee basis points in calculation
    feeBasisPoints += hlpQuote.feeBasisPoints;
  }

  return { buyAmount, feeBasisPoints };
};

const hlpBalancerQuote = async (
  input: ConvertQuoteRouteArgs
): Promise<RawQuote> => {
  parseMainNetwork(input.network);

  const direction = getDirection(input.fromToken, input.toToken);

  let buyAmount: BigNumber;

  // handle hLP fee (not including Balancer fees)
  let hlpFeeBasisPoints: number;

  if (direction === "hlp to balancer") {
    ({ buyAmount, feeBasisPoints: hlpFeeBasisPoints } =
      await getHlpToBalancerAmountAndFees(input));
  } else {
    ({ buyAmount, feeBasisPoints: hlpFeeBasisPoints } =
      await getBalancerToHlpAmountAndFees(input));
  }

  const protocol = config.protocol[input.network as MainNetwork].protocol;
  const allowanceTargetAddress =
    input.fromToken.extensions?.isNative || input.toToken.extensions?.isNative
      ? protocol.routers.routerEthHlpBalancer
      : protocol.routers.routerHlpBalancer;

  const allowances = {
    target: allowanceTargetAddress,
    amount: input.sellAmount,
    token: input.fromToken,
  };

  return {
    allowanceTarget: input.fromToken.extensions?.isNative ? [] : [allowances],
    buyAmount: buyAmount.toString(),
    feeBasisPoints: hlpFeeBasisPoints,
    feeChargedBeforeConvert: false,
    gas: config.convert.gasEstimates.hlpBalancer,
    sellAmount: input.sellAmount.toString(),
  };
};

const hlpBalancerTransaction = async (
  input: ConvertTransactionRouteArgs
): Promise<ethers.PopulatedTransaction> => {
  parseMainNetwork(input.network);
  const protocol = config.protocol[input.network as MainNetwork].protocol;
  const direction = getDirection(input.fromToken, input.toToken);

  const path =
    direction === "hlp to balancer"
      ? getHlpToBalancerPath(input.fromToken, input.toToken)
      : getBalancerToHlpPath(input.fromToken, input.toToken);

  const pairs: Pair[] = [
    {
      baseSymbol:
        direction === "hlp to balancer"
          ? path.tokenIn.symbol
          : path.tokenOut.symbol,
      quoteSymbol: "USD",
    },
    {
      baseSymbol: path.hlpBalancerToken.symbol,
      quoteSymbol: "USD",
    },
  ];

  const { encoded } = await fetchEncodedSignedQuotes(pairs);

  const isFromNative = !!path.tokenIn.extensions?.isNative;
  const isToNative = !!path.tokenOut.extensions?.isNative;

  if (isFromNative) {
    const router = RouterEthHlpBalancer__factory.connect(
      protocol.routers.routerEthHlpBalancer,
      input.signer
    );
    return router.populateTransaction.swapEthToBalancer(
      path.hlpBalancerToken.address,
      path.tokenOut.address,
      path.pool.poolId,
      input.minOut,
      input.receivingAccount,
      encoded,
      {
        value: input.sellAmount,
      }
    );
  }

  if (isToNative) {
    const router = RouterEthHlpBalancer__factory.connect(
      protocol.routers.routerEthHlpBalancer,
      input.signer
    );
    return router.populateTransaction.swapBalancerToEth(
      path.tokenIn.address,
      path.hlpBalancerToken.address,
      path.pool.poolId,
      input.sellAmount,
      input.minOut,
      input.receivingAccount,
      encoded
    );
  }

  const router = RouterHlpBalancer__factory.connect(
    protocol.routers.routerHlpBalancer,
    input.signer
  );

  const method =
    direction === "hlp to balancer" ? "swapHlpToBalancer" : "swapBalancerToHlp";

  return router.populateTransaction[method](
    path.tokenIn.address,
    path.hlpBalancerToken.address,
    path.tokenOut.address,
    path.pool.poolId,
    input.sellAmount,
    input.minOut,
    input.receivingAccount,
    encoded
  );
};

export default {
  weight: hlpBalancerWeight,
  quote: hlpBalancerQuote,
  transaction: hlpBalancerTransaction,
};
