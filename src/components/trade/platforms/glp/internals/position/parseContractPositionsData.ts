import { BigNumber, constants, ethers } from "ethers";
import { GlpToken } from "../tokens";
import { FUNDING_RATE_PRECISION } from "../../../hlp/config";
import { BASIS_POINTS_DIVISOR } from "../../../../../../constants";
import { MARGIN_FEE_BPS } from "../../config";
import { PositionGlp } from "./index";
import { getActionPrice } from "../../../../../../utils/trade";
import { pairFromString } from "../../../../../../utils/general";
import { getFundingFee } from "../../../hlp/internals";
import { Pair } from "../../../../../../types/trade";
import { MarketPrice } from "../../../legacyInterface";
import { ETH_ADDRESS } from "../../../../utils";

export type PositionQuery = {
  collateralTokens: GlpToken[];
  indexTokens: GlpToken[];
  isLong: boolean[];
};

export const parseContractPositionsData = (
  positionQuery: PositionQuery,
  positionData: BigNumber[],
  includeDelta: boolean,
  account: string,
  propsLength: number,
  platformName: string,
  getMarketPrice: (pair: Pair) => MarketPrice,
  includeZeroPositions = true
): PositionGlp[] => {
  const positions: PositionGlp[] = [];
  if (!positionData) {
    return positions;
  }
  const { collateralTokens, indexTokens, isLong } = positionQuery;
  for (let i = 0; i < collateralTokens.length; i++) {
    const collateralToken = collateralTokens[i];
    const indexToken = indexTokens[i];
    const contractKey = getPositionContractKey(
      account,
      collateralToken.address,
      indexToken.address,
      isLong[i]
    );
    const pair = pairFromString(`${indexToken.symbol}/USD`);
    const size = positionData[i * propsLength];
    const collateral = positionData[i * propsLength + 1];
    const isZeroPosition = size.isZero() || collateral.isZero();
    if (!includeZeroPositions && isZeroPosition) {
      continue;
    }
    const markPrice = getNullableMarkPrice(
      isLong[i],
      true,
      pair,
      getMarketPrice
    );
    if (!markPrice) {
      continue;
    }
    const position: PositionGlp = {
      pair,
      collateralAddress: collateralToken.address,
      isLong: isLong[i],
      size,
      collateral,
      averagePrice: positionData[i * propsLength + 2],
      fundingRatePpm: collateralToken.fundingRate!,
      fundingFee: getFundingFee(
        size,
        positionData[i * propsLength + 3],
        collateralToken.cumulativeFundingRate!
      ),
      // TODO: set/remove from interface.
      reserveAmount: ethers.constants.Zero,
      leverage: !isZeroPosition
        ? size.mul(BASIS_POINTS_DIVISOR).div(collateral)
        : ethers.constants.Zero,
      hasRealisedProfit: positionData[i * propsLength + 4].eq(1),
      realisedPnL: positionData[i * propsLength + 5],
      lastIncreasedTime: positionData[i * propsLength + 6],
      hasProfit:
        propsLength > 7 ? positionData[i * propsLength + 7].eq(1) : false,
      delta:
        propsLength > 8
          ? positionData[i * propsLength + 8]
          : ethers.constants.Zero,
      // This is set on getUpdatedPosition.
      liquidationPrice: ethers.constants.Zero,
      uid: getPositionKey(
        account,
        collateralToken.address,
        indexToken.address,
        isLong[i]
      ),
      platformName,
      internals: {
        contractKey,
        entryFundingRate: positionData[i * propsLength + 3],
        cumulativeFundingRate: collateralToken.cumulativeFundingRate!,
      },
    };
    if (position.averagePrice.gt(0)) {
      const priceDelta = position.averagePrice.gt(markPrice)
        ? position.averagePrice.sub(markPrice)
        : markPrice.sub(position.averagePrice);
      position.delta = !position.averagePrice.isZero()
        ? position.size.mul(priceDelta).div(position.averagePrice)
        : ethers.constants.Zero;
      if (position.isLong) {
        position.hasProfit = markPrice.gte(position.averagePrice);
      } else {
        position.hasProfit = markPrice.lte(position.averagePrice);
      }
    }
    if (!isZeroPosition) {
      position.leverage = getLeverage({
        size: position.size,
        collateral: position.collateral,
        entryFundingRate: positionData[i * propsLength + 3],
        cumulativeFundingRate: collateralToken.cumulativeFundingRate!,
        hasProfit: position.hasProfit,
        delta: position.delta,
        shouldIncludeDelta: includeDelta,
        isIncreasingSize: true,
        sizeDelta: ethers.constants.Zero,
        isIncreasingCollateral: true,
        collateralDelta: ethers.constants.Zero,
      });
    }
    positions.push(position);
  }
  return positions;
};

