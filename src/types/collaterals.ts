import { TokenInfo } from "@uniswap/token-lists";
import { ethers } from "ethers";

export type CollateralSymbol = "FOREX" | "WETH" | "wstETH";
export type CollateralSymbolWithNative = CollateralSymbol | "ETH";
export type CollateralSymbolMap<T> = { [key in CollateralSymbol]: T };

export type Collateral = CollateralToken & {
  mintCR: ethers.BigNumber;
  liquidationFee: ethers.BigNumber;
  interestRate: ethers.BigNumber;
  price: ethers.BigNumber;
};

export type CollateralToken = TokenInfo & {
  symbol: CollateralSymbol;
};
