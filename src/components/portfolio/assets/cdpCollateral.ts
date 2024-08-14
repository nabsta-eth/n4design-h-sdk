import { PortfolioCdpCollateral } from "..";
import { Vault } from "../../../types/vaults";
import { bnToNumber } from "../../../utils/general";

export const getCdpCollateral = (vaults: Vault[]): PortfolioCdpCollateral[] =>
  vaults
    .map((vault): PortfolioCdpCollateral[] =>
      vault.collateral.map((collateral) => ({
        fxTokenSymbol: vault.fxToken.symbol,
        collateral: {
          symbol: collateral.symbol,
          amount: bnToNumber(collateral.amount, collateral.decimals),
        },
      }))
    )
    .flat()
    .filter((c) => c.collateral.amount > 0);
