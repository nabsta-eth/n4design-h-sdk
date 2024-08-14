import { BigNumber } from "ethers";
import { TokenInfo } from "@uniswap/token-lists";

/// Platforms used for lp and lp reward staking.
export type LpPlatform = "handle" | "sushi" | "curve" | "balancer" | "sperax";

/// Liquidity pool definition.
export type Lp = {
  title: string;
  url: string;
  contractAddress: string;
  platform: LpPlatform;
  tokensInLp: TokenInfo[];
  lpToken: {
    symbol: string;
    address: string;
  };
};

export type LpData = Lp & {
  lpTokenTotalSupply: BigNumber;
};

export type LpName = "balancerFxUsdForex" | "curveFxUsdFraxUsdc";

/// Details specific to the LP platform/interface.
export type LpDetails<T> = Lp & T;

export type BalancerPoolType =
  | "Weighted"
  | "Stable"
  | "Element"
  | "MetaStable"
  | "Linear"
  | "Gyro2"
  | "Gyro3";

export type LpBalancer = LpDetails<{
  poolId: string;
  type: BalancerPoolType;
}>;

export type AnyLp = Lp | LpBalancer;
