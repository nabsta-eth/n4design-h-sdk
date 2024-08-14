import { BigNumber, ethers, Signer } from "ethers";
import { Network } from "../../types/network";
import routes from "./routes";
import { WeightInput } from "./routes/weights";
import { TokenInfo } from "@uniswap/token-lists";
import { CHAIN_ID_TO_NETWORK_NAME } from "../../constants";
import { getNetworkFromSignerOrProvider } from "../../utils/general";
import { getUsdValue } from "../../utils/price";
import { HandleTokenManagerInstance } from "../token-manager/HandleTokenManager";
import { getMinOut } from "../../utils/convert";
import config from "../../config";

type ConvertRouteArgs = {
  fromToken: TokenInfo;
  toToken: TokenInfo;
  sellAmount: BigNumber;
  gasPrice?: BigNumber;
  network: Network;
};

export type ConvertQuoteRouteArgs = ConvertRouteArgs & {
  provider: ethers.providers.Provider;
  receivingAccount?: string;
};

export type ConvertTransactionRouteArgs = ConvertRouteArgs & {
  buyAmount: BigNumber;
  slippage: number;
  minOut: BigNumber;
  signer: Signer;
  receivingAccount: string;
  referrer?: string;
};

type ConvertInput = Omit<ConvertRouteArgs, "network">;

type ConvertQuoteInput = ConvertInput & {
  provider?: ethers.providers.Provider;
  receivingAccount?: string;
};

type ConvertTransactionInput = ConvertInput & {
  buyAmount: BigNumber;
  slippage: number;
  signer: Signer;
};

type Allowance = {
  token: TokenInfo;
  target: string;
  amount: BigNumber;
};

export type AllowanceTarget = Array<Allowance>;

// This is the type returned by the routes
export type RawQuote = {
  buyAmount: string;
  sellAmount: string;
  gas: number;
  allowanceTarget: AllowanceTarget;
  feeBasisPoints: number;
  feeChargedBeforeConvert: boolean;
};

// this is the type exposed by getQuote
export type Quote = RawQuote & {
  usdValues: {
    valueIn: number | undefined;
    valueOut: number | undefined;
  };
};

export default class Convert {
  private static getHighestWeightRoute = async (weightInfo: WeightInput) => {
    const weightedRoutes = await Promise.all(
      routes.map((route) =>
        route
          .weight(weightInfo)
          .catch((_) => 0)
          .then((calculatedWeight) => ({
            quote: route.quote,
            transaction: route.transaction,
            calculatedWeight,
          }))
      )
    );
    weightedRoutes.sort((a, b) => b.calculatedWeight - a.calculatedWeight);
    const route = weightedRoutes[0];
    if (route.calculatedWeight === 0) {
      throw new Error(
        `No route found for ${weightInfo.fromToken.symbol} and ${weightInfo.toToken.symbol}`
      );
    }
    return route;
  };

  private static getValidatedNetwork = async (
    token1: TokenInfo,
    token2: TokenInfo,
    signerOrProvider?: Signer | ethers.providers.Provider
  ): Promise<Network> => {
    // ensures tokens are on same network
    if (token1.chainId !== token2.chainId) {
      throw new Error(
        `Tokens ${token1.symbol} and ${token2.symbol} are on different chains`
      );
    }
    const network = CHAIN_ID_TO_NETWORK_NAME[token1.chainId];
    // ensures network is supported
    if (!network) {
      throw new Error(`Token ${token1.symbol} is on an unsupported chain`);
    }
    // if there is a signer or provider, make sure it is on the same chain as the token
    if (
      signerOrProvider &&
      network !== (await getNetworkFromSignerOrProvider(signerOrProvider))
    ) {
      throw new Error(
        `Signer/Provider is on a different network than the tokens`
      );
    }
    return network;
  };

  public static getQuote = async (input: ConvertQuoteInput): Promise<Quote> => {
    const network = await Convert.getValidatedNetwork(
      input.fromToken,
      input.toToken,
      input.provider
    );
    const provider = input.provider || config.providers[network];
    const route = await this.getHighestWeightRoute({
      fromToken: input.fromToken,
      toToken: input.toToken,
      provider,
      network: network,
    });
    const quoteInput: ConvertQuoteRouteArgs = {
      ...input,
      provider,
      network,
    };

    await HandleTokenManagerInstance.initialLoad;
    const quote = await route.quote(quoteInput);

    const [volumeIn, volumeOut] = await Promise.all([
      getUsdValue(input.fromToken, BigNumber.from(quote.sellAmount)),
      getUsdValue(input.toToken, BigNumber.from(quote.buyAmount)),
    ]);

    return {
      ...quote,
      usdValues: {
        valueIn: volumeIn,
        valueOut: volumeOut,
      },
    };
  };

  public static getSwap = async (
    input: ConvertTransactionInput
  ): Promise<ethers.PopulatedTransaction> => {
    const network = await Convert.getValidatedNetwork(
      input.fromToken,
      input.toToken,
      input.signer
    );
    if (!input.signer.provider) throw new Error("signer must have provider");

    const route = await this.getHighestWeightRoute({
      fromToken: input.fromToken,
      toToken: input.toToken,
      provider: input.signer.provider,
      network: network,
    });

    const receivingAccount = await input.signer.getAddress();

    await HandleTokenManagerInstance.initialLoad;
    const tx = await route.transaction({
      ...input,
      // DEPRECATED. TODO: remove.
      referrer: undefined,
      network,
      receivingAccount,
      minOut: getMinOut(input.buyAmount, input.slippage),
    });

    // insert gas estimate depending on tx type
    if (tx.type === 2) {
      tx.maxFeePerGas = input.gasPrice;
    } else {
      tx.gasPrice = input.gasPrice;
    }

    return tx;
  };
}
