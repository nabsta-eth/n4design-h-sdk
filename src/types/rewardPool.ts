import { BigNumber } from "ethers";

export type RewardPool = {
  id: number;
  ratio: BigNumber;
  accruedAmount: BigNumber;
  deltaS: BigNumber;
  averagePoolBoost: number;
  userBoost: number | undefined;
};

export type RewardPoolMap = Record<string, RewardPool>;

export type RewardPoolDeposit = {
  userDeposited: BigNumber;
  totalDeposited: BigNumber;
};

export type RewardPoolData = {
  pools: RewardPoolMap;
  forexDistributionRate: BigNumber;
  account?: {
    claimableRewards: BigNumber;
    poolRewards: Record<string, BigNumber>;
    rewardPoolDeposits: Record<string, RewardPoolDeposit>;
  };
};

/// RewardPool with on-chain properties and alias (name).
export type RewardPoolRaw = {
  name: string;
  weight: BigNumber;
  assetType: number;
  assetAddress: string;
  /// Total pool deposits. This is a boosted amount.
  totalDeposits: BigNumber;
  /// The number of total real underlying assets deposited into the pool.
  totalRealDeposits: BigNumber;
  S: BigNumber;
};
