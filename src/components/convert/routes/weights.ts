import { ethers } from "ethers";
import { Network, TokenInfo } from "../../..";

export const PSM_WEIGHT = 100;
export const PARASWAP_WEIGHT = 5;
export const HLP_ADD_REMOVE_WEIGHT = 100;
export const HLP_SWAP_WEIGHT = 110;
export const WETH_WEIGHT = 200;
export const PSM_TO_HLP = 100;
export const PSM_TO_HLP_TO_CURVE = 100;
export const HLP_TO_CURVE = 100;
export const CURVE_SELL_HLP = 110;
export const CURVE_BUY_HLP = 90;
export const HLP_TO_BALANCER = 80;
export const BALANCER_TO_HLP = 80;
export const HPSM_TO_HLP_TO_BALANCER = 100;
export const BALANCER_TO_CURVE = 100;

export type WeightInput = {
  fromToken: TokenInfo;
  toToken: TokenInfo;
  provider: ethers.providers.Provider;
  network: Network;
};
