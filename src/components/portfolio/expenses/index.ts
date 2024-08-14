import { PortfolioExpenses } from "../index";

export const fetchPortfolioExpenses = async (
  _address: string
): Promise<PortfolioExpenses> => {
  return {
    // TODO
    bridgeFees: [],
    // TODO
    cdpInterest: [],
    // TODO
    tradeLosses: [],
    // TODO
    tradeFees: [],
  };
};
