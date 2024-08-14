import { TokenInfo, TokenList } from "@uniswap/token-lists";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { NETWORK_NAME_TO_CHAIN_ID } from "../constants";
import { Network } from "../types/network";
import validationSchema from "../components/token-manager/schema/tokenlist.schema.json";

/* construct validators */
const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);
const tokenSchemeValidator = ajv.compile(validationSchema);

export const isSameNetwork = (
  network1: Network | number,
  network2: Network | number
) => {
  if (network1 === network2) return true;
  if (typeof network1 === "number" && typeof network2 === "string") {
    return network1 === NETWORK_NAME_TO_CHAIN_ID[network2];
  }

  if (typeof network2 === "number" && typeof network1 === "string") {
    return network2 === NETWORK_NAME_TO_CHAIN_ID[network1];
  }

  return false;
};

/**
 * validates a tokenList and returns it if it is valid, throws otherwise
 * @param tokenList the tokenList to validate
 * @returns the tokenList, if valid
 * @throws if the tokenList is not valid
 */
export const validateTokenList = (tokenList: any) => {
  if (!tokenSchemeValidator(tokenList)) {
    console.error(tokenSchemeValidator.errors);
    throw new Error("Failed to validate token list");
  }
  const validatedList = tokenList as any as TokenList;
  validatedList.tokens.forEach(Object.freeze);
  return validatedList;
};

export const getTokenFromTokenList = (
  tokenList: TokenList,
  symbol: string,
  network: Network | number
): TokenInfo | undefined => {
  return tokenList.tokens.find(
    (token) => token.symbol === symbol && isSameNetwork(token.chainId, network)
  );
};
