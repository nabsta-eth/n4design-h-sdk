import { getAum } from "./getAum";
import { DEFAULT_HLP_NETWORK, getHlpContracts } from "../config";
import { BigNumber, ethers } from "ethers";
import { NumericSpread } from "../../legacyInterface";

/// Returns the hLP price with 30 decimals.
export const getHlpPrice = async (): Promise<NumericSpread> => {
  const { maximum, minimum } = await getAum(DEFAULT_HLP_NETWORK);
  const { hlp } = getHlpContracts(DEFAULT_HLP_NETWORK);
  const totalHlpSupply = await hlp.totalSupply();
  return {
    maximum: calculateHlpPrice(maximum, totalHlpSupply),
    minimum: calculateHlpPrice(minimum, totalHlpSupply),
  };
};

const calculateHlpPrice = (aum: BigNumber, totalHlpSupply: BigNumber) =>
  aum.mul(ethers.constants.WeiPerEther).div(totalHlpSupply);
