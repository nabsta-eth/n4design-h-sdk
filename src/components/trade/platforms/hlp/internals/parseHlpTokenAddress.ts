import { HandleTokenManagerInstance } from "../../../../token-manager/HandleTokenManager";
import { isEtherAddress } from "../../../utils";
import { DEFAULT_HLP_NETWORK } from "../config";

/**
 * This function does the following:
 * 1. If the input is the E address (0xEEE...),
 * the wrapped ether token address is returned.
 * 2. Converts the return address to lower case.
 * @param tokenAddress The token address to parse.
 */
export const parseHlpTokenAddress = (tokenAddress: string) => {
  tokenAddress = tokenAddress.toLowerCase();
  const wethAddress =
    HandleTokenManagerInstance.getWrappedNativeToken(
      DEFAULT_HLP_NETWORK
    ).address.toLowerCase();
  return isEtherAddress(tokenAddress) ? wethAddress : tokenAddress;
};
