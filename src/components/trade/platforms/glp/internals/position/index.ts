import { BigNumber, BytesLike } from "ethers";
import { pairFromString } from "../../../../../../utils/general";
import { PositionId, PositionInternal } from "../../../legacyInterface";
import { TokenInfoGlp } from "../tokens";

export type PositionGlpInternals = {
  contractKey: BytesLike;
  entryFundingRate: BigNumber;
  cumulativeFundingRate: BigNumber;
};

export type PositionGlp = PositionInternal<PositionGlpInternals>;

export const getAllPositionIds = (
  tradableTokens: TokenInfoGlp[],
  stableTokens: TokenInfoGlp[]
): Array<
  PositionId & { collateralToken: TokenInfoGlp; indexToken: TokenInfoGlp }
> => {
  const longs = tradableTokens.map((token) => ({
    pair: pairFromString(`${token.symbol}/USD`),
    isLong: true,
    collateralAddress: token.address,
    indexToken: token,
    collateralToken: token,
  }));
  const shorts = tradableTokens
    .map((token) =>
      stableTokens.map((stableToken) => ({
        pair: pairFromString(`${token.symbol}/USD`),
        isLong: false,
        collateralAddress: stableToken.address,
        indexToken: token,
        collateralToken: stableToken,
      }))
    )
    .flat();
  return [...longs, ...shorts];
};
