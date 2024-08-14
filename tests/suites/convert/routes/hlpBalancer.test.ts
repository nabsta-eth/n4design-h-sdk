import { ethers } from "hardhat";
import { expect } from "chai";
import { config, ConvertSDK } from "../../../../src";
import { eth, forex, fxEur, fxUsd } from "../test-tokens";
import { describeForNonTestingWeekendOnly } from "../../../utils";

const signer = ethers.provider.getSigner(0);

describeForNonTestingWeekendOnly()("hlpBalancer", () => {
  describe("quote", () => {
    it("should return a quote from hLP token to a balancer token", async () => {
      const quote = await ConvertSDK.getQuote({
        fromToken: fxEur,
        toToken: forex,
        sellAmount: ethers.utils.parseEther("5"),
        provider: signer.provider,
      });
      expect(quote.allowanceTarget[0].target).to.eq(
        config.protocol.arbitrum?.protocol.routers.routerHlpBalancer
      );
      expect(quote.feeChargedBeforeConvert).to.be.false;
    });
    it("should return a quote from hLP token directly to a balancer token", async () => {
      const quote = await ConvertSDK.getQuote({
        fromToken: fxUsd,
        toToken: forex,
        sellAmount: ethers.utils.parseEther("5"),
        provider: signer.provider,
      });
      expect(quote.allowanceTarget[0].target).to.eq(
        config.protocol.arbitrum?.protocol.routers.routerHlpBalancer
      );
      expect(quote.feeChargedBeforeConvert).to.be.false;
    });
    it("should return a quote from a balancer token to a hLP token", async () => {
      const quote = await ConvertSDK.getQuote({
        toToken: fxEur,
        fromToken: forex,
        sellAmount: ethers.utils.parseEther("5"),
        provider: signer.provider,
      });
      expect(quote.allowanceTarget[0].target).to.eq(
        config.protocol.arbitrum?.protocol.routers.routerHlpBalancer
      );
      expect(quote.feeChargedBeforeConvert).to.be.false;
    });
    it("should return a quote from a balancer token directly to a hLP token", async () => {
      const quote = await ConvertSDK.getQuote({
        fromToken: forex,
        toToken: fxUsd,
        sellAmount: ethers.utils.parseEther("5"),
        provider: signer.provider,
      });
      expect(quote.allowanceTarget[0].target).to.eq(
        config.protocol.arbitrum?.protocol.routers.routerHlpBalancer
      );
      expect(quote.feeChargedBeforeConvert).to.be.false;
    });
    it("should return a quote from a balancer token to ETH", async () => {
      const quote = await ConvertSDK.getQuote({
        fromToken: forex,
        toToken: eth,
        sellAmount: ethers.utils.parseEther("5"),
        provider: signer.provider,
      });
      expect(quote.allowanceTarget[0].target).to.eq(
        config.protocol.arbitrum?.protocol.routers.routerEthHlpBalancer
      );
      expect(quote.feeChargedBeforeConvert).to.be.false;
    });
    it("should return a quote from ETH to a balancer token", async () => {
      const quote = await ConvertSDK.getQuote({
        fromToken: eth,
        toToken: forex,
        sellAmount: ethers.utils.parseEther("5"),
        provider: signer.provider,
      });
      expect(quote.allowanceTarget.length).to.eq(0);
      expect(quote.feeChargedBeforeConvert).to.be.false;
    });
  });
  describe("swap", () => {
    it("should return a transaction from hLP token to a balancer token", async () => {
      const tx = await ConvertSDK.getSwap({
        buyAmount: ethers.utils.parseEther("1"),
        sellAmount: ethers.utils.parseEther("0.1"),
        fromToken: fxEur,
        signer,
        slippage: 0.5,
        toToken: forex,
      });

      expect(tx).to.be.an("object");
      expect(tx.to).to.eq(
        config.protocol.arbitrum?.protocol.routers.routerHlpBalancer
      );
    });
    it("should return a transaction from hLP token directly to a balancer token", async () => {
      const tx = await ConvertSDK.getSwap({
        buyAmount: ethers.utils.parseEther("1"),
        sellAmount: ethers.utils.parseEther("0.1"),
        fromToken: fxUsd,
        signer,
        slippage: 0.5,
        toToken: forex,
      });
      expect(tx).to.be.an("object");
      expect(tx.to).to.eq(
        config.protocol.arbitrum?.protocol.routers.routerHlpBalancer
      );
    });
    it("should return a transaction from a balancer token to a hLP token", async () => {
      const tx = await ConvertSDK.getSwap({
        buyAmount: ethers.utils.parseEther("0.1"),
        sellAmount: ethers.utils.parseEther("1"),
        fromToken: forex,
        signer,
        slippage: 0.5,
        toToken: fxEur,
      });
      expect(tx).to.be.an("object");
      expect(tx.to).to.eq(
        config.protocol.arbitrum?.protocol.routers.routerHlpBalancer
      );
    });
    it("should return a transaction from a balancer token directly to a hLP token", async () => {
      const tx = await ConvertSDK.getSwap({
        buyAmount: ethers.utils.parseEther("0.1"),
        sellAmount: ethers.utils.parseEther("1"),
        fromToken: forex,
        signer,
        slippage: 0.5,
        toToken: fxUsd,
      });
      expect(tx).to.be.an("object");
      expect(tx.to).to.eq(
        config.protocol.arbitrum?.protocol.routers.routerHlpBalancer
      );
    });
    // TODO: evaluate whether we need to test for eth swaps in hlp
    xit("should return a transaction from a balancer token to ETH", async () => {
      const tx = await ConvertSDK.getSwap({
        buyAmount: ethers.utils.parseEther("0.1"),
        sellAmount: ethers.utils.parseEther("1"),
        fromToken: forex,
        signer,
        slippage: 0.5,
        toToken: eth,
      });
      expect(tx).to.be.an("object");
      expect(tx.to).to.eq(
        config.protocol.arbitrum?.protocol.routers.routerEthHlpBalancer
      );
    });
    xit("should return a transaction from ETH to a balancer token", async () => {
      const tx = await ConvertSDK.getSwap({
        buyAmount: ethers.utils.parseEther("0.1"),
        sellAmount: ethers.utils.parseEther("1"),
        toToken: forex,
        signer,
        slippage: 0.5,
        fromToken: eth,
      });
      expect(tx).to.be.an("object");
      expect(tx.value?.toString()).to.eq(
        ethers.utils.parseEther("1").toString()
      );
      expect(tx.to).to.eq(
        config.protocol.arbitrum?.protocol.routers.routerEthHlpBalancer
      );
    });
  });
});
