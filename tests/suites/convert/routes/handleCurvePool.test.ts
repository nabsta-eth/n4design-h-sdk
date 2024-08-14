import { ethers } from "hardhat";
import { expect } from "chai";
import Convert from "../../../../src/components/convert";
import { fxUsd } from "../test-tokens";
import { config } from "../../../../src";
import { testTokenList } from "../../../mock-data/token-config";
import { TokenInfo } from "@uniswap/token-lists";

let usdt: TokenInfo;

const signer = ethers.provider.getSigner(0);

describe("handleCurvePool", () => {
  before(() => {
    const foundUsdt = testTokenList.getTokenBySymbol("USDT", "arbitrum");
    if (!foundUsdt) {
      throw new Error("USDT not found on arbitrum");
    }
    usdt = foundUsdt;
  });
  describe("quote", () => {
    it("should return a quote from hLP token to curve token", async () => {
      // fxUSD is assumed to be pegged to USDT
      const quote = await Convert.getQuote({
        toToken: usdt,
        fromToken: fxUsd,
        receivingAccount: ethers.constants.AddressZero,
        sellAmount: ethers.utils.parseEther("5"),
        gasPrice: ethers.constants.One,
        provider: signer.provider,
      });
      const minExpectedOut = ethers.utils.parseUnits("4.9", usdt.decimals);
      expect(quote.sellAmount).to.eq(
        ethers.utils.parseUnits("5", fxUsd.decimals).toString()
      );
      expect(minExpectedOut.lt(quote.buyAmount)).to.be.true;
      expect(quote.allowanceTarget[0].target.toLowerCase()).to.eq(
        config.lpStaking.arbitrum["curveHandle3"].lpToken.address.toLowerCase()
      );
      expect(quote.feeChargedBeforeConvert).to.be.false;
    });
  });
  describe("swap", () => {
    it("should return a swap from hLP token to curve token", async () => {
      const usdt = testTokenList.getTokenBySymbol("USDT", "arbitrum");
      if (!usdt) {
        throw new Error("USDT not found on arbitrum");
      }
      const tx = await Convert.getSwap({
        toToken: usdt,
        fromToken: fxUsd,
        gasPrice: ethers.utils.parseUnits("1", "gwei"),
        sellAmount: ethers.utils.parseUnits("1", usdt.decimals),
        buyAmount: ethers.utils.parseUnits("1", fxUsd.decimals),
        signer: signer,
        slippage: 0.5,
      });
      expect(tx).to.be.an("object");
      expect(tx.to?.toLowerCase()).to.eq(
        config.lpStaking.arbitrum["curveHandle3"].lpToken.address.toLowerCase()
      );
    });
  });
});
