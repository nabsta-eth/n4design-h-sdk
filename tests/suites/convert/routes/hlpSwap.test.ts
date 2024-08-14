import { ethers } from "hardhat";
import { expect } from "chai";
import Convert from "../../../../src/components/convert";
import { eth, fxAud, fxUsd } from "../test-tokens";
import { describeForNonTestingWeekendOnly } from "../../../utils";

const signer = ethers.provider.getSigner(0);

describeForNonTestingWeekendOnly()("hlpSwap", () => {
  describe("quote", () => {
    it("should return a quote for two tokens", async () => {
      const quote = await Convert.getQuote({
        toToken: fxAud,
        fromToken: fxUsd,
        receivingAccount: ethers.constants.AddressZero,
        sellAmount: ethers.utils.parseEther("5"),
        gasPrice: ethers.constants.One,
      });
      expect(quote.sellAmount).to.be.a("string");
      expect(quote.buyAmount).to.be.a("string");
      expect(quote.feeChargedBeforeConvert).to.be.false;
    });
    it("should return a quote for a token and eth", async () => {
      const quote = await Convert.getQuote({
        toToken: fxAud,
        fromToken: eth,
        receivingAccount: ethers.constants.AddressZero,
        sellAmount: ethers.utils.parseEther("5"),
        gasPrice: ethers.constants.One,
      });
      expect(quote.sellAmount).to.be.a("string");
      expect(quote.buyAmount).to.be.a("string");
      expect(quote.feeChargedBeforeConvert).to.be.false;
    });
  });
  describe("swap", () => {
    it("should return a swap for two tokens", async () => {
      const tx = await Convert.getSwap({
        fromToken: fxUsd,
        toToken: fxAud,
        gasPrice: ethers.utils.parseUnits("1", "gwei"),
        sellAmount: ethers.utils.parseUnits("1", fxUsd.decimals),
        // price of fxUsd / fxAud fluctuates, so set buy amount to zero
        buyAmount: ethers.utils.parseUnits("0", fxAud.decimals),
        signer: signer,
        slippage: 0.5,
      });
      expect(tx).to.be.an("object");
    });
    // TODO: evaluate whether we need to test for eth swaps in hlp
    xit("should return a swap for a token and eth", async () => {
      const tx = await Convert.getSwap({
        fromToken: fxUsd,
        toToken: eth,
        gasPrice: ethers.utils.parseUnits("1", "gwei"),
        sellAmount: ethers.utils.parseUnits("1", fxUsd.decimals),
        // price of fxUsd / eth fluctuates, so set buy amount to zero
        buyAmount: ethers.utils.parseUnits("0", eth.decimals),
        signer: signer,
        slippage: 0.5,
      });
      expect(tx).to.be.an("object");
    });
  });
});
