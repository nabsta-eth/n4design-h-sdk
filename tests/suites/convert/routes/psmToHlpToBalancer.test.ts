import { expect } from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";
import { config, ConvertSDK, Quote } from "../../../../src";
import { usdt, eurs, forex } from "../test-tokens";
import { describeForNonTestingWeekendOnly } from "../../../utils";

const ensureQuoteTargetIsRouter = (quote: Quote) => {
  expect(quote.allowanceTarget[0].target.toLowerCase()).to.eq(
    config.protocol.arbitrum.protocol.routers.routerHpsmHlpBalancer.toLowerCase()
  );
};

describeForNonTestingWeekendOnly()("psmToHlpToBalancer", () => {
  let signer: Signer;
  before(async () => {
    [signer] = await ethers.getSigners();
  });

  describe("quote", () => {
    it("should return a quote for USDT to FOREX", async () => {
      const sellAmount = ethers.utils.parseUnits("10", usdt.decimals);
      const quote = await ConvertSDK.getQuote({
        fromToken: usdt,
        toToken: forex,
        sellAmount,
        provider: signer.provider,
      });
      ensureQuoteTargetIsRouter(quote);
      expect(quote.sellAmount.toString()).to.eq(sellAmount.toString());
      expect(quote.gas).to.eq(config.convert.gasEstimates.hpsmHlpBalancer);
    });
    it("should return a quote for EURS to FOREX", async () => {
      const sellAmount = ethers.utils.parseUnits("10", eurs.decimals);
      const quote = await ConvertSDK.getQuote({
        fromToken: eurs,
        toToken: forex,
        sellAmount,
        provider: signer.provider,
      });
      ensureQuoteTargetIsRouter(quote);
      expect(quote.sellAmount.toString()).to.eq(sellAmount.toString());
      expect(quote.gas).to.eq(config.convert.gasEstimates.hpsmHlpBalancer);
    });
  });
  describe("swap", () => {
    it("should return a transaction for USDT to FOREX", async () => {
      const sellAmount = ethers.utils.parseUnits("10", usdt.decimals);
      const buyAmount = ethers.utils.parseEther("200");
      const tx = await ConvertSDK.getSwap({
        fromToken: usdt,
        toToken: forex,
        sellAmount,
        buyAmount,
        signer,
        slippage: 0.5,
      });
      expect(tx.to?.toLowerCase()).to.eq(
        config.protocol.arbitrum.protocol.routers.routerHpsmHlpBalancer.toLowerCase()
      );
      expect(tx.data).to.exist;
    });
    it("should return a transaction for EURS to FOREX", async () => {
      const sellAmount = ethers.utils.parseUnits("10", usdt.decimals);
      const buyAmount = ethers.utils.parseEther("200");
      const tx = await ConvertSDK.getSwap({
        fromToken: eurs,
        toToken: forex,
        sellAmount,
        buyAmount,
        signer,
        slippage: 0.5,
      });
      expect(tx.to?.toLowerCase()).to.eq(
        config.protocol.arbitrum.protocol.routers.routerHpsmHlpBalancer.toLowerCase()
      );
      expect(tx.data).to.exist;
    });
  });
});
