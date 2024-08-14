import { ethers, BigNumber, constants } from "ethers";
import { HLP_PLATFORM_NAME, shouldHlpPairBeReversed } from "../../config";
import { getHlpPairFromIndex } from "../getHlpPairFromIndex";
import { TokenFundingRate } from "../fundingRate";
import { PositionHlp } from "../tokens";
import {
  getReversedPair,
  getReversedPrice,
} from "../../../../../../utils/general";
import { getFundingFee } from "../getFundingFee";
import { ETH_ADDRESS } from "../../../../utils";

const getPositionKey = (
  account: string,
  collateralTokenAddress: string,
  indexTokenAddress: string,
  isLong: boolean,
  nativeTokenAddress: string = ETH_ADDRESS
) => {
  const tokenAddress0 =
    collateralTokenAddress === constants.AddressZero
      ? nativeTokenAddress
      : collateralTokenAddress;
  const tokenAddress1 =
    indexTokenAddress === constants.AddressZero
      ? nativeTokenAddress
      : indexTokenAddress;
  return `${account}:${tokenAddress0}:${tokenAddress1}:${isLong}`;
};

export const parseContractPosition = (
  contractPosition: [
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    BigNumber,
    boolean,
    BigNumber
  ],
  collateralToken: string,
  indexToken: string,
  isLong: boolean,
  fundingRate: TokenFundingRate
): PositionHlp => {
  const [
    size,
    collateral,
    averagePrice,
    entryFundingRate,
    reserveAmount,
    realisedPnL,
    hasRealisedProfit,
    lastIncreasedTime,
  ] = contractPosition;
  const actualPosition: PositionHlp = {
    collateralAddress: collateralToken,
    size: size,
    collateral: collateral,
    averagePrice,
    reserveAmount,
    hasRealisedProfit,
    realisedPnL,
    lastIncreasedTime,
    isLong,
    pair: getHlpPairFromIndex(indexToken),
    fundingRatePpm: fundingRate.regular,
    fundingFee: getFundingFee(size, entryFundingRate, fundingRate.cumulative),
    uid: getPositionKey(
      ethers.constants.AddressZero,
      collateralToken,
      indexToken,
      isLong
    ),
    platformName: HLP_PLATFORM_NAME,
    internals: {
      entryFundingRate,
      cumulativeFundingRate: fundingRate.cumulative,
    },
    // The properties below are determined by the current market price,
    // and are updated by calling getUpdated.
    hasProfit: false,
    delta: ethers.constants.Zero,
    leverage: ethers.constants.Zero,
    liquidationPrice: ethers.constants.Zero,
  };
  return getReversedPositionHlp(actualPosition);
};

/// Reverses the position if needed, according to its hLP pair.
export const getReversedPositionHlp = (position: PositionHlp): PositionHlp => {
  const shouldReverse =
    shouldHlpPairBeReversed(position.pair) && !isPositionHlpReversed(position);
  return shouldReverse ? reversePosition(position) : position;
};

/// Un-reverses the position if needed, according to its hLP pair.
export const getActualPositionHlp = (position: PositionHlp): PositionHlp => {
  const shouldReverse =
    !shouldHlpPairBeReversed(position.pair) && isPositionHlpReversed(position);
  return shouldReverse ? reversePosition(position) : position;
};

export const isPositionHlpReversed = (position: PositionHlp): boolean =>
  position.pair.quoteSymbol !== "USD";

const reversePosition = (position: PositionHlp): PositionHlp => ({
  ...position,
  isLong: !position.isLong,
  pair: getReversedPair(position.pair),
  averagePrice: getReversedPrice(position.averagePrice),
});
