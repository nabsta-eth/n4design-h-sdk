import { BigNumber } from "ethers";
import { getFeeBasisPoints } from "./getFeeBasisPoints";
import { HlpConfig } from "../config";

export const getHlpFeeBasisPoints = (args: {
  token: string;
  usdHlpDelta: BigNumber;
  isBuy: boolean;
  usdHlpSupply: BigNumber;
  totalTokenWeights: BigNumber;
  targetUsdHlpAmount: BigNumber;
  config: Pick<HlpConfig, "mintBurnFeeBasisPoints" | "taxBasisPoints">;
}) =>
  getFeeBasisPoints({
    ...args,
    feeBasisPoints: BigNumber.from(args.config.mintBurnFeeBasisPoints),
    taxBasisPoints: BigNumber.from(args.config.taxBasisPoints),
    increment: args.isBuy,
  });
