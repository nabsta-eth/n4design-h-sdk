import { BigNumber } from "ethers";
import { Lp, LpData } from ".";

export type LpStakingName =
  | "sushiWethForex"
  | "curveEursFxEUR"
  | "curveHandle3";

type LpStaking = Omit<Lp, "contractAddress"> & {
  stakingContractAddress: string;
};

/***
 * `tokensInLp` in this type is not fully `TokenInfo` as it is
 * fetched from the LP contract rather than a token list.
 */
export type LpStakingData = Omit<
  LpStaking & LpData,
  "tokensInLp" | "contractAddress"
> & {
  name: LpStakingName;
  totalDeposited: BigNumber;
  distributionRate: BigNumber;
  distributionPeriodEnds: BigNumber;
  distributionDuration: BigNumber;
  rewardsBalance: BigNumber;
  tokensInLp: {
    symbol: string;
    address: string;
    decimals: number;
    balance: BigNumber;
  }[];
  account?: {
    deposited: BigNumber;
    claimableRewards: BigNumber;
  };
  /**
   * @deprecated Use `stakingContractAddress` instead
   */
  address: string;
};

export type LpStakingCurve = LpStaking & {
  factoryAddress: string;
  platform: "curve";
};

export type LpStakingSushi = LpStaking & {
  platform: "sushi";
};

export type LpStakingHandle = LpStaking & {
  platform: "handle";
};

export type AnyLpStaking = LpStakingCurve | LpStakingSushi | LpStakingHandle;
