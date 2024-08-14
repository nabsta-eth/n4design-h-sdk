import { BigNumber } from "ethers";
import { DEFAULT_HLP_NETWORK, getHlpContracts } from "../../config";
import { FIVE_MINUTES_MILLIS } from "../../../../../../constants";
import { CachedObject } from "../../../../../../utils/cachedObject";

const executionFee = new CachedObject<BigNumber>(FIVE_MINUTES_MILLIS);
export const fetchExecutionFee = () => {
  return executionFee.fetch(() =>
    getHlpContracts(DEFAULT_HLP_NETWORK)
      .orderBook.minExecutionFee()
      .then((fee) => fee.add(1))
  );
};