export const getPositionKey = (
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

const getPositionContractKey = (
  account: string,
  collateralToken: string,
  indexToken: string,
  isLong: boolean
) =>
  ethers.utils.solidityKeccak256(
    ["address", "address", "address", "bool"],
    [account, collateralToken, indexToken, isLong]
  );

const getNullableMarkPrice = (
  isLong: boolean,
  isIncreasing: boolean,
  pair: Pair,
  getMarketPrice: (pair: Pair) => MarketPrice
): BigNumber | null => {
  try {
    return getActionPrice(isLong, isIncreasing, getMarketPrice(pair));
  } catch (error) {
    console.error("getNullableMarkPrice: returning null", error);
    return null;
  }
};

type GetLeverageArgs = {
  size: BigNumber;
  sizeDelta: BigNumber;
  isIncreasingSize: boolean;
  collateral: BigNumber;
  collateralDelta: BigNumber;
  isIncreasingCollateral: boolean;
  entryFundingRate: BigNumber;
  cumulativeFundingRate: BigNumber;
  hasProfit: boolean;
  delta: BigNumber;
  shouldIncludeDelta: boolean;
};

export const getLeverage = ({
  size,
  sizeDelta,
  isIncreasingSize,
  collateral,
  collateralDelta,
  isIncreasingCollateral,
  entryFundingRate,
  cumulativeFundingRate,
  hasProfit,
  delta,
  shouldIncludeDelta,
}: GetLeverageArgs): BigNumber => {
  let nextSize = size ? size : ethers.constants.Zero;
  if (sizeDelta) {
    if (isIncreasingSize) {
      nextSize = size.add(sizeDelta);
    } else {
      if (sizeDelta.gte(size)) {
        throw new Error("getLeverage: size delta underflow");
      }
      nextSize = size.sub(sizeDelta);
    }
  }
  let remainingCollateral = collateral ? collateral : ethers.constants.Zero;
  if (collateralDelta) {
    if (isIncreasingCollateral) {
      remainingCollateral = collateral.add(collateralDelta);
    } else {
      if (collateralDelta.gte(collateral)) {
        throw new Error("getLeverage: collateral delta underflow");
      }
      remainingCollateral = collateral.sub(collateralDelta);
    }
  }
  if (delta && shouldIncludeDelta) {
    if (hasProfit) {
      remainingCollateral = remainingCollateral.add(delta);
    } else {
      if (delta.gt(remainingCollateral)) {
        throw new Error("getLeverage: delta underflow");
      }
      remainingCollateral = remainingCollateral.sub(delta);
    }
  }
  if (remainingCollateral.eq(0)) {
    throw new Error("getLeverage: no remaining collateral");
  }
  remainingCollateral = sizeDelta
    ? remainingCollateral
        .mul(BASIS_POINTS_DIVISOR - MARGIN_FEE_BPS)
        .div(BASIS_POINTS_DIVISOR)
    : remainingCollateral;
  if (entryFundingRate && cumulativeFundingRate) {
    const fundingFee = size
      .mul(cumulativeFundingRate.sub(entryFundingRate))
      .div(FUNDING_RATE_PRECISION);
    remainingCollateral = remainingCollateral.sub(fundingFee);
  }
  return nextSize.mul(BASIS_POINTS_DIVISOR).div(remainingCollateral);
};
