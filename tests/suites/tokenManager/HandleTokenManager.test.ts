import { expect } from "chai";
import { HandleTokenManager, TokenManager } from "../../../src";
import { DEFAULT_TOKEN_LIST_URLS } from "../../../src/components/token-manager";

describe("Handle Token Manager", () => {
  it("should be able to inherit from a TokenManager", async () => {
    const tokenManager = new TokenManager({ tokenListUrls: [] });
    await tokenManager.initialLoad;
    const handleTokenManager = HandleTokenManager.from(tokenManager);

    expect(Object.keys(handleTokenManager.getCache()).length).to.gte(
      DEFAULT_TOKEN_LIST_URLS.length
    );
  });
  it("should be able to get hLP tokens", () => {
    const tokenManager = new HandleTokenManager({ tokenListUrls: [] });
    const hlpTokens = tokenManager.getHlpTokens("arbitrum");
    expect(hlpTokens).to.exist;
    expect(
      hlpTokens.filter((token) => !token.extensions?.isHlpToken)
    ).to.have.lengthOf(0);

    const handleLiquidityToken =
      tokenManager.getHandleLiquidityToken("arbitrum");
    expect(handleLiquidityToken).to.exist;
    expect(handleLiquidityToken?.extensions?.isLiquidityToken).to.be.true;

    const unsupportedHlpToken =
      tokenManager.getHandleLiquidityToken("ethereum");
    expect(unsupportedHlpToken).to.not.exist;

    expect(tokenManager.getHlpTokens("ethereum")).to.have.lengthOf(0);

    const nativeHlpToken = tokenManager.getHlpWrappedNativeToken("arbitrum");
    expect(nativeHlpToken).to.exist;
    expect(nativeHlpToken?.extensions?.isWrappedNative).to.be.true;
  });
  it("should be able to identify which tokens are hLP tokens", () => {
    const tokenManager = new HandleTokenManager();
    const hlpTokens = tokenManager.getHlpTokens("arbitrum");
    hlpTokens.forEach((token) => {
      expect(tokenManager.isHlpTokenBySymbol(token.symbol, "arbitrum")).to.be
        .true;
      expect(tokenManager.isHlpTokenByAddress(token.address, "arbitrum")).to.be
        .true;
    });

    expect(tokenManager.isHlpTokenBySymbol("FOREX", "arbitrum")).to.be.false;
    expect(tokenManager.isHlpTokenBySymbol("ETH", "arbitrum")).to.be.false;
    expect(
      tokenManager.isHlpTokenByAddress(
        "0xDb298285FE4C5410B05390cA80e8Fbe9DE1F259B",
        "arbitrum"
      )
    ).to.be.false;
    expect(
      tokenManager.isHlpTokenByAddress(
        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        "arbitrum"
      )
    ).to.be.false;
  });
  it("should be able to correctly parse tokens with checkForHlpNativeToken", () => {
    const tokenManager = new HandleTokenManager();
    const fxUsd = tokenManager.getTokenBySymbol("fxUSD", "arbitrum")!;
    const eth = tokenManager.getTokenBySymbol("ETH", "arbitrum")!;
    const weth = tokenManager.getHlpWrappedNativeToken("arbitrum")!;
    expect(fxUsd).to.exist;
    expect(eth).to.exist;
    expect(weth).to.exist;

    {
      const { hlpAddress, isNative } =
        tokenManager.checkForHlpNativeToken(fxUsd);
      expect(hlpAddress.toLowerCase()).to.eq(fxUsd?.address.toLowerCase());
      expect(isNative).to.be.false;
    }

    {
      const { hlpAddress, isNative } = tokenManager.checkForHlpNativeToken(eth);
      expect(hlpAddress.toLowerCase()).to.eq(weth?.address.toLowerCase());
      expect(isNative).to.be.true;
    }

    const unsupportedToken = tokenManager.getTokenBySymbol(
      "FOREX",
      "arbitrum"
    )!;
    expect(() =>
      tokenManager.checkForHlpNativeToken(unsupportedToken)
    ).to.throw(Error);
  });
  it("should parse native tokens to wrapped native tokens with parseNativeToWrapped", () => {
    const tokenManager = new HandleTokenManager({ tokenListUrls: [] });
    const arbEth = tokenManager.getTokenBySymbol("ETH", "arbitrum")!;
    const eth = tokenManager.getTokenBySymbol("ETH", "ethereum")!;
    const matic = tokenManager.getTokenBySymbol("MATIC", "polygon")!;
    expect(arbEth).to.exist;
    expect(eth).to.exist;
    expect(matic).to.exist;

    expect(tokenManager.parseNativeToWrapped(arbEth).isInputNative).to.be.true;
    expect(tokenManager.parseNativeToWrapped(eth).isInputNative).to.be.true;
    expect(tokenManager.parseNativeToWrapped(matic).isInputNative).to.be.true;

    expect(
      tokenManager.parseNativeToWrapped(arbEth).parsedToken.extensions
        ?.isWrappedNative
    ).to.be.true;
    expect(
      tokenManager.parseNativeToWrapped(eth).parsedToken.extensions
        ?.isWrappedNative
    ).to.be.true;
    expect(
      tokenManager.parseNativeToWrapped(matic).parsedToken.extensions
        ?.isWrappedNative
    ).to.be.true;

    const fxUsdArb = tokenManager.getTokenBySymbol("fxUSD", "arbitrum")!;
    const fxUsd = tokenManager.getTokenBySymbol("fxUSD", "ethereum")!;

    expect(tokenManager.parseNativeToWrapped(fxUsdArb).isInputNative).to.be
      .false;
    expect(tokenManager.parseNativeToWrapped(fxUsd).isInputNative).to.be.false;

    expect(tokenManager.parseNativeToWrapped(fxUsdArb).parsedToken).to.eq(
      fxUsdArb
    );
    expect(tokenManager.parseNativeToWrapped(fxUsd).parsedToken).to.eq(fxUsd);
  });
});
