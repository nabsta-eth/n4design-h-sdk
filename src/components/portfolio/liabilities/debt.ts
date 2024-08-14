import { Vault } from "../../../types/vaults";
import { AssetAmount } from "../index";
import { bnToNumber } from "../../../utils/general";

export const getCdpDebtLiability = (vaults: Vault[]): AssetAmount[] =>
  vaults
    .map(
      (vault: Vault): AssetAmount => ({
        symbol: vault.fxToken.symbol,
        amount: bnToNumber(vault.debt, vault.fxToken.decimals),
      })
    )
    .filter((a) => a.amount > 0);
