import { ethers } from "hardhat";
import { expect } from "chai";
import { eth, fxAud } from "../test-tokens";
import { config, ConvertSDK, TokenInfo } from "../../../../src";
import { testTokenList } from "../../../mock-data/token-config";
import { describeForNonTestingWeekendOnly } from "../../../utils";

const signer = ethers.provider.getSigner(0);
let usdc: TokenInfo;

describeForNonTestingWeekendOnly()("hlpToCurve", () => {
  before(() => {
    usdc = testTokenList.getTokenBySymbol("USDC.e", "arbitrum")!;
  });
  describe("quote", () => {
    it("should get a quote from hlp to a curve token", async () => {
      const sellAmount = ethers.utils.parseUnits("5", 18);
      const quote = await ConvertSDK.getQuote({
        fromToken: fxAud,
        toToken: usdc,
        receivingAccount: ethers.constants.AddressZero,
        sellAmount,
        gasPrice: ethers.constants.One,
        provider: signer.provider,
      });
      expect(quote.allowanceTarget[0].target).to.eq(
        config.protocol.arbitrum.protocol.routers.routerHpsmHlpCurve
      );
      expect(quote.sellAmount.toString()).to.eq(sellAmount.toString());
    });
    it("should get a quote from eth to a curve token", async () => {
      const sellAmount = ethers.utils.parseUnits("5", 18);
      const quote = await ConvertSDK.getQuote({
        fromToken: eth,
        toToken: usdc,
        receivingAccount: ethers.constants.AddressZero,
        sellAmount,
        gasPrice: ethers.constants.One,
        provider: signer.provider,
      });
      expect(quote.allowanceTarget.length).to.eq(0);
      expect(quote.sellAmount.toString()).to.eq(sellAmount.toString());
    });
  });
});
