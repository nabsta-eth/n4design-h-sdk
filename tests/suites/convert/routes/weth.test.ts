import { ethers } from "hardhat";
import { expect } from "chai";
import Convert from "../../../../src/components/convert";
import { eth, weth } from "../test-tokens";

const signer = ethers.provider.getSigner(0);

describe("weth route", () => {
  describe("quote", () => {
    it("should be 1-1 from eth to weth", async () => {
      const quote = await Convert.getQuote({
        fromToken: weth,
        toToken: eth,
        receivingAccount: ethers.constants.AddressZero,
        sellAmount: ethers.constants.One,
        gasPrice: ethers.constants.One,
      });
      expect(quote.sellAmount).to.eq(quote.buyAmount);
      expect(quote.feeBasisPoints).to.eq(0);
      expect(quote.allowanceTarget.length).to.eq(0);
    });
    it("should be 1-1 from weth to eth", async () => {
      const quote = await Convert.getQuote({
        fromToken: weth,
        toToken: eth,
        receivingAccount: ethers.constants.AddressZero,
        sellAmount: ethers.constants.One,
        gasPrice: ethers.constants.One,
      });
      expect(quote.sellAmount).to.eq(quote.buyAmount);
      expect(quote.feeBasisPoints).to.eq(0);
      expect(quote.allowanceTarget.length).to.eq(0);
    });
  });
  describe("swap", () => {
    it("should return a transaction from eth to weth", async () => {
      const tx = await Convert.getSwap({
        fromToken: eth,
        toToken: weth,
        gasPrice: ethers.constants.One,
        buyAmount: ethers.utils.parseEther("0.01"),
        sellAmount: ethers.utils.parseEther("0.01"),
        signer: signer,
        slippage: 0.5,
      });
      expect(tx).to.be.an("object");
    });
    it("should return a transaction from weth to eth", async () => {
      const tx = await Convert.getSwap({
        fromToken: weth,
        toToken: eth,
        gasPrice: ethers.utils.parseUnits("1", "gwei"),
        buyAmount: ethers.utils.parseEther("0.01"),
        sellAmount: ethers.utils.parseEther("0.01"),
        signer: signer,
        slippage: 0.5,
      });
      expect(tx).to.be.an("object");
    });
  });
});
