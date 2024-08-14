import { Network } from "../../../types/network";
import { getBalancerVaultContract } from "../../../utils/contract";
import { fetchCoinGeckoTokenPrice } from "./coingecko";
import { HandleTokenManagerInstance } from "../../token-manager/HandleTokenManager";
import { ERC20__factory } from "../../../contracts";
import { config } from "../../../index";
import { ethers } from "ethers";
import { formatEther, parseUnits } from "ethers/lib/utils";
import { transformDecimals } from "../../../utils/general";

const NETWORK: Network = "arbitrum";

export const fetchBalancerLpTokenPrice = async (
  poolId: string
): Promise<number> => {
  if (!poolId.startsWith("0x")) {
    poolId = `0x${poolId}`;
  }
  const { tokens, balances } = await getBalancerVaultContract().getPoolTokens(
    poolId
  );
  const tokensInfo = tokens.map((address) =>
    HandleTokenManagerInstance.getTokenByAddress(address, NETWORK)
  );
  // The balancer LP token address is the first 42 characters of the pool ID.
  const lpTokenAddress = poolId.substring(0, 42);
  const [lpSupply, ...prices] = await Promise.all([
    ERC20__factory.connect(
      lpTokenAddress,
      config.providers.arbitrum
    ).totalSupply(),
    ...tokensInfo.map((info) =>
      fetchCoinGeckoTokenPrice(NETWORK, info, "usd").then((pricePoint) =>
        transformDecimals(parseUnits(pricePoint.price.toFixed(8), 8), 8, 18)
      )
    ),
  ]);
  const poolValue = balances.reduce(
    (value, balance, i) =>
      value.add(balance.mul(prices[i]).div(ethers.constants.WeiPerEther)),
    ethers.constants.Zero
  );
  const lpPrice = poolValue.mul(ethers.constants.WeiPerEther).div(lpSupply);
  return +formatEther(lpPrice);
};
