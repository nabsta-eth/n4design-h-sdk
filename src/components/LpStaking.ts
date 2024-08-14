import sdkConfig from "../config";
import {
  LpStakingData,
  AnyLpStaking,
  LpStakingName,
} from "../types/lp/staking";
import { BigNumber, ContractTransaction, Overrides, Signer } from "ethers";
import {
  callMulticallObjects,
  createERC20MulticallContract,
  createMultiCallContract,
} from "../utils/contract";
import { Promisified } from "../types/general";
import { Staking as StakingContract, Staking__factory } from "../contracts";
import stakingContractAbi from "../abis/handle/Staking.json";
import { Provider as MultiCallProvider } from "ethers-multicall";
import { NETWORK_NAME_TO_CHAIN_ID } from "../constants";
import { fetchCacheApi } from "../utils/sdk";

export type LpStakingConfig = {
  pools: Record<LpStakingName, AnyLpStaking>;
  forexAddress: string;
  chainId: number;
};

export type LpStakingPoolMulticall = {
  totalDeposited: BigNumber;
  lpTokenTotalSupply: BigNumber;
  distributionRate: BigNumber;
  distributionPeriodEnds: BigNumber;
  distributionDuration: BigNumber;
  rewardsBalance: BigNumber;
  deposited?: BigNumber;
  claimableRewards?: BigNumber;
};

export type StakeAndWithdrawArgs = {
  poolName: LpStakingName;
  amount: BigNumber;
};

export default class LpStaking {
  public config: LpStakingConfig;

  constructor(c?: LpStakingConfig) {
    this.config = c || {
      pools: sdkConfig.lpStaking.arbitrum,
      forexAddress: sdkConfig.forexAddress,
      chainId: NETWORK_NAME_TO_CHAIN_ID.arbitrum,
    };
  }

  public getPools = async (
    account: string | undefined,
    signer: Signer
  ): Promise<LpStakingData[]> => {
    if (!account && sdkConfig.sdk.shouldUseCacheServer) {
      return fetchCacheApi("earn-pools/lpstaking");
    }
    const poolNames = Object.keys(this.config.pools) as LpStakingName[];

    const multicalls = poolNames.map((poolName) => {
      return this.getMulticall(account, this.config.pools[poolName]);
    });

    const provider = new MultiCallProvider(
      signer.provider!,
      this.config.chainId
    );
    const multicallResponses = await callMulticallObjects(multicalls, provider);
    const tokenBalances = await this.getTokenDepositedIntoLP(signer);

    return multicallResponses.map((poolData, index) => {
      const poolName = poolNames[index];
      const balances = tokenBalances[index];
      const pool = this.config.pools[poolName];

      return {
        name: poolName,
        title: pool.title,
        address: pool.stakingContractAddress,
        stakingContractAddress: pool.stakingContractAddress,
        platform: pool.platform,
        totalDeposited: poolData.totalDeposited,
        distributionRate: poolData.distributionRate,
        lpTokenTotalSupply: poolData.lpTokenTotalSupply,
        distributionDuration: poolData.distributionDuration,
        distributionPeriodEnds: poolData.distributionPeriodEnds,
        rewardsBalance: poolData.rewardsBalance,
        lpToken: pool.lpToken,
        tokensInLp: pool.tokensInLp.map((token) => ({
          symbol: token.symbol,
          address: token.address,
          decimals: token.decimals,
          balance: balances[token.symbol],
        })),
        url: pool.url,
        account:
          poolData.claimableRewards && poolData.deposited
            ? {
                claimableRewards: poolData.claimableRewards,
                deposited: poolData.deposited,
              }
            : undefined,
      };
    });
  };

  public stake = (
    args: StakeAndWithdrawArgs,
    signer: Signer,
    options: Overrides = {}
  ): Promise<ContractTransaction> => {
    const contract = this.getContract(args.poolName, signer);
    return contract.stake(args.amount, options);
  };

  public unstake = (
    args: StakeAndWithdrawArgs,
    signer: Signer,
    options: Overrides = {}
  ): Promise<ContractTransaction> => {
    const contract = this.getContract(args.poolName, signer);
    return contract.withdraw(args.amount, options);
  };

  public claim = (
    poolName: LpStakingName,
    signer: Signer,
    options: Overrides = {}
  ): Promise<ContractTransaction> => {
    const contract = this.getContract(poolName, signer);

    return contract.getReward(options);
  };

  private getMulticall = (
    account: string | undefined,
    poolDetails: AnyLpStaking
  ): Promisified<LpStakingPoolMulticall> => {
    const stakingContract = createMultiCallContract<StakingContract>(
      poolDetails.stakingContractAddress,
      stakingContractAbi
    );

    const lpToken = createERC20MulticallContract(poolDetails.lpToken.address);

    const rewardToken = createERC20MulticallContract(this.config.forexAddress);

    const base = {
      totalDeposited: lpToken.balanceOf(poolDetails.stakingContractAddress),
      lpTokenTotalSupply: lpToken.totalSupply(),
      distributionRate: stakingContract.rewardRate(),
      distributionPeriodEnds: stakingContract.periodFinish(),
      distributionDuration: stakingContract.rewardsDuration(),
      rewardsBalance: rewardToken.balanceOf(poolDetails.stakingContractAddress),
    };

    if (account) {
      return {
        ...base,
        deposited: stakingContract.balanceOf(account),
        claimableRewards: stakingContract.earned(account),
      };
    }

    return base;
  };

  private getTokenDepositedIntoLP = async (
    signer: Signer
  ): Promise<{ [key: string]: BigNumber }[]> => {
    const poolNames = Object.keys(this.config.pools) as LpStakingName[];

    const multicalls = poolNames.map((poolName) => {
      const pool = this.config.pools[poolName];

      return pool.tokensInLp.reduce((progress, token) => {
        return {
          ...progress,
          [token.symbol]: createERC20MulticallContract(token.address).balanceOf(
            pool.lpToken.address
          ),
        };
      }, {});
    });

    const provider = new MultiCallProvider(
      signer.provider!,
      this.config.chainId
    );

    return callMulticallObjects(multicalls, provider);
  };

  private getContract = (poolName: LpStakingName, signer: Signer) => {
    return Staking__factory.connect(
      this.config.pools[poolName].stakingContractAddress,
      signer
    );
  };
}
