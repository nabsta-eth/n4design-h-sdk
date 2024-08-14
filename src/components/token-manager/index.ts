import axios from "axios";
import { TokenList, TokenInfo } from "@uniswap/token-lists";
import { Network } from "../../types/network";
import { isSameNetwork, validateTokenList } from "../../utils/tokenlist";
import nativeTokenList from "../../config/token-lists/native-tokens.json";
import { NETWORK_NAME_TO_CHAIN_ID } from "../../constants";

const NativeTokenList = validateTokenList(nativeTokenList);

type TokenListCache = {
  [url: string]: TokenList;
};

export const DEFAULT_TOKEN_LIST_URLS: string[] = [
  "https://app.handle.fi/tokenlist/arbitrum.json",
  "https://app.handle.fi/tokenlist/polygon.json",
  "https://app.handle.fi/tokenlist/ethereum.json",
];

type SearchTokenAddress = {
  address: string;
  network?: Network | number;
};

type SearchTokenSymbols = {
  symbol: string;
  network?: Network | number;
};

export type TokenManagerConfig = {
  tokenListUrls?: string[];
  tokens?: TokenInfo[];
};

export const DEFAULT_CONFIG: TokenManagerConfig = {
  tokenListUrls: DEFAULT_TOKEN_LIST_URLS,
};

/**
 * The TokenList class is used to fetch and validate token lists.
 */
class TokenManager {
  /** Caches fetched results indefinitely */
  protected cache: TokenListCache;
  protected customTokens: TokenInfo[];

  public initialLoad: Promise<TokenList[]>;

  /** Called whenever the cache, or custom tokens changes */
  public onTokensChange: () => void;

  constructor({ tokenListUrls, tokens } = DEFAULT_CONFIG) {
    this.cache = {};
    this.customTokens = tokens ?? [];
    this.onTokensChange = () => {};
    this.initialLoad = Promise.all(
      (tokenListUrls ?? []).map((url) => this.fetchTokenList(url))
    );
  }

  /**
   * extracts tokens from the token token lists to a flat array of all the tokens
   * @param tokenLists token lists to get tokens from
   * @returns the tokens from all token lists
   */
  protected getTokensFromLists(tokenLists: TokenList[]): TokenInfo[] {
    return tokenLists.reduce<TokenInfo[]>(
      (acc, tokenList) => acc.concat(tokenList.tokens),
      []
    );
  }

  /**
   * @param urls urls to fetch
   * @returns cached token lists if the cached urls exist, otherwise fetches and returns the tokenlist
   */
  public async getTokensFromUrls(urls: string[]): Promise<TokenInfo[]> {
    const tokenLists = await Promise.all(
      urls.map((url) => this.fetchTokenList(url))
    );
    return this.getTokensFromLists(tokenLists);
  }

  /**
   * Removes tokens that are duplicates of each other by comparing their symbol and chainId
   * @param tokens tokens from which to remove duplicates
   * @returns the tokens with duplicates removed
   */
  protected static removeDuplicates(tokens: TokenInfo[]): TokenInfo[] {
    const seen = new Map<string, boolean>();
    const noDuplicates: TokenInfo[] = [];

    for (const token of tokens) {
      const key = token.symbol + "-" + token.chainId;
      if (seen.get(key)) continue;
      seen.set(key, true);
      noDuplicates.push(token);
    }

    return noDuplicates;
  }

  /**
   * @returns all tokens from all cached token lists
   */
  public getLoadedTokens(
    network?: Network | number,
    removeDuplicates = true
  ): TokenInfo[] {
    const allTokens = [
      ...this.customTokens,
      ...this.getTokensFromLists(Object.values(this.cache)),
    ];
    let returnTokens = allTokens;

    if (removeDuplicates) {
      returnTokens = TokenManager.removeDuplicates(allTokens);
    }

    if (network === undefined) {
      return returnTokens;
    }
    return returnTokens.filter((token) =>
      isSameNetwork(token.chainId, network)
    );
  }

