import { BigNumber, ethers } from "ethers";
import { fetchTokens, HlpToken } from "./tokens";
import { fetchUsdHlpTotalSupply } from "./fetchUsdHlpTotalSupply";

export const getTokenTargetUsdHlpAmount = async (
  tokenAddress: string
): Promise<BigNumber> =>
  getTokenTargetUsdHlpAmountSync(
    tokenAddress,
    await fetchTokens(),
    await fetchUsdHlpTotalSupply()
  );

/// Returns all target USDhLP amounts in an object indexed by token address.
export const getAllTokenTargetUsdHlpAmounts = async (): Promise<
  Record<string, BigNumber>
> => {
  const tokens = await fetchTokens();
  const usdHlpTotalSupply = await fetchUsdHlpTotalSupply();
  return tokens.reduce(
    (object, token) => ({
      ...object,
      [token.address]: getTokenTargetUsdHlpAmountSync(
        token.address,
        tokens,
        usdHlpTotalSupply
      ),
    }),
    {} as Record<string, BigNumber>
  );
};

export const getTokenTargetUsdHlpAmountSync = (
  tokenAddress: string,
  tokens: HlpToken[],
  usdHlpTotalSupply: BigNumber
): BigNumber => {
  const token = tokens.find(
    (x) => x.address.toLowerCase() === tokenAddress.toLowerCase()
  );
  const totalTokenWeights = tokens.reduce(
    (sum, token) => sum + token.tokenWeight,
    0
  );
  if (!token || totalTokenWeights == 0) return ethers.constants.Zero;
  return usdHlpTotalSupply.mul(token.tokenWeight).div(totalTokenWeights);
};
