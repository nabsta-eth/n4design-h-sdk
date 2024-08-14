import { AssetAmount } from "../index";
import FxKeeperPool from "../../FxKeeperPool";
import { HandleTokenManagerInstance } from "../../token-manager/HandleTokenManager";
import { Network } from "../../../types/network";
import { bnToNumber } from "../../../utils/general";

const UNKNOWN_TOKEN_SYMBOL = "???";
const NETWORK: Network = "arbitrum";

export const fetchKeeperGains = async (
  account: string
): Promise<AssetAmount[]> => {
  const fxKeeperPoolSdk = new FxKeeperPool();
  const [pools, _] = await Promise.all([
    fxKeeperPoolSdk.getPools(account),
    HandleTokenManagerInstance.initialLoad,
  ]);
  // Fill object with collateral gain amounts.
  // This object is used so that only one value per collateral symbol exists.
  const collateralGainAmounts: Record<string, number | undefined> = {};
  pools
    .filter((pool) => pool.account)
    .forEach((pool) =>
      pool.account!.rewards.collateralTypes.forEach((address, i) => {
        const collateralToken = HandleTokenManagerInstance.tryGetTokenByAddress(
          address,
          NETWORK
        );
        const collateralSymbol =
          collateralToken?.symbol ?? UNKNOWN_TOKEN_SYMBOL;
        if (!collateralGainAmounts[collateralSymbol]) {
          collateralGainAmounts[collateralSymbol] = 0;
        }
        collateralGainAmounts[collateralSymbol]! += bnToNumber(
          pool.account!.rewards.collateralAmounts[i],
          collateralToken?.decimals ?? 18
        );
      })
    );
  return Object.keys(collateralGainAmounts)
    .map(
      (symbol): AssetAmount => ({
        symbol,
        amount: collateralGainAmounts[symbol]!,
      })
    )
    .filter((a) => a.amount > 0);
};
