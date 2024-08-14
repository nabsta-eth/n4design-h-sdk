import { ethers } from "ethers";
import {
  ConvertQuoteRouteArgs,
  ConvertTransactionRouteArgs,
  RawQuote,
} from "../";
import hlpBuyRemove from "./hlpAddRemove";
import hlpSwap from "./hlpSwap";
import psm from "./psm";
import { WeightInput } from "./weights";
import weth from "./weth";
import psmToHlp from "./psmToHlp";
import psmToHlpToCurve from "./psmToHlpToCurve";
import hlpToCurve from "./hlpToCurve";
import handleCurvePool from "./handleCurvePool";
import hlpToBalancer from "./hlpBalancer";
import paraswap from "./paraswap";
import psmToHlpToBalancer from "./psmToHlpToBalancer";
import balancerToCurve from "./balancerToCurve";

export type Route = {
  weight: (input: WeightInput) => Promise<number>;
  quote: (input: ConvertQuoteRouteArgs) => Promise<RawQuote>;
  transaction: (
    input: ConvertTransactionRouteArgs
  ) => Promise<ethers.PopulatedTransaction>;
};

const routes: Route[] = [
  psm,
  hlpBuyRemove,
  hlpSwap,
  hlpToCurve,
  weth,
  psmToHlp,
  psmToHlpToCurve,
  handleCurvePool,
  hlpToBalancer,
  paraswap,
  psmToHlpToBalancer,
  balancerToCurve,
];

export default routes;
