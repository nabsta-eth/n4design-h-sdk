import { Position, TradePair } from "../platforms/legacyInterface";
import { BigNumber, ethers } from "ethers";
import { BASIS_POINTS_DIVISOR } from "../../../constants";

export const ETH_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export const applyDiscount = (
  grossAmount: BigNumber,
  discountBps: number
): BigNumber => calculateFee(grossAmount, BASIS_POINTS_DIVISOR - discountBps);

export const calculateFee = (
  grossAmount: BigNumber,
  basisPoints: number
): BigNumber => grossAmount.mul(basisPoints).div(BASIS_POINTS_DIVISOR);

export const getMarginFee = (sizeDelta: BigNumber, marginFeeBps: BigNumber) => {
  const afterFeeUsd = applyDiscount(sizeDelta, marginFeeBps.toNumber());
  return sizeDelta.sub(afterFeeUsd);
};

export type PositionDelta = {
  collateralDelta: BigNumber;
  sizeDelta: BigNumber;
  isIncrease: boolean;
};

const DEFAULT_DELTA = {
  collateralDelta: ethers.constants.Zero,
  sizeDelta: ethers.constants.Zero,
  isIncrease: true,
};

export const getPositionLiquidationPrice = (
  { isLong, size, collateral, averagePrice, fundingFee }: Position,
  { maxLeverageBps, marginFeeBps, liquidationFeeUsd }: TradePair,
  { collateralDelta, sizeDelta, isIncrease }: PositionDelta = DEFAULT_DELTA
): BigNumber => {
  let nextSize = size || ethers.constants.Zero;
  let remainingCollateral = collateral;

  if (sizeDelta) {
    if (isIncrease) {
      nextSize = size.add(sizeDelta);
    } else {
      if (sizeDelta.gte(size)) {
        return ethers.constants.Zero;
      }
      nextSize = size.sub(sizeDelta);
    }

    const marginFee = getMarginFee(sizeDelta, marginFeeBps);
    remainingCollateral = remainingCollateral.sub(marginFee);
  }

  if (collateralDelta) {
    if (isIncrease) {
      remainingCollateral = remainingCollateral.add(collateralDelta);
    } else {
      if (collateralDelta.gte(remainingCollateral)) {
        return ethers.constants.Zero;
      }
      remainingCollateral = remainingCollateral.sub(collateralDelta);
    }
  }

  const positionFee = getMarginFee(size, marginFeeBps)
    .add(liquidationFeeUsd)
    .add(fundingFee);
  const liquidationPriceForFees = getLiquidationPriceFromDelta(
    positionFee,
    nextSize,
    remainingCollateral,
    averagePrice,
    isLong
  );
  const liquidationPriceForMaxLeverage = getLiquidationPriceFromDelta(
    nextSize.mul(BASIS_POINTS_DIVISOR).div(maxLeverageBps),
    nextSize,
    remainingCollateral,
    averagePrice,
    isLong
  );
  if (isLong) {
    // return the higher price
    return liquidationPriceForFees.gt(liquidationPriceForMaxLeverage)
      ? liquidationPriceForFees
      : liquidationPriceForMaxLeverage;
  }
  // return the lower price
  return liquidationPriceForFees.lt(liquidationPriceForMaxLeverage)
    ? liquidationPriceForFees
    : liquidationPriceForMaxLeverage;
};

const getLiquidationPriceFromDelta = (
  liquidationAmount: BigNumber,
  size: BigNumber,
  collateral: BigNumber,
  averagePrice: BigNumber,
  isLong: boolean
) => {
  if (size.isZero()) return ethers.constants.Zero;
  if (liquidationAmount.gt(collateral)) {
    const liquidationDelta = liquidationAmount.sub(collateral);
    const priceDelta = liquidationDelta.mul(averagePrice).div(size);
    return !isLong
      ? averagePrice.sub(priceDelta)
      : averagePrice.add(priceDelta);
  }
  const liquidationDelta = collateral.sub(liquidationAmount);
  const priceDelta = liquidationDelta.mul(averagePrice).div(size);
  return isLong ? averagePrice.sub(priceDelta) : averagePrice.add(priceDelta);
};

export const createOrderId = (
  platform: string,
  account: string,
  index: number
) => {
  return `${platform}-${account.toLowerCase()}-${index}`;
};

export const parseOrderId = (id: string, targetPlatform?: string) => {
  const [platform, account, index] = id.split("-");
  if (targetPlatform && platform !== targetPlatform) {
    throw new Error(
      `Invalid platform. Expected ${targetPlatform}, got ${platform}`
    );
  }
  return {
    platform,
    account,
    index: parseInt(index),
  };
};

export const isEtherAddress = (address: string) => {
  return [ethers.constants.AddressZero, ETH_ADDRESS].includes(
    address.toLowerCase()
  );
};
