import { TokenInfo } from "@uniswap/token-lists";
import { ethers } from "ethers";

export type FxToken = TokenInfo & {
  price: ethers.BigNumber;
  symbol: FxTokenSymbol;
};

export type FxTokenSymbol = string;
