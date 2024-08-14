import {
  BigNumber,
  constants,
  ContractTransaction,
  ethers,
  PopulatedTransaction,
} from "ethers";
import { parseUnits } from "ethers/lib/utils";
import sdkConfig from "../../../../../../config";
import { BASIS_POINTS_DIVISOR } from "../../../../../../constants";
import { ERC20__factory } from "../../../../../../contracts";
import { Pair } from "../../../../../../types/trade";
import {
  cachedArbitrumPegs,
  getPsmFeeBasisPointsFromCache,
  Peg,
} from "../../../../../../utils/convert";
import {
  getReversedPrice,
  getUsdQuotedPair,
  transformDecimals,
} from "../../../../../../utils/general";
import { applySlippage, getActionPrice } from "../../../../../../utils/trade";
import { HandleTokenManagerInstance } from "../../../../../token-manager/HandleTokenManager";
import {
  ApproveIncreasePositionArgs,
  CreateDecreasePositionOrderArgs,
  CreateIncreasePositionOrderArgs,
  DecreasePositionArgs,
  IncreasePositionArgs,
  SimulatePositionFees,
  UpdateDecreasePositionOrderArgs,
  UpdateIncreasePositionOrderArgs,
} from "../../../legacyInterface";
import { calculateFee, isEtherAddress, parseOrderId } from "../../../../utils";
import { approveCreateIncreasePositionOrder as approveCreateIncreasePositionOrderGeneric } from "../../../../utils/approveCreateIncreasePositionOrder";
import { TokenInfoGlp } from "../../../glp/internals/tokens";
import {
  DEFAULT_HLP_NETWORK,
  getActualHlpPairIfReversed,
  getHlpContracts,
  HLP_PLATFORM_NAME,
  shouldHlpPairBeReversed,
} from "../../config";
import { parseHlpTokenAddress } from "../parseHlpTokenAddress";
import { getSignedPrices } from "../prices";
import {
  fetchStablePairHlp,
  getTokenInfoByAddress,
  pairToTradePairHlp,
} from "../tokens";
import { fetchExecutionFee } from "./fetchExecutionFee";
import { getLeverage } from "./getLeverage";
import { getMaxWithdraw } from "./getMaxWithdraw";
import { getNextAveragePrice } from "./getNextAveragePrice";
import { getParsedPositionTokens } from "./getParsedPositionTokens";
import { getPositionDeltaForActualPosition } from "./getPositionDelta";
import { getPositionTokenList } from "./getPositionTokenList";
import { getTradeHistory } from "./getTradeHistory";
import { parseContractPosition } from "./parseContractPosition";
import { splitPositionArray } from "./splitPositionArray";

const getTradePeg = (collateralAddress: string) => {
  const pegs = cachedArbitrumPegs.get();
  return pegs.find(
    (peg) => peg.peggedToken.toLowerCase() === collateralAddress.toLowerCase()
  );
};

/**
 * Reverses the trigger price if the pair is reversed
 */
const getContractTriggerPrice = (pair: Pair, triggerPrice: BigNumber) => {
  const isReversed = shouldHlpPairBeReversed(getActualHlpPairIfReversed(pair));
  return isReversed ? getReversedPrice(triggerPrice) : triggerPrice;
};

const approveIncreasePosition = async ({
  collateralAddress,
  collateralDelta,
  signer,
  overrides,
  maximise = true,
}: ApproveIncreasePositionArgs): Promise<PopulatedTransaction[]> => {
  if (isEtherAddress(collateralAddress)) {
    return [];
  }
  const hpsmPeg = getTradePeg(collateralAddress);
  const erc20 = ERC20__factory.connect(collateralAddress, signer);
  const {
    router: hlpRouter,
    hpsmTradeRouter,
    vault,
  } = getHlpContracts(DEFAULT_HLP_NETWORK, signer);
  const transferrer = hpsmPeg
    ? sdkConfig.protocol.arbitrum.tokenTransferProxy
    : hlpRouter.address;

  const allowances: PopulatedTransaction[] = [];
  if (hpsmPeg) {
    const isApproved = await vault.approvedRouters(
      await signer.getAddress(),
      hpsmTradeRouter.address
    );
    if (!isApproved) {
      allowances.push(
        await vault.populateTransaction.addRouter(hpsmTradeRouter.address)
      );
    }
  }

  const currentAllowance = await erc20.allowance(
    await signer.getAddress(),
    transferrer
  );
  if (!currentAllowance.gte(collateralDelta)) {
    const approvalAmount = maximise
      ? ethers.constants.MaxUint256
      : collateralDelta.sub(currentAllowance);
    allowances.push(
      await erc20.populateTransaction.increaseAllowance(
        transferrer,
        approvalAmount,
        overrides
      )
    );
  }
  return allowances;
};

