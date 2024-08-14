import { PortfolioLiabilities } from "../index";
import { Vault } from "../../../types/vaults";
import { getCdpDebtLiability } from "./debt";

export const fetchPortfolioLiabilities = async (
  _account: string,
  vaults: Vault[]
): Promise<PortfolioLiabilities> => {
  return {
    debt: {
      cdp: getCdpDebtLiability(vaults),
    },
    // TODO
    tradeLosses: [],
  };
};