  /**
   * @param symbol symbol of the token to get
   * @param network the network to get the token from
   * @returns the first occurence of the token with the given symbol, or undefined if not found
   */
  public getTokenBySymbol<Symbol extends string>(
    symbol: Symbol,
    network: Network | number
  ): TokenInfo & { symbol: Symbol } {
    const tokens = this.getLoadedTokens(network);
    // In alot of other places, token symbols are strong typed. This typing allows for this, as it is known that if
    // a token is found with the given symbol, it will be the type of the symbol.
    const token = tokens.find((token) => token.symbol === symbol) as
      | TokenInfo & { symbol: Symbol };
    if (!token)
      throw new Error(
        `TokenManager: could not find token ${symbol} on ${network}`
      );
    return token;
  }

  /**
   * @param symbol symbol of the token to get
   * @param network the network to get the token from
   * @returns the first occurence of the token with the given symbol, or undefined if not found
   */
  public tryGetTokenBySymbol<Symbol extends string>(
    symbol: Symbol,
    network: Network | number
  ): (TokenInfo & { symbol: Symbol }) | undefined {
    try {
      return this.getTokenBySymbol(symbol, network);
    } catch (_) {
      return undefined;
    }
  }

  /**
   * @param address address of the token to get
   * @param network the network to get the token from
   * @param find optional function to find the token with specific criteria
   * @returns the first occurence of the token with the given address, or undefined if not found
   */
  public getTokenByAddress(
    address: string,
    network: Network | number,
    find?: (t: TokenInfo) => boolean
  ): TokenInfo {
    const tokens = this.getLoadedTokens(network);
    const token = tokens.find(
      (token) =>
        token.address.toLowerCase() === address.toLowerCase() &&
        (find ? find(token) : true)
    );
    if (!token)
      throw new Error(
        `TokenManager: could not find token ${address} on ${network}`
      );
    return token;
  }

  /**
   * @param address address of the token to get
   * @param network the network to get the token from
   * @param find optional function to find the token with specific criteria
   * @returns the first occurence of the token with the given address, or undefined if not found
   */
  public tryGetTokenByAddress(
    address: string,
    network: Network | number,
    find?: (t: TokenInfo) => boolean
  ): TokenInfo | undefined {
    try {
      return this.getTokenByAddress(address, network, find);
    } catch (_) {
      return undefined;
    }
  }

  /**
   * Finds the native token for a network
   * @param network the network from which to get the token
   * @returns the native token if one exists, otherwise undefined
   */
  public getNativeToken(network: Network | number) {
    return this.getLoadedTokens(network).find(
      (token) => token.extensions?.isNative
    );
  }

  /**
   * Gets the wrapped native token for a network
   * @param network the network from which to get the token
   * @returns the wrapped native token if one exists, otherwise undefined
   */
  public getWrappedNativeToken(network: Network | number) {
    const token = this.getLoadedTokens(network).find(
      (token) => token.extensions?.isWrappedNative
    );
    if (!token)
      throw new Error("TokenManager: could not find wrapped native token");
    return token;
  }

  /**
   * Tries to get the wrapped native token for a network
   * @param network the network from which to get the token
   * @returns the wrapped native token if one exists, otherwise undefined
   */
  public tryGetWrappedNativeToken(network: Network | number) {
    try {
      return this.getWrappedNativeToken(network);
    } catch (_) {
      return undefined;
    }
  }

  /**
   * Returns an array of tokens with the given addresses. Order is not guaranteed.
   * If a token cannot be found with the given address, it will be omitted from the array.
   * If multiple tokens are found with the same address and network, they will all be included.
   * @param search an array of objects with address as the address of the token, and network as the
   * network of the token
   * @returns an array of tokens with the given addresses.
   * @note this is not optimised for large addresses arrays
   */
  public getTokensByAddresses(search: SearchTokenAddress[]): TokenInfo[] {
    const returnTokens: TokenInfo[] = [];

    search.forEach((searchToken) => {
      const token = this.getLoadedTokens().find(
        (token) =>
          token.address.toLowerCase() === searchToken.address.toLowerCase() &&
          (searchToken.network
            ? isSameNetwork(token.chainId, searchToken.network)
            : true)
      );
      if (token) {
        returnTokens.push(token);
      }
    });
    return returnTokens;
  }