const getCollateralInViaHpsm = (peg: Peg, collateralDelta: BigNumber) => {
  const fee = getPsmFeeBasisPointsFromCache(peg.peggedToken, true) || 0;
  const peggedDecimals = HandleTokenManagerInstance.getTokenByAddress(
    peg.peggedToken,
    DEFAULT_HLP_NETWORK
  ).decimals;
  const decimalAdjustedCollateral = transformDecimals(
    collateralDelta,
    peggedDecimals,
    18
  ); // all fx tokens have 18 decimals
  return decimalAdjustedCollateral
    .mul(BASIS_POINTS_DIVISOR - +fee)
    .div(BASIS_POINTS_DIVISOR);
};

const getIncreasePositionParams = async ({
  pair,
  isLong,
  collateralAddress,
  collateralDelta,
  indexDelta,
  signer,
  slippagePercent,
}: IncreasePositionArgs) => {
  if (!signer.provider) throw new Error("Signer does not have a provider");
  const isReversedPair = shouldHlpPairBeReversed(
    getActualHlpPairIfReversed(pair)
  );
  if (isReversedPair) isLong = !isLong;
  const hpsmPeg = getTradePeg(collateralAddress);
  if (hpsmPeg) {
    collateralAddress = hpsmPeg.fxToken;
  }
  const {
    collateralToken: parsedInputCollateralToken,
    indexToken,
    isCollateralNative,
    parsedCollateralAddress: inputCollateralAddress,
    parsedIndexAddress: indexAddress,
  } = getParsedPositionTokens(
    collateralAddress,
    (await pairToTradePairHlp(pair)).indexAddress,
    DEFAULT_HLP_NETWORK
  );
  // Fetch stable hLP token pair, e.g. fxUSD/USD, which is needed for shorts.
  const stablePair = await fetchStablePairHlp();
  // The swap path is the input collateral token and the index token,
  // which may be the same and therefore only appear once.
  const path: string[] = [];
  // The prices that will be needed to execute the swap path & the index price.
  const pairs: Pair[] = [];

  // Apply users input collateral to path and pairs.
  path.push(inputCollateralAddress);
  pairs.push(getUsdQuotedPair(parsedInputCollateralToken.symbol));

  if (isLong) {
    // If long and input collateral is not the index token, add the index token.
    if (parsedInputCollateralToken.symbol !== indexToken.symbol) {
      path.push(indexAddress);
      pairs.push(getUsdQuotedPair(indexToken.symbol));
    }
  } else {
    // If short and the input collateral is not the stable token,
    // add the stable token.
    if (parsedInputCollateralToken.symbol !== stablePair.pair.baseSymbol) {
      path.push(stablePair.indexAddress);
      pairs.push(stablePair.pair);
    }
    // If neither the input collateral nor the stable token are the index
    // token, add the index token to the pairs only (not the path, since
    // the token the user is shorting does not need to be swapped).
    if (
      parsedInputCollateralToken.symbol !== indexToken.symbol &&
      stablePair.pair.baseSymbol !== indexToken.symbol
    ) {
      pairs.push(getUsdQuotedPair(indexToken.symbol));
    }
  }

  // Path and pairs are now set up, so the prices can be fetched.
  const [{ encoded: encodedQuoteSignature }, ...prices] = await getSignedPrices(
    pairs
  );
  // Note the path can only be 1 or 2 tokens long.
  // If it is 2 tokens long then the min out for the swap is set.
  let minOut = ethers.constants.Zero;
  if (path.length === 2) {
    const [inputPrice, outputPrice] = prices;

    // If there is a hpsm swap, the decimal difference and fees need to be
    // accounted for.
    const collateralIn = hpsmPeg
      ? getCollateralInViaHpsm(hpsmPeg, collateralDelta)
      : collateralDelta;

    const amountOut = collateralIn
      .mul(inputPrice.bestBid)
      .div(outputPrice.bestAsk);

    // Apply swap slippage.
    const slippageBps = Math.floor(
      (BASIS_POINTS_DIVISOR * (100 - slippagePercent)) / 100
    );
    minOut = amountOut.mul(slippageBps).div(BASIS_POINTS_DIVISOR);
  }

  // Find the mark price by finding the index of the respective
  // pair in the pairs array.
  const markPriceIndex = pairs.findIndex(
    (p) => p.baseSymbol === indexToken.symbol
  );
  const markPrice = getActionPrice(
    isLong,
    true,
    prices[markPriceIndex],
    slippagePercent
  );

  return {
    path,
    indexAddress,
    minOut,
    isLong,
    markPrice,
    encodedQuoteSignature,
    collateralDelta,
    isCollateralNative,
    collateralAddress: inputCollateralAddress,
    hpsmPeg,
    indexDelta,
  };
};

