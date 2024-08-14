/// A Portfolio object containing an overview of an address' protocol stats.
import { fetchPortfolioAssets } from "./assets";
import { fetchPortfolioLiabilities } from "./liabilities";
import { fetchPortfolioIncome } from "./income";
import { fetchPortfolioExpenses } from "./expenses";
import Vaults from "../Vaults";
import { getData } from "../rewards";

export type Portfolio = {
  assets: PortfolioAssets;
  liabilities: PortfolioLiabilities;
  income: PortfolioIncome;
  expenses: PortfolioExpenses;
};

/// Assets held in the protocol.
export type PortfolioAssets = {
  // Staking (including LP token staking) across protocol.
  staking: PortfolioStaking;
  /// Governance overview.
  governance: PortfolioGovernance;
  /// Collection of protocol collateral.
  collateral: PortfolioCollateral;
  /// Unrealised trade profits.
  tradeProfits: AssetAmount[];
};

export type PortfolioStaking = {
  /// hLP tokens staked in the RewardPool contract.
  hlp: AssetAmount;
  /// fxTokens staked in the fxKeeperPool contract,
  keeper: AssetAmount[];
};

export type PortfolioGovernance = {
  lock: PortfolioGovernanceLock | null;
};

export type PortfolioGovernanceLock = {
  tokenSymbol: string;
  tokenAmount: number;
  untilDate: number;
  veForexBalance: number;
};

export type PortfolioCollateral = {
  cdp: PortfolioCdpCollateral[];
};

export type PortfolioCdpCollateral = {
  fxTokenSymbol: string;
  collateral: AssetAmount;
};

export type AssetAmount = {
  symbol: string;
  amount: number;
};

/// Liabilities across protocol.
export type PortfolioLiabilities = {
  debt: PortfolioDebtLiability;
  /// Unrealised trade losses.
  tradeLosses: AssetAmount[];
};

/// Collection of protocol debt.
export type PortfolioDebtLiability = {
  cdp: AssetAmount[];
};

/// Income across protocol.
/// This is accrued income, i.e. not withdrawn.
/// Once withdrawn, this income turns to an asset (via user's wallet).
export type PortfolioIncome = {
  /// Realised trade profits.
  tradeProfits: AssetAmount[];
  /// fxToken gains from keeper pool liquidation profits.
  keeperGains: AssetAmount[];
  /// Rewards from multiple reward pools.
  rewards: AssetAmount[];
  /// Income from fee rebate program.
  rebates: AssetAmount[];
  /// Income from referrals program.
  referrals: AssetAmount[];
};

/// Expenses across protocol.
export type PortfolioExpenses = {
  /// Realised trade losses.
  tradeLosses: AssetAmount[];
  bridgeFees: AssetAmount[];
  tradeFees: AssetAmount[];
  cdpInterest: AssetAmount[];
};

export const fetchPortfolio = async (account: string): Promise<Portfolio> => {
  const vaultsSdk = new Vaults();
  const [vaults, rewardPoolData, expenses] = await Promise.all([
    vaultsSdk.getVaults(account),
    getData(account),
    fetchPortfolioExpenses(account),
  ]);
  const [assets, liabilities, income] = await Promise.all([
    fetchPortfolioAssets(account, vaults, rewardPoolData),
    fetchPortfolioLiabilities(account, vaults),
    fetchPortfolioIncome(account, rewardPoolData),
  ]);
  return {
    assets,
    liabilities,
    income,
    expenses,
  };
};
