import { TokenInfo } from "@uniswap/token-lists";
import { Network } from "../../../../../../types/network";
import { HandleTokenManagerInstance } from "../../../../../token-manager/HandleTokenManager";

type ParsedPositionTokens = {
  collateralToken: TokenInfo;
  indexToken: TokenInfo;
  isCollateralNative: boolean;
  parsedCollateralAddress: string;
  isIndexNative: boolean;
  parsedIndexAddress: string;
};

export const getParsedPositionTokens = (
  collateralAddress: string,
  indexAddress: string,
  network: Network
): ParsedPositionTokens => {
  const collateralToken = HandleTokenManagerInstance.getTokenByAddress(
    collateralAddress,
    network
  );
  if (!collateralToken) throw new Error("Collateral token could not be found");
  const indexToken = HandleTokenManagerInstance.getTokenByAddress(
    indexAddress,
    network
  );
  if (!indexToken) throw new Error("Index token symbol could not be found");
  const { parsedToken: parsedCollateral, isInputNative: isCollateralNative } =
    HandleTokenManagerInstance.parseNativeToWrapped(collateralToken);
  const { parsedToken: parsedIndex, isInputNative: isIndexNative } =
    HandleTokenManagerInstance.parseNativeToWrapped(indexToken);
  return {
    collateralToken,
    indexToken,
    isCollateralNative,
    isIndexNative,
    parsedCollateralAddress: parsedCollateral.address.toLowerCase(),
    parsedIndexAddress: parsedIndex.address.toLowerCase(),
  };
};