const approveCreateIncreasePositionOrder = async (
  args: ApproveIncreasePositionArgs
): Promise<PopulatedTransaction[]> => {
  const { router, orderBook } = getHlpContracts(
    DEFAULT_HLP_NETWORK,
    args.signer
  );
  return approveCreateIncreasePositionOrderGeneric(args, {
    router,
    orderBook,
  });
};

const createIncreasePositionOrder = async (
  args: CreateIncreasePositionOrderArgs
): Promise<ContractTransaction> => {
  const {
    path,
    indexAddress,
    minOut,
    isLong,
    encodedQuoteSignature,
    collateralDelta,
    isCollateralNative,
    hpsmPeg,
    indexDelta,
  } = await getIncreasePositionParams(args);
  const { overrides, signer, triggerPrice, shouldTriggerAboveThreshold } = args;

  if (hpsmPeg) {
    throw new Error("HPSM pegs not supported for order creation");
  }

  const { orderBook } = getHlpContracts(DEFAULT_HLP_NETWORK, signer);
  const executionFee = await fetchExecutionFee();
  return orderBook.createIncreaseOrder(
    encodedQuoteSignature,
    path,
    collateralDelta,
    indexAddress,
    minOut,
    indexDelta,
    path.at(-1)!,
    isLong,
    triggerPrice,
    shouldTriggerAboveThreshold,
    executionFee,
    isCollateralNative,
    {
      ...overrides,
      value: isCollateralNative
        ? collateralDelta.add(executionFee)
        : executionFee,
    }
  );
};

const increasePosition = async (
  args: IncreasePositionArgs
): Promise<ContractTransaction> => {
  const {
    path,
    indexAddress,
    minOut,
    indexDelta,
    isLong,
    markPrice,
    encodedQuoteSignature,
    collateralDelta,
    isCollateralNative,
    hpsmPeg,
  } = await getIncreasePositionParams(args);
  const { overrides, signer } = args;

  if (!hpsmPeg) {
    const { router } = getHlpContracts(DEFAULT_HLP_NETWORK, signer);
    return isCollateralNative
      ? router.increasePositionETHWithReferrer(
          path,
          indexAddress,
          minOut,
          indexDelta,
          isLong,
          markPrice,
          encodedQuoteSignature,
          constants.AddressZero,
          {
            ...overrides,
            value: collateralDelta,
          }
        )
      : router.increasePositionWithReferrer(
          path,
          indexAddress,
          collateralDelta,
          minOut,
          indexDelta,
          isLong,
          markPrice,
          encodedQuoteSignature,
          constants.AddressZero,
          overrides
        );
  } else {
    const { hpsmTradeRouter } = getHlpContracts(DEFAULT_HLP_NETWORK, signer);
    return hpsmTradeRouter.hpsmIncreasePositionWithReferrer(
      hpsmPeg.peggedToken,
      path,
      indexAddress,
      collateralDelta,
      minOut,
      indexDelta,
      isLong,
      markPrice,
      encodedQuoteSignature,
      constants.AddressZero,
      overrides
    );
  }
};

const updateIncreasePositionOrder = async (
  args: UpdateIncreasePositionOrderArgs
): Promise<ContractTransaction> => {
  const order = parseOrderId(args.orderId, HLP_PLATFORM_NAME);
  const { orderBook } = getHlpContracts(DEFAULT_HLP_NETWORK, args.signer);

  if (args.indexDelta.isZero() && args.collateralDelta.isZero()) {
    return orderBook.cancelIncreaseOrder(order.index, args.overrides);
  }

  return orderBook.updateIncreaseOrder(
    order.index,
    args.indexDelta,
    getContractTriggerPrice(args.pair, args.triggerPrice),
    args.shouldTriggerAboveThreshold,
    args.overrides
  );
};

