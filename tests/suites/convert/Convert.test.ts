import { expect } from "chai";
import { ethers } from "hardhat";
import Convert, { getPriceImpact } from "../../../src/components/convert";
import { eth, fxAud, fxUsd, usdt, weth } from "./test-tokens";

const signer = ethers.provider.getSigner(0);

describe("Convert class", () => {
  describe("quote", () => {
    it("Should throw if signer is on different network than tokens", async () => {
      try {
        await Convert.getQuote({
          fromToken: { ...fxAud, chainId: 1 },
          toToken: { ...fxUsd, chainId: 1 },
          receivingAccount: await signer.getAddress(),
          gasPrice: ethers.utils.parseUnits("1", "gwei"),
          sellAmount: ethers.utils.parseUnits("1", fxAud.decimals),
          provider: signer.provider,
        });
        fail("Should throw");
      } catch (e: any) {
        expect(e.message).to.eq(
          "Signer/Provider is on a different network than the tokens"
        );
      }
    });
    it("Should throw if tokens are on different networks", async () => {
      try {
        await Convert.getQuote({
          fromToken: fxAud,
          toToken: { ...fxUsd, chainId: 1 },
          receivingAccount: await signer.getAddress(),
          gasPrice: ethers.utils.parseUnits("1", "gwei"),
          sellAmount: ethers.utils.parseUnits("1", fxAud.decimals),
          provider: signer.provider,
        });
        fail("Should throw");
      } catch (e: any) {
        expect(e.message).to.include("different chains");
      }
    });
    it("Should return usd values for token pairs", async () => {
      const quote1 = await Convert.getQuote({
        fromToken: weth,
        toToken: eth,
        receivingAccount: await signer.getAddress(),
        gasPrice: ethers.utils.parseUnits("1", "gwei"),
        sellAmount: ethers.utils.parseUnits("1", fxAud.decimals),
        provider: signer.provider,
      });
      expect(quote1.usdValues.valueOut).to.eq(quote1.usdValues.valueIn);

      // both are liquid markets, so expected price impact is low
      const quote2 = await Convert.getQuote({
        fromToken: weth,
        toToken: usdt,
        receivingAccount: await signer.getAddress(),
        gasPrice: ethers.utils.parseUnits("1", "gwei"),
        sellAmount: ethers.utils.parseUnits("1", 18),
        provider: signer.provider,
      });
      expect(
        getPriceImpact(quote2.usdValues.valueIn!, quote2.usdValues.valueOut!)
      ).to.be.lt(0.05);
    });
  });
  describe("swap", () => {
    it("Should throw if signer is on different network than tokens", async () => {
      try {
        await Convert.getSwap({
          fromToken: { ...fxAud, chainId: 1 },
          toToken: { ...fxUsd, chainId: 1 },
          gasPrice: ethers.utils.parseUnits("1", "gwei"),
          sellAmount: ethers.utils.parseUnits("1", fxAud.decimals),
          buyAmount: ethers.utils.parseUnits("1", fxUsd.decimals),
          signer: signer,
          slippage: 0.5,
        });
        fail("Should throw");
      } catch (e: any) {
        expect(e.message).to.eq(
          "Signer/Provider is on a different network than the tokens"
        );
      }
    });
    it("Should throw if tokens are on different networks", async () => {
      try {
        await Convert.getSwap({
          fromToken: { ...fxAud, chainId: 1 },
          toToken: fxUsd,
          gasPrice: ethers.utils.parseUnits("1", "gwei"),
          sellAmount: ethers.utils.parseUnits("1", fxAud.decimals),
          buyAmount: ethers.utils.parseUnits("1", fxUsd.decimals),
          signer: signer,
          slippage: 0.5,
        });
        fail("Should throw");
      } catch (e: any) {
        expect(e.message).to.include("different chains");
      }
    });
  });
});
