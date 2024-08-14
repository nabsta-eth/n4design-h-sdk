import { expect } from "chai";
import { ethers } from "hardhat";
import { Network, TokenInfo } from "../../../../src";
import Convert from "../../../../src/components/convert";
import { testTokenList } from "../../../mock-data/token-config";
import { eth } from "../test-tokens";

let wbtc: TokenInfo;

describe("paraswap route", () => {
  before(() => {
    wbtc = testTokenList.getTokenBySymbol("WBTC", "arbitrum")!;
  });
  describe("quote", () => {
    (["ethereum", "arbitrum", "polygon"] as Network[]).forEach((network) => {
      it(`should return a paraswap quote for ${network}`, async () => {
        const usdcSymbol = network === "arbitrum" ? "USDC.e" : "USDC";
        const usdc = testTokenList.getTokenBySymbol(usdcSymbol, network)!;
        const usdt = testTokenList.getTokenBySymbol("USDT", network)!;
        const amountIn = ethers.utils.parseUnits("10", usdc.decimals);
        const quote = await Convert.getQuote({
          fromToken: usdc,
          toToken: usdt,
          receivingAccount: ethers.constants.AddressZero,
          sellAmount: amountIn,
          gasPrice: ethers.constants.One,
        });
        expect(quote.sellAmount).to.eq(amountIn.toString());
        expect(+quote.buyAmount).to.be.greaterThan(+quote.sellAmount * 0.95);
        // TODO uncomment this when we fix coingecko rate limiting failing tests
        // expect(quote.usdValues.valueOut).to.be.greaterThan(
        //   (quote.usdValues.valueIn ?? 0) * 0.95
        // );
        expect(quote.feeChargedBeforeConvert).to.be.false;
      });
    });
  });
  describe("swap", () => {
    it(`should return a paraswap swap`, async () => {
      const signer = new ethers.VoidSigner(
        "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
        ethers.provider
      );
      const tx = await Convert.getSwap({
        fromToken: eth,
        toToken: wbtc,
        gasPrice: ethers.utils.parseUnits("100", "gwei"), // very high gas price
        sellAmount: ethers.utils.parseUnits("1", eth.decimals),
        buyAmount: ethers.utils.parseUnits("1", wbtc.decimals),
        signer,
        slippage: 2,
      });

      expect(tx).to.have.property("to");
      expect(tx).to.have.property("value");
      expect(tx).to.have.property("data");
    });
  });
});
