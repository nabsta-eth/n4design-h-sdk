import { TokenInfo } from "@uniswap/token-lists";
import TokenManager, { DEFAULT_CONFIG, DEFAULT_TOKEN_LIST_URLS } from ".";
import { Network } from "../..";
import { isSameNetwork, validateTokenList } from "../../utils/tokenlist";
import nativeTokenList from "../../config/token-lists/native-tokens.json";
import handleTokenList from "../../config/token-lists/handle-tokens.json";
import handleStakingTokenList from "../../config/token-lists/staking-tokens.json";
import miscTokenList from "../../config/token-lists/misc-tokens.json";
import glpTokenList from "../../config/token-lists/glp-tokens.json";

const NativeTokenList = validateTokenList(nativeTokenList);
const HandleTokenList = validateTokenList(handleTokenList);
const HandleStakingTokenList = validateTokenList(handleStakingTokenList);
const MiscellaneousTokenList = validateTokenList(miscTokenList);
const GlpTokenList = validateTokenList(glpTokenList);

const HANDLE_TOKEN_KEY = "handle-tokens";
const NATIVE_TOKEN_KEY = "native-tokens";
const HANDLE_STAKING_TOKEN_KEY = "handle-staking-tokens";
const MISCELLANEOUS_TOKENS = "misc-tokens";
const GLP_TOKENS = "glp-tokens";

/**
 * TokenManager that comes with native, wrapped native, and handle tokens by default.
 * Handle supported token extensions:
 * - isNative: true if token is native for that network (e.g. ETH, MATIC)
 * - isHlpToken: true if the token is a hlp token in a handle Vault contract
 * - isWrappedNative: true if the token is a wrapped version of a native token (e.g. WETH)
 * - isStable: true if the token is a USD stablecoin, false otherwise,
 * - isShortable: true if the token is shortable, false otherwise
 * - isFxToken: true if token is a fx token, false otherwise
 * - isLiquidityToken: true if token is the Handle Liquidity Pool token (symbol hLP), false otherwise
 * @note the Handle Liquidity Pool token (symbol hLP) has isHlpToken set to false,
 * as it is not technically in the liquidity pool. Instead, it has isLiquidityToken set to true
 */
class HandleTokenManager extends TokenManager {
  constructor(config = DEFAULT_CONFIG) {
    super(config);
    this.setTokenList(NATIVE_TOKEN_KEY, NativeTokenList);
    this.setTokenList(HANDLE_TOKEN_KEY, HandleTokenList);
    this.setTokenList(HANDLE_STAKING_TOKEN_KEY, HandleStakingTokenList);
    this.setTokenList(MISCELLANEOUS_TOKENS, MiscellaneousTokenList);
    this.setTokenList(GLP_TOKENS, GlpTokenList);
  }

  /**
   * Creates an instance of HandleTokenList from a TokenList instance.
   * @param tokenManager the tokenList from which to construct the HandleTokenList
   * @returns an instance of HandleTokenList with the cache of the tokenList
   */
  public static from(tokenManager: TokenManager): HandleTokenManager {
    const handleList = new HandleTokenManager();
    Object.assign(handleList.cache, tokenManager.getCache());
    return handleList;
  }

  /**
   * Gets all hLP tokens for a network
   * @param network the network on which to search for tokens
   * @returns all hLP tokens for the network
   */
  public getHlpTokens(network: number | Network): TokenInfo[] {
    const tokens = this.getFromCache(HANDLE_TOKEN_KEY)?.tokens.filter((t) =>
      isSameNetwork(t.chainId, network)
    );

    if (!tokens) throw new Error("No handle token list in cache");

    return tokens.filter((token) => token.extensions?.isHlpToken);
  }

  /**
   * Checks if a token is a supported hLP token by its symbol
   * @param symbol the symbol of the token to check
   * @param network the network on which to check the token
   * @returns wheteher the token is a hlpToken
   */
  public isHlpTokenBySymbol(
    symbol: string,
    network: Network | number
  ): boolean {
    const tokens = this.getHlpTokens(network);
    return tokens.some((token) => token.symbol === symbol);
  }

