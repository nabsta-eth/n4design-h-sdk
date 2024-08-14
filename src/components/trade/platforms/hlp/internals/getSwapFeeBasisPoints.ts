import { BigNumber } from "ethers";
import { getFeeBasisPoints } from "./getFeeBasisPoints";
import { Network } from "../../../../../types/network";
import { HandleTokenManagerInstance } from "../../../../token-manager/HandleTokenManager";
import { HlpConfig } from "../config";

export type RequiredConfig =
  | "stableSwapFeeBasisPoints"
  | "swapFeeBasisPoints"
  | "stableTaxBasisPoints"
  | "taxBasisPoints";

export type SwapFeeBasisPointsArgs = {
  tokenIn: string;
  tokenOut: string;
  usdHlpDelta: BigNumber;
  usdHlpSupplyTokenIn: BigNumber;
  usdHlpSupplyTokenOut: BigNumber;
  totalTokenWeights: BigNumber;
  targetUsdHlpAmountTokenIn: BigNumber;
  targetUsdHlpAmountTokenOut: BigNumber;
  config: Pick<HlpConfig, RequiredConfig>;
};

export const getSwapFeeBasisPoints = (
  args: SwapFeeBasisPointsArgs,
  network: Network = "arbitrum"
) => {
  const isStableSwap =
    HandleTokenManagerInstance.isHlpStableTokenByAddress(
      args.tokenIn,
      network
    ) &&
    HandleTokenManagerInstance.isHlpStableTokenByAddress(
      args.tokenOut,
      network
    );
  const swapBasisPoints = isStableSwap
    ? args.config.stableSwapFeeBasisPoints
    : args.config.swapFeeBasisPoints;
  const taxBasisPoints = isStableSwap
    ? args.config.stableTaxBasisPoints
    : args.config.taxBasisPoints;

  const feeBasisPoints1 = getFeeBasisPoints({
    usdHlpDelta: args.usdHlpDelta,
    targetUsdHlpAmount: args.targetUsdHlpAmountTokenIn,
    usdHlpSupply: args.usdHlpSupplyTokenIn,
    increment: true,
    feeBasisPoints: BigNumber.from(swapBasisPoints),
    taxBasisPoints: BigNumber.from(taxBasisPoints),
  });
  const feeBasisPoints2 = getFeeBasisPoints({
    usdHlpDelta: args.usdHlpDelta,
    targetUsdHlpAmount: args.targetUsdHlpAmountTokenOut,
    usdHlpSupply: args.usdHlpSupplyTokenOut,
    increment: false,
    feeBasisPoints: BigNumber.from(swapBasisPoints),
    taxBasisPoints: BigNumber.from(taxBasisPoints),
  });
  // return largest fee basis points
  return feeBasisPoints1.gt(feeBasisPoints2)
    ? feeBasisPoints1
    : feeBasisPoints2;
};
