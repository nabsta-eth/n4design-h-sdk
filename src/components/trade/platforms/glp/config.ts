import { Network } from "../../../../index";
import {
  GlpManager,
  GlpOrderBook,
  GlpOrderBookReader,
  GlpPositionRouter,
  GlpReader,
  GlpRouter,
  GlpVault,
  GlpVaultReader,
} from "../../../../contracts";
import { BigNumber, ethers } from "ethers";
import { BASIS_POINTS_DIVISOR } from "../../../../constants";
import { PRICE_UNIT } from "../legacyInterface";
import { applyDiscount } from "../../utils";

export type GlpContracts = {
  vault: GlpVault;
  router: GlpRouter;
  reader: GlpReader;
  glpManager: GlpManager;
  orderBook: GlpOrderBook;
  orderBookReader: GlpOrderBookReader;
  positionRouter: GlpPositionRouter;
  vaultReader: GlpVaultReader;
};

export const FUNDING_RATE_PRECISION = 1_000_000;
export const GMX_REFERRAL_CODE =
  "0x68616e646c655f66690000000000000000000000000000000000000000000000";
export const REFERRAL_DISCOUNT_BPS = 500;
export const MAX_LEVERAGE_BPS = BigNumber.from(BASIS_POINTS_DIVISOR).mul(100);
export const MIN_PROFIT_TIME = 0;
export const MIN_PROFIT_BPS = 0;
export const STABLE_SWAP_FEE_BPS = 1;
export const SWAP_FEE_BPS = applyDiscount(
  BigNumber.from(30),
  REFERRAL_DISCOUNT_BPS
).toNumber();
export const MARGIN_FEE_BPS = applyDiscount(
  BigNumber.from(10),
  REFERRAL_DISCOUNT_BPS
).toNumber();
export const LIQUIDATION_FEE_USD = PRICE_UNIT.mul(5);
export const MIN_PURCHASE_AMOUNT_USD = PRICE_UNIT.mul(10);
export const GLP_PLATFORM_NAME = "glp" as const;
export const GLP_NETWORK: Network = "arbitrum";
export const GMX_CALLBACK_TARGET = ethers.constants.AddressZero;
export const READER_POSITIONS_PROPS_LENGTH = 9;
export const WS_RPC_URL =
  "wss://arb-mainnet.g.alchemy.com/v2/99Hh6JHEUNRsykEEhz27LVVI-lFlaV1C";
