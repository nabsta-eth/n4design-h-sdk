import { BigNumber, ContractTransaction, Overrides, Signer } from "ethers";
import config from "../config";
import { Promisified } from "../types/general";
import { GovernanceLockData } from "../types/governanceLock";
import {
  fetchPromisifiedObject,
  getGovernanceLockContract,
} from "../utils/contract";
import { fetchCacheApi } from "../utils/sdk";

type GovernanceLockDataRaw = {
  totalForexLocked: BigNumber;
  acountLocked?: {
    amount: BigNumber;
    end: BigNumber;
  };
  accountBalance?: BigNumber;
};

type CreateLockArgs = {
  durationInSeconds: number;
  forexAmount: BigNumber;
};

type IncreaseLockDurationByArgs = {
  increaseDurationByInSeconds: number;
  currentUnlocksAt: BigNumber;
};

const MAX_LOCK_SECONDS = 365 * 24 * 60 * 60;

export const getData = async (
  account: string | undefined,
  isRetired = false
): Promise<GovernanceLockData> => {
  if (!account && config.sdk.shouldUseCacheServer) {
    return fetchCacheApi("earn-pools/governance");
  }
  const response = await fetchPromisifiedObject(
    getGovernanceLockDataMulticall(account, isRetired)
  );
  return {
    totalForexLocked: response.totalForexLocked,
    account:
      response.acountLocked?.amount &&
      response.acountLocked?.end &&
      response.accountBalance
        ? {
            forexLocked: response.acountLocked?.amount,
            unlocksAt: response.acountLocked?.end,
            veForexBalance: response.accountBalance,
          }
        : undefined,
  };
};

export const createLock = (
  args: CreateLockArgs,
  signer: Signer,
  options: Overrides = {}
): Promise<ContractTransaction> => {
  if (args.durationInSeconds > MAX_LOCK_SECONDS) {
    throw new Error(
      `Duration cannot be greater than ${MAX_LOCK_SECONDS} seconds`
    );
  }
  const unlockDate = Math.floor(Date.now() / 1000 + args.durationInSeconds);
  return getGovernanceLockContract(signer).createLock(
    args.forexAmount,
    unlockDate,
    options
  );
};

export const increaseLockedAmount = (
  forexAmount: BigNumber,
  signer: Signer,
  options: Overrides = {}
): Promise<ContractTransaction> =>
  getGovernanceLockContract(signer).increaseAmount(forexAmount, options);

export const increaseLockDurationBy = (
  args: IncreaseLockDurationByArgs,
  signer: Signer,
  options: Overrides = {}
): Promise<ContractTransaction> => {
  const newUnlocksAt = Math.floor(
    args.currentUnlocksAt.toNumber() + args.increaseDurationByInSeconds
  );
  const now = Date.now() / 1000;
  if (newUnlocksAt - now > MAX_LOCK_SECONDS) {
    throw new Error(
      `Duration cannot be greater than ${MAX_LOCK_SECONDS} seconds`
    );
  }
  return getGovernanceLockContract(signer).increaseUnlockTime(
    newUnlocksAt,
    options
  );
};

export const withdraw = (
  signer: Signer,
  options: Overrides = {},
  isRetired = false
): Promise<ContractTransaction> =>
  getGovernanceLockContract(signer, isRetired).withdraw(options);

const getGovernanceLockDataMulticall = (
  account: string | undefined,
  isRetired = false
): Promisified<GovernanceLockDataRaw> => {
  const contract = getGovernanceLockContract(undefined, isRetired);
  const base = {
    totalForexLocked: contract.supply(),
  };
  if (account) {
    return {
      ...base,
      acountLocked: contract.locked(account),
      accountBalance: contract.balanceOf(account),
    };
  }
  return base;
};
