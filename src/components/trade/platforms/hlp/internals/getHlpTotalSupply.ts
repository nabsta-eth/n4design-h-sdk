import { BigNumber } from "ethers";
import { Network } from "../../../../../index";
import { DEFAULT_HLP_NETWORK, getHlpContracts } from "../config";

export const getHlpTotalSupply = async (
  network: Network = DEFAULT_HLP_NETWORK
): Promise<BigNumber> => getHlpContracts(network).hlp.totalSupply();