  /**
   * Returns an array of tokens with the given symbol. Order is not guaranteed.
   * If a token cannot be found with the given address, it will be omitted from the array.
   * If multiple tokens are found with the same address and network, they will all be included.
   * @param search an array of objects with address as the address of the token, and network as the
   * network of the token
   * @returns an array of tokens with the given symbol.
   * @note this is not optimised for large symbol arrays
   */
  public getTokensBySymbols(search: SearchTokenSymbols[]): TokenInfo[] {
    const returnTokens: TokenInfo[] = [];

    search.forEach((searchToken) => {
      const token = this.getLoadedTokens().find(
        (token) =>
          token.symbol === searchToken.symbol &&
          (searchToken.network
            ? isSameNetwork(token.chainId, searchToken.network)
            : true)
      );
      if (token) {
        returnTokens.push(token);
      }
    });
    return returnTokens;
  }

  /**
   * fetches a token list
   * @param url url to fetch
   * @returns the token list
   * @throws if the token list is invalid
   */
  public async fetchTokenList(url: string) {
    if (this.cache[url]) {
      return this.cache[url];
    }

    const { data } = await axios.get(url);
    const tokenList = validateTokenList(data);
    this.cache[url] = tokenList;
    this.onTokensChange();
    return tokenList;
  }

  /**
   * Fetches a list of tokenLists from the given urls
   * @param urls urls to fetch
   * @returns The fetched token lists
   */
  public async fetchTokenLists(urls: string[]) {
    return Promise.all(urls.map((url) => this.fetchTokenList(url)));
  }

  /**
   * Adds custom tokens to the token manager
   * @param tokens tokens to add
   */
  public addCustomTokens(tokens: TokenInfo[]) {
    this.customTokens.push(...tokens);
    this.onTokensChange();
  }

  /**
   * Clears all custom tokens
   */
  public clearCustomTokens = () => {
    this.customTokens = [];
    this.onTokensChange();
  };

  /**
   * Sets custom tokens as a list of tokens
   * @param tokens tokens to set
   */
  public setCustomTokens = (tokens: TokenInfo[]) => {
    this.customTokens = tokens;
    this.onTokensChange();
  };

  /**
   * @returns all custom tokens
   */
  public getCustomTokens = () => {
    return this.customTokens;
  };

  /**
   * Gets a token list from the cache
   * @param key the key of the token list in the cache
   * @returns the token list with the given key
   */
  public getFromCache(key: string): TokenList | undefined {
    return this.cache[key];
  }

  /**
   * Sets a cache key to a token list
   * @param key the key in the cache for which to set the tokenList
   * @param tokenList the tokenList to set
   */
  public setTokenList(key: string, tokenList: TokenList) {
    validateTokenList(tokenList);
    this.cache[key] = tokenList;
    this.onTokensChange();
  }

  /**
   * Deletes a tokenList in the cache
   * @param key the key in the cache to delete
   */
  public deleteTokenList(key: string) {
    delete this.cache[key];
    this.onTokensChange();
  }

  /**
   * Clears the token list cache
   */
  public clearCache() {
    this.cache = {};
    this.onTokensChange();
  }

  /**
   * Gets the cache
   * @returns the cache
   */
  public getCache() {
    return this.cache;
  }
}

export const getNativeTokenInfo = (network: Network): TokenInfo => {
  const info = NativeTokenList.tokens.find(
    (token) => token.chainId === NETWORK_NAME_TO_CHAIN_ID[network]
  );
  if (!info) {
    throw new Error("getNativeTokenInfo: not found");
  }
  return info;
};

export default TokenManager;