  /**
   * Checks if a token is a supported hLP token by its address
   * @param address the address of the token to check
   * @param network the network on which to check the token
   * @returns wheteher the token is a hlpToken
   */
  public isHlpTokenByAddress(
    address: string,
    network: Network | number
  ): boolean {
    const tokens = this.getHlpTokens(network);
    return tokens.some(
      (token) => token.address.toLowerCase() === address.toLowerCase()
    );
  }

  /**
   * Checks if the token is a stable hLP token
   * @param symbol the symbol of the token to check
   * @param network the network on which to check the token
   * @returns whether there exists a stable hLP token with the given symbol
   */
  public isHlpStableTokenBySymbol(
    symbol: string,
    network: Network | number
  ): boolean {
    return this.getHlpTokens(network).some(
      (token) => token.symbol === symbol && token.extensions?.isStable
    );
  }

  /**
   * Checks if the token is a stable hLP token
   * @param address the address of the token to check
   * @param network the network on which to check the token
   * @returns whether there exists a stable hLP token with the given address
   */
  public isHlpStableTokenByAddress(
    address: string,
    network: Network | number
  ): boolean {
    return this.getHlpTokens(network).some(
      (token) =>
        token.address.toLowerCase() === address.toLowerCase() &&
        token.extensions?.isStable
    );
  }

  /**
   * Finds the hLP compatible wrapped native token for a network
   * @param network the network from which to get the token
   * @returns the wrapped native token if one exists, otherwise undefined
   */
  public getHlpWrappedNativeToken(network: Network | number) {
    return this.getHlpTokens(network).find(
      (token) => token.extensions?.isWrappedNative
    );
  }

  /**
   * Gets the handle liquidity pool token (symbol hLP) for a network
   * @param network the network on which to find the token
   * @returns the handle liquidity pool token if it exists, otherwise undefined
   */
  public getHandleLiquidityToken(
    network: Network | number
  ): TokenInfo | undefined {
    const tokens = this.getLoadedTokens(network);
    return tokens.find((token) => token.extensions?.isLiquidityToken);
  }

  /**
   * Parses a token into a hLP wrapped native token if it is a native token
   * @param token the token to check
   * @returns an object with the properties isNative and hlpAddress. If the token is native, isNative is
   * true and hlpAddress is the address of a hlp compatible wrapped native token. If the token is a hLP
   * token, isNative is false and hlpAddress is the address of the hLP token.
   * @throws if the token is neither native, nor a hLP supported token, nor the handle liquidity token
   * @throws if the token is native, and no hLP compatible wrapped native token exists
   * @deprecated in favour of parseNativeToWrapped
   */
  public checkForHlpNativeToken(token: TokenInfo): {
    isNative: boolean;
    hlpAddress: string;
  } {
    if (token.extensions?.isNative) {
      const wrappedNative = this.getHlpWrappedNativeToken(token.chainId);
      if (!wrappedNative) {
        throw new Error(
          `Token '${token.symbol}' is native but no hlp compatible wrapped native token found`
        );
      }
      return { isNative: true, hlpAddress: wrappedNative.address };
    }
    if (!token.extensions?.isHlpToken && !token.extensions?.isLiquidityToken) {
      throw new Error(
        `Token '${token.symbol}' is neither the handle liquidity token, a hLP supported token, or a native token`
      );
    }
    return { isNative: false, hlpAddress: token.address };
  }

  /**
   * Parses a token into a wrapped native token if it is native
   * @param token the token to parse
   * @returns an object with the properties isInputNative and parsedToken. If the token passed into the
   * function is native, isInputNative will be set to true, and parsedToken will be the native wrapped token
   * for the network. If the token passed in is not native, isInputNative will be set to false and parsedToken
   * will be the token passed into the function
   */
  public parseNativeToWrapped(token: TokenInfo): {
    isInputNative: boolean;
    parsedToken: TokenInfo;
  } {
    if (!token.extensions?.isNative) {
      return {
        isInputNative: false,
        parsedToken: token,
      };
    }

    const wrappedNative = this.getWrappedNativeToken(token.chainId);
    if (!wrappedNative)
      throw new Error(
        `Cannot find wrapped native token on chain ${token.chainId}`
      );
    return {
      isInputNative: true,
      parsedToken: wrappedNative,
    };
  }
}

export const HandleTokenManagerInstance = new HandleTokenManager({
  tokenListUrls: DEFAULT_TOKEN_LIST_URLS,
});

export default HandleTokenManager;
