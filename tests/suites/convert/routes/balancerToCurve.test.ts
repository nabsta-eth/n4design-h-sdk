import { ethers } from "hardhat";
import { config, ConvertSDK } from "../../../../src";
import { forex, usdt } from "../test-tokens";
import { expect } from "chai";

describe("balancerToCurve", () => {
  describe("quote", () => {
    it("should return a quote for FOREX to USDT", async () => {
      const sellAmount = ethers.utils.parseEther("100");
      const quote = await ConvertSDK.getQuote({
        fromToken: forex,
        toToken: usdt,
        sellAmount,
      });
      // TODO add this part back when forex slippage is lower
      // const valueIn = quote.usdValues.valueIn ?? 0;
      // expect(quote.usdValues.valueOut)
      //   .to.be.below(valueIn * 1.1)
      //   .and.above(valueIn * 0.9);
      expect(quote.allowanceTarget[0].target).to.eq(
        config.protocol.arbitrum.protocol.routers.routerBalancerCurve
      );
    });
  });
  describe("swap", () => {
    it("should return a swap for FOREX to USDT", async () => {
      const sellAmount = ethers.utils.parseEther("100");
      const tx = await ConvertSDK.getSwap({
        fromToken: forex,
        toToken: usdt,
        sellAmount,
        buyAmount: sellAmount,
        signer: (await ethers.getSigners())[0],
        slippage: 0.5,
      });
      expect(tx.to).to.eq(
        config.protocol.arbitrum.protocol.routers.routerBalancerCurve
      );
      expect(tx).to.have.property("data");
    });
  });
});
