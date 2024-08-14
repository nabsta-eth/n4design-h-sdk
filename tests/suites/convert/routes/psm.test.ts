import { ethers } from "hardhat";
import { expect } from "chai";
import Convert from "../../../../src/components/convert";
import { fxUsd } from "../test-tokens";
import { config } from "../../../../src";
import { testTokenList } from "../../../mock-data/token-config";
import { TokenInfo } from "@uniswap/token-lists";

let usdt: TokenInfo;

const signer = ethers.provider.getSigner(0);

describe("psm", () => {
  before(() => {
    const foundUsdt = testTokenList.getTokenBySymbol("USDT", "arbitrum");
    if (!foundUsdt) {
      throw new Error("USDT not found on arbitrum");
    }
    usdt = foundUsdt;
  });
  describe("quote", () => {
    it("should return a quote from pegged tokens", async () => {
      // fxUSD is assumed to be pegged to USDT
      const quote = await Convert.getQuote({
        fromToken: usdt,
        toToken: fxUsd,
        receivingAccount: ethers.constants.AddressZero,
        sellAmount: ethers.utils.parseUnits("5", usdt.decimals),
        gasPrice: ethers.constants.One,
        provider: signer.provider,
      });
      expect(quote.sellAmount).to.eq(
        ethers.utils.parseUnits("5", usdt.decimals).toString()
      );
      expect(quote.buyAmount).to.eq(ethers.utils.parseEther("5").toString());
      expect(quote.allowanceTarget[0].target).to.eq(
        config.protocol.arbitrum?.protocol.hpsm
      );
      expect(quote.feeChargedBeforeConvert).to.be.false;
    });
  });
  describe("swap", () => {
    it("should return a swap to pegged tokens", async () => {
      const tx = await Convert.getSwap({
        fromToken: usdt,
        toToken: fxUsd,
        gasPrice: ethers.utils.parseUnits("1", "gwei"),
        sellAmount: ethers.utils.parseUnits("1", usdt.decimals),
        buyAmount: ethers.utils.parseUnits("1", fxUsd.decimals),
        signer: signer,
        slippage: 0.5,
      });
      expect(tx).to.be.an("object");
      expect(tx.to).to.eq(config.protocol.arbitrum?.protocol.hpsm);
    });
  });
});
