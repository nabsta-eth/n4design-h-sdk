import { ethers } from "ethers";
import { Network } from ".";

export const FIVE_MINUTES_MILLIS = 5 * 60 * 1_000;

export const SECONDS_IN_A_YEAR_BN = ethers.BigNumber.from("60")
  .mul("60")
  .mul("24")
  .mul("365");

export const NETWORK_NAME_TO_CHAIN_ID: Record<Network, number> = {
  ethereum: 1,
  arbitrum: 42161,
  polygon: 137,
  "arbitrum-sepolia": 421614,
};

export const CHAIN_ID_TO_NETWORK_NAME: Record<number, Network> = {
  1: "ethereum",
  42161: "arbitrum",
  137: "polygon",
  421614: "arbitrum-sepolia",
};

export const NETWORK_NAMES = Object.keys(NETWORK_NAME_TO_CHAIN_ID) as Network[];

// This is hard coded in the curve deployer. 1e10 is equal to 1%.
export const CURVE_FEE_DENOMINATOR = 1e10;

/// A basis point is one hundredth of a percentage point, i.e. 0.01%.
export const BASIS_POINTS_DIVISOR = 10_000;

export const H2SO_PRICE_DECIMALS = 8;
