import { BigNumber } from "ethers";
import { ethers, network } from "hardhat";
import { ArbBridgedErc20__factory } from "../src/contracts";
import { isTradeWeekend } from "../src/utils/trade";

export const sortObjectArrayAlphabetically = <T>(
  property: keyof T,
  array: T[]
) =>
  array.sort((a, b) => {
    if (a[property] < b[property]) {
      return -1;
    }
    if (a[property] > b[property]) {
      return 1;
    }
    return 0;
  });

export const mintFxToken = async (
  account: string,
  fxTokenAddress: string,
  amount: BigNumber,
  operatorAddress: string
) => {
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [operatorAddress],
  });
  const operator = await ethers.provider.getSigner(operatorAddress);
  // fxToken is not an "ArbBridgedErc20", but the minting interface is the same.
  await ArbBridgedErc20__factory.connect(fxTokenAddress, operator).mint(
    account,
    amount
  );
};

export const setEthBalance = (
  account: string,
  amount: BigNumber
): Promise<unknown> =>
  network.provider.request({
    method: "hardhat_setBalance",
    params: [account, parseEthersBigNumberForJsonRpc(amount)],
  });

const parseEthersBigNumberForJsonRpc = (value: BigNumber) =>
  `0x${removeZeroPrefix(value.toHexString().toLowerCase().substring(2))}`;

const removeZeroPrefix = (value: string): string =>
  value.startsWith("0") ? removeZeroPrefix(value.substring(1)) : value;

export const describeForNonTestingWeekendOnly = () =>
  !isTradeWeekend() ? describe : (describe.skip as Mocha.SuiteFunction);