const createDecreasePositionOrder = async (
  args: CreateDecreasePositionOrderArgs
): Promise<ContractTransaction> => {
  if (!args.signer.provider) {
    throw new Error("Signer does not have a provider");
  }

  const isReversedPair = shouldHlpPairBeReversed(
    getActualHlpPairIfReversed(args.pair)
  );
  if (isReversedPair) args.isLong = !args.isLong;
  const { indexAddress } = await pairToTradePairHlp(args.pair);
  const hpsmPeg = getTradePeg(args.collateralAddress);
  if (hpsmPeg)
    throw new Error("Decrease positions not supported for pegged tokens");

  const { parsedCollateralAddress } = getParsedPositionTokens(
    args.collateralAddress,
    indexAddress,
    DEFAULT_HLP_NETWORK
  );

  const { orderBook } = getHlpContracts(DEFAULT_HLP_NETWORK, args.signer);
  const executionFee = await fetchExecutionFee();
  return orderBook.createDecreaseOrder(
    indexAddress,
    args.indexDelta,
    parsedCollateralAddress,
    args.collateralDelta,
    args.isLong,
    getContractTriggerPrice(args.pair, args.triggerPrice),
    args.shouldTriggerAboveThreshold,
    {
      ...args.overrides,
      value: executionFee,
    }
  );
};

const updateDecreasePositionOrder = async (
  args: UpdateDecreasePositionOrderArgs
): Promise<ContractTransaction> => {
  const order = parseOrderId(args.orderId, HLP_PLATFORM_NAME);
  const { orderBook } = getHlpContracts(DEFAULT_HLP_NETWORK, args.signer);

  if (args.indexDelta.isZero() && args.collateralDelta.isZero()) {
    return orderBook.cancelDecreaseOrder(order.index, args.overrides || {});
  }

  return orderBook.updateDecreaseOrder(
    order.index,
    args.collateralDelta,
    args.indexDelta,
    getContractTriggerPrice(args.pair, args.triggerPrice),
    args.shouldTriggerAboveThreshold,
    args.overrides || {}
  );
};

const decreasePosition = async ({
  signer,
  pair,
  collateralAddress,
  receiveCollateralAddress,
  isLong,
  collateralDelta,
  indexDelta,
  receiver,
  overrides,
  slippagePercent,
}: DecreasePositionArgs): Promise<ContractTransaction> => {
  if (!signer.provider) {
    throw new Error("Signer does not have a provider");
  }
  const isReversedPair = shouldHlpPairBeReversed(
    getActualHlpPairIfReversed(pair)
  );
  if (isReversedPair) isLong = !isLong;
  const { indexAddress } = await pairToTradePairHlp(pair);
  const { router } = getHlpContracts(DEFAULT_HLP_NETWORK);
  const hpsmPeg = getTradePeg(receiveCollateralAddress || collateralAddress);
  if (hpsmPeg)
    throw new Error("Decrease positions not supported for pegged tokens");
  const {
    collateralToken: parsedCollateralToken,
    indexToken,
    isCollateralNative,
    parsedCollateralAddress,
  } = getParsedPositionTokens(
    collateralAddress,
    indexAddress,
    DEFAULT_HLP_NETWORK
  );
  const path = [parsedCollateralAddress];
  const shouldSwapCollateralOut = !!(
    receiveCollateralAddress &&
    receiveCollateralAddress.toLowerCase() !== path[0].toLowerCase()
  );
  const isReceiveCollateralNative =
    receiveCollateralAddress && isEtherAddress(receiveCollateralAddress);
  const isSwapFromWrappedToNative =
    parsedCollateralToken.symbol === "WETH" && isReceiveCollateralNative;
  const pairs = [getUsdQuotedPair(indexToken.symbol)];
  const isIndexAndCollateralTokenSame =
    parsedCollateralToken.symbol === indexToken.symbol;
  if (!isIndexAndCollateralTokenSame) {
    pairs.push(getUsdQuotedPair(parsedCollateralToken.symbol));
  }
  // Whether it is swapping collateral, and not from WETH to ETH.
  const isSwappingAndIsNotWrappedToNative =
    shouldSwapCollateralOut && !isSwapFromWrappedToNative;
  // Check whether is swapping, and that input and output aren't both ETH.
  if (isSwappingAndIsNotWrappedToNative) {
    const outToken = getTokenInfoByAddress(receiveCollateralAddress);
    path.push(outToken.address);
    pairs.push(getUsdQuotedPair(outToken.symbol));
  }
  const [{ encoded: encodedQuoteSignature }, ...prices] = await getSignedPrices(
    pairs
  );
  const marketPrice = prices[0];
  const markPrice = getActionPrice(isLong, false, marketPrice, slippagePercent);
  let minOut = applySlippage(
    collateralDelta
      .mul(parseUnits("1", parsedCollateralToken.decimals))
      .div(marketPrice.bestAsk),
    slippagePercent,
    true
  );
  if (isSwappingAndIsNotWrappedToNative) {
    const outPrice = isIndexAndCollateralTokenSame ? prices[1] : prices[2];
    const outToken = getTokenInfoByAddress(receiveCollateralAddress);
    // Convert minOut to units of the output token.
    minOut = applySlippage(
      collateralDelta
        .mul(parseUnits("1", outToken.decimals))
        .div(outPrice.bestAsk),
      slippagePercent,
      true
    );
  }
  // Whether ETH should be withdrawn, either by direct collateral or swapping.
  const shouldWithdrawEth =
    (!shouldSwapCollateralOut && isCollateralNative) ||
    (shouldSwapCollateralOut && isReceiveCollateralNative);
  if (path.length > 1) {
    const method = shouldWithdrawEth
      ? "decreasePositionAndSwapETH"
      : "decreasePositionAndSwap";
    return router
      .connect(signer)
      [method](
        path,
        indexAddress,
        collateralDelta,
        indexDelta,
        isLong,
        receiver ?? (await signer.getAddress()),
        markPrice,
        minOut,
        encodedQuoteSignature,
        overrides
      );
  }
  const method = isCollateralNative
    ? "decreasePositionETH"
    : "decreasePosition";
  return router
    .connect(signer)
    [method](
      parsedCollateralAddress,
      indexAddress,
      collateralDelta,
      indexDelta,
      isLong,
      receiver ?? (await signer.getAddress()),
      markPrice,
      encodedQuoteSignature,
      overrides
    );
};

