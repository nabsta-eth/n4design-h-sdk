import { ethers } from "hardhat";
import { expect } from "chai";
import { eth, fxAud } from "../test-tokens";
import { config, ConvertSDK, Quote } from "../../../../src";
import { testTokenList } from "../../../mock-data/token-config";
import { TokenInfo } from "@uniswap/token-lists";
import { describeForNonTestingWeekendOnly } from "../../../utils";

let usdt: TokenInfo;

const signer = ethers.provider.getSigner(0);

const ensureQuoteTargetIsRouter = (quote: Quote) => {
  expect(quote.allowanceTarget[0].target).to.eq(
    config.protocol.arbitrum.protocol.routers.routerHpsmHlp
  );
};

describeForNonTestingWeekendOnly()("psmToHlp", () => {
  before(() => {
    const foundUsdt = testTokenList.getTokenBySymbol("USDT", "arbitrum");
    if (!foundUsdt) {
      throw new Error("USDT not found on arbitrum");
    }
    usdt = foundUsdt;
  });
  describe("quote", () => {
    it("should get a quote from a pegged token to a hlp token", async () => {
      // usdt has 6 decimals
      const sellAmount = ethers.utils.parseUnits("5", 6);
      const quote = await ConvertSDK.getQuote({
        fromToken: usdt,
        toToken: fxAud,
        receivingAccount: ethers.constants.AddressZero,
        sellAmount,
        gasPrice: ethers.constants.One,
        provider: signer.provider,
      });
      ensureQuoteTargetIsRouter(quote);
      expect(quote.sellAmount.toString()).to.eq(sellAmount.toString());
      expect(quote.buyAmount).to.be.a("string");
    });
    it("should get a quote from a pegged token to ETH", async () => {
      // usdt has 6 decimals
      const sellAmount = ethers.utils.parseUnits("5", 6);
      const quote = await ConvertSDK.getQuote({
        fromToken: usdt,
        toToken: eth,
        receivingAccount: ethers.constants.AddressZero,
        sellAmount,
        gasPrice: ethers.constants.One,
        provider: signer.provider,
      });
      ensureQuoteTargetIsRouter(quote);
      expect(quote.sellAmount.toString()).to.eq(sellAmount.toString());
      expect(quote.buyAmount).to.be.a("string");
    });
  });
  describe("swap", () => {
    it("should get a transaction from a pegged token to a hlp token", async () => {
      // usdt has 6 decimals
      const sellAmount = ethers.utils.parseUnits("5", 6);
      // sample hlp methods havea 1:1 ratio of token prices
      const expectedBuyAmount = ethers.utils.parseUnits("5", 18);
      const tx = await ConvertSDK.getSwap({
        fromToken: usdt,
        toToken: fxAud,
        sellAmount,
        gasPrice: ethers.constants.One,
        signer,
        buyAmount: expectedBuyAmount,
        slippage: 0.5,
      });
      expect(tx.to).to.eq(
        config.protocol.arbitrum.protocol.routers.routerHpsmHlp
      );
    });
  });
});
