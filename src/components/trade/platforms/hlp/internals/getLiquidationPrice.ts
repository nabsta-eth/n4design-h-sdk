import { BigNumber } from "ethers";
import { Position } from "../../legacyInterface";
import {
  getActualPositionHlp,
  isPositionHlpReversed,
} from "./position/parseContractPosition";
import { getTradePair, PositionHlp } from "./tokens";
import { getReversedPrice } from "../../../../../utils/general";
import { getPositionLiquidationPrice, PositionDelta } from "../../../utils";

export const getLiquidationPrice = (
  position: Position,
  positionDelta?: PositionDelta
): BigNumber => {
  const actualPosition = getActualPositionHlp(position as PositionHlp);
  const tradePair = getTradePair({ pair: position.pair });
  let price = getPositionLiquidationPrice(
    actualPosition,
    tradePair,
    positionDelta
  );
  if (isPositionHlpReversed(position as PositionHlp)) {
    price = getReversedPrice(price);
  }
  return price;
};