/**
 * Calculates position fees from increasing or decreasing a position.
 * The following fees apply:
 * - Margin fee, applied to the delta of the position size
 * - Swap fee, applied if adding or removing collateral when the input
 *   collateral address differs from the position, requiring a swap.
 * As it is a sync function, it relies on a valid cache of the hLP config,
 * or throws if it does not exist.
 */
export const getSimulatePositionFees = (
  isIncrease: boolean,
  sizeDelta: BigNumber,
  collateralDelta: BigNumber,
  actualCollateralAddress: string,
  inputCollateralAddress: string,
  stableSwapFeeBasisPoints: number,
  swapFeeBasisPoints: number,
  marginFeeBasisPoints: number,
  getTokenByAddress: (address: string) => TokenInfoGlp,
  hpsmPeg?: Peg
): SimulatePositionFees => {
  actualCollateralAddress = parseHlpTokenAddress(actualCollateralAddress);
  inputCollateralAddress = parseHlpTokenAddress(inputCollateralAddress);
  const actualToken = getTokenByAddress(actualCollateralAddress);
  const inputToken = getTokenByAddress(inputCollateralAddress);
  const isSwap = actualCollateralAddress !== inputCollateralAddress;
  const isStableSwap =
    inputToken.extensions.isStable && actualToken.extensions.isStable;
  const swapFeeCategoryBps = isStableSwap
    ? stableSwapFeeBasisPoints
    : swapFeeBasisPoints;
  const actualSwapFeeBps = isSwap ? swapFeeCategoryBps : 0;
  const fromToken = isIncrease
    ? getTokenByAddress(inputCollateralAddress)
    : getTokenByAddress(actualCollateralAddress);
  const toToken = isIncrease
    ? getTokenByAddress(actualCollateralAddress)
    : getTokenByAddress(inputCollateralAddress);
  const marginAmountUsd = calculateFee(sizeDelta, marginFeeBasisPoints);
  const hpsmFee = hpsmPeg
    ? calculateHpsmFee(hpsmPeg.peggedToken, collateralDelta)
    : ethers.constants.Zero;
  const swapAmountUsd = calculateFee(
    collateralDelta.sub(hpsmFee),
    actualSwapFeeBps
  ).add(hpsmFee);
  const totalAmountUsd = marginAmountUsd.add(swapAmountUsd);
  return {
    totalAmountUsd,
    breakdown: {
      margin: {
        amountUsd: marginAmountUsd,
        metadata: undefined,
      },
      swap: {
        amountUsd: swapAmountUsd,
        metadata: {
          fromToken,
          toToken,
        },
      },
    },
  };
};

const calculateHpsmFee = (token: string, collateralDelta: BigNumber) => {
  return collateralDelta
    .mul(getPsmFeeBasisPointsFromCache(token, true) || 0)
    .div(BASIS_POINTS_DIVISOR);
};

export {
  approveIncreasePosition,
  approveCreateIncreasePositionOrder,
  increasePosition,
  decreasePosition,
  createIncreasePositionOrder,
  createDecreasePositionOrder,
  updateDecreasePositionOrder,
  updateIncreasePositionOrder,
  getLeverage,
  getNextAveragePrice,
  getParsedPositionTokens,
  getPositionDeltaForActualPosition,
  getPositionTokenList,
  getTradeHistory,
  parseContractPosition,
  splitPositionArray,
  getMaxWithdraw,
};
