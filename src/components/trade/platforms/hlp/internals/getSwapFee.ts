import { BigNumber } from "ethers";
import { Network } from "../../../../../types/network";
import {
  getSwapFeeBasisPoints,
  SwapFeeBasisPointsArgs,
} from "./getSwapFeeBasisPoints";
import { BASIS_POINTS_DIVISOR } from "../../../../../constants";

export const getSwapFee = (
  args: SwapFeeBasisPointsArgs & { amountIn: BigNumber },
  network: Network = "arbitrum"
) => {
  const swapBasisPoints = getSwapFeeBasisPoints(args, network);
  return args.amountIn.mul(swapBasisPoints).div(BASIS_POINTS_DIVISOR);
};
