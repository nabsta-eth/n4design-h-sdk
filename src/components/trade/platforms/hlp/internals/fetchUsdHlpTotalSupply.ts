import { BigNumber } from "ethers";
import { CachedObject } from "../../../../../utils/cachedObject";
import { FIVE_MINUTES_MILLIS } from "../../../../../constants";
import { DEFAULT_HLP_NETWORK, getHlpContracts } from "../config";

const cachedUsdHlpTotalSupply = new CachedObject<BigNumber>(
  FIVE_MINUTES_MILLIS
);

export const fetchUsdHlpTotalSupply = async (): Promise<BigNumber> =>
  cachedUsdHlpTotalSupply.fetch(fetchUsdHlpTotalSupplyUncached);

const fetchUsdHlpTotalSupplyUncached = async (): Promise<BigNumber> => {
  const { hlpManager, usdHlp } = getHlpContracts(DEFAULT_HLP_NETWORK);
  return usdHlp.balanceOf(hlpManager.address);
};
