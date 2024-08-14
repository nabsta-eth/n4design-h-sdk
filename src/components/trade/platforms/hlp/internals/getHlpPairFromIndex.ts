import { Pair } from "../../../../../types/trade";
import { HandleTokenManagerInstance } from "../../../../token-manager/HandleTokenManager";
import { pairFromString } from "../../../../../utils/general";
import { DEFAULT_HLP_NETWORK } from "../config";

/// From an index token address, fetches the hLP trading pair, quoted on USD.
export const getHlpPairFromIndex = (indexTokenAddress: string): Pair => {
  const token = HandleTokenManagerInstance.getTokenByAddress(
    indexTokenAddress,
    DEFAULT_HLP_NETWORK
  );
  return pairFromString(`${token.symbol}/USD`);
};
