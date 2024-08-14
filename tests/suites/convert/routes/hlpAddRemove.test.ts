import { ethers } from "hardhat";
import { expect } from "chai";
import Convert from "../../../../src/components/convert";
import { eth, fxUsd, hlp } from "../test-tokens";
import {
  getInternalHlpToken,
  getHlpContracts,
} from "../../../../src/components/trade/platforms/hlp/config";

const signer = ethers.provider.getSigner(0);

const { hlpRewardRouter, hlpManager } = getHlpContracts("arbitrum");

xdescribe("hLPAddRemove", () => {
  describe("quote", () => {
    it("should correctly calculate from hlp to a token", async () => {
      const quote = await Convert.getQuote({
        fromToken: hlp,
        toToken: fxUsd,
        receivingAccount: ethers.constants.AddressZero,
        sellAmount: ethers.utils.parseEther("1"),
        gasPrice: ethers.constants.One,
      });
      expect(quote.sellAmount).to.eq(ethers.utils.parseEther("1").toString());
      expect(quote.buyAmount).to.not.a("string");
      expect(quote.feeChargedBeforeConvert).to.be.false;
      expect(quote.allowanceTarget).to.eq(
        getHlpContracts("arbitrum").hlpManager.address
      );
    });
    it("should correctly calculate from hlp to eth ", async () => {
      const quote = await Convert.getQuote({
        fromToken: hlp,
        toToken: eth,
        receivingAccount: ethers.constants.AddressZero,
        sellAmount: ethers.utils.parseEther("1"),
        gasPrice: ethers.constants.One,
      });
      expect(quote.sellAmount).to.eq(ethers.utils.parseEther("1").toString());
      expect(quote.buyAmount).to.not.a("string");
      expect(quote.feeChargedBeforeConvert).to.be.false;
      expect(quote.allowanceTarget.length).to.be.eq(0);
    });
    it("should correctly calculate a token to hlp", async () => {
      const quote = await Convert.getQuote({
        toToken: hlp,
        fromToken: fxUsd,
        receivingAccount: ethers.constants.AddressZero,
        sellAmount: ethers.utils.parseEther("5"),
        gasPrice: ethers.constants.One,
      });
      expect(quote.sellAmount).to.not.a("string");
      expect(quote.buyAmount).to.not.a("string");
      const targets = quote.allowanceTarget.map(({ target }) => target);
      const tokens = quote.allowanceTarget.map(({ token }) => token.address);
      expect(targets).to.include(hlpRewardRouter.address);
      expect(targets).to.include(hlpManager.address);
      expect(tokens).to.include(fxUsd.address);
      expect(tokens).to.include(getInternalHlpToken("arbitrum").address);
    });
    it("should correctly calculate eth to hlp", async () => {
      const quote = await Convert.getQuote({
        toToken: hlp,
        fromToken: eth,
        receivingAccount: ethers.constants.AddressZero,
        sellAmount: ethers.utils.parseEther("5"),
        gasPrice: ethers.constants.One,
      });
      expect(quote.sellAmount).to.not.a("string");
      expect(quote.buyAmount).to.not.a("string");
      expect(quote.allowanceTarget[0].target).to.eq(hlpRewardRouter.address);
      expect(quote.allowanceTarget?.length).to.eq(1);
    });
  });
  describe("swap", () => {
    it("should return a transaction from hlp to a token", async () => {
      const tx = await Convert.getSwap({
        fromToken: hlp,
        toToken: fxUsd,
        gasPrice: ethers.utils.parseUnits("1", "gwei"),
        sellAmount: ethers.utils.parseUnits("1", hlp.decimals),
        buyAmount: ethers.utils.parseUnits("1", fxUsd.decimals),
        signer: signer,
        slippage: 0.5,
      });
      expect(tx).to.be.an("object");
      expect(tx.to).to.eq(hlpRewardRouter.address);
    });
    it("should return a transaction from hlp to eth ", async () => {
      const tx = await Convert.getSwap({
        fromToken: hlp,
        toToken: eth,
        gasPrice: ethers.utils.parseUnits("1", "gwei"),
        sellAmount: ethers.utils.parseUnits("1", hlp.decimals),
        // price of eth fluctuates, so set buy amount to zero
        buyAmount: ethers.utils.parseUnits("0", eth.decimals),
        signer: signer,
        slippage: 0.5,
      });
      expect(tx).to.be.an("object");
      expect(tx.to).to.eq(hlpRewardRouter.address);
    });
    it("should return a transaction from a token to hlp", async () => {
      const tx = await Convert.getSwap({
        fromToken: fxUsd,
        toToken: hlp,
        gasPrice: ethers.utils.parseUnits("1", "gwei"),
        sellAmount: ethers.utils.parseUnits("1", fxUsd.decimals),
        buyAmount: ethers.utils.parseUnits("1", hlp.decimals),
        signer: signer,
        slippage: 0.5,
      });
      expect(tx).to.be.an("object");
      expect(tx.to).to.eq(hlpRewardRouter.address);
    });
    it("should return a transaction from eth to hlp", async () => {
      const tx = await Convert.getSwap({
        fromToken: eth,
        toToken: hlp,
        gasPrice: ethers.utils.parseUnits("1", "gwei"),
        sellAmount: ethers.utils.parseUnits("1", eth.decimals),
        // price of eth fluctuates, so set buy amount to zero
        buyAmount: ethers.utils.parseUnits("0", fxUsd.decimals),
        signer: signer,
        slippage: 0.5,
      });
      expect(tx).to.be.an("object");
      expect(tx.to).to.eq(hlpRewardRouter.address);
    });
  });
});
