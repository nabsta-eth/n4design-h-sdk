import { ethers, network } from "hardhat";
import { expect } from "chai";
import { eurs } from "../test-tokens";
import { config, ConvertSDK, TokenInfo } from "../../../../src";
import { testTokenList } from "../../../mock-data/token-config";
import {
  ArbBridgedErc20__factory,
  HPSM2__factory,
} from "../../../../src/contracts";
import { describeForNonTestingWeekendOnly } from "../../../utils";

const signer = ethers.provider.getSigner(0);

let usdc: TokenInfo;
let usdt: TokenInfo;

const mockPsmDeposit = async () => {
  // This address has authority to mint bridge tokens. Used to mint USDT.
  const arbitrumL2Gateway = "0x096760f208390250649e3e8763348e783aef5562";
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [arbitrumL2Gateway],
  });
  const arbBridgeSigner = await ethers.provider.getSigner(arbitrumL2Gateway);
  await network.provider.request({
    method: "hardhat_setBalance",
    params: [arbitrumL2Gateway, "0xde0b6b3a7640000"],
  });
  const usdtContract = ArbBridgedErc20__factory.connect(
    usdt.address,
    arbBridgeSigner
  );
  await usdtContract.bridgeMint(
    await signer.getAddress(),
    ethers.utils.parseUnits("5000", 6)
  );
  const psm = HPSM2__factory.connect(
    config.protocol.arbitrum!.protocol.hpsm,
    signer
  );
  await usdtContract
    .connect(signer)
    .approve(psm.address, ethers.constants.MaxUint256);
  await psm.deposit(
    config.fxTokenAddresses.fxUSD,
    usdt.address,
    ethers.utils.parseUnits("1000", 6)
  );
  // Also set allowance to router.
  await usdtContract
    .connect(signer)
    .approve(
      config.protocol.arbitrum.protocol.routers.routerHpsmHlpCurve,
      ethers.constants.MaxUint256
    );
};

describeForNonTestingWeekendOnly()("psmToHlpToCurve", () => {
  before(async () => {
    usdt = testTokenList.getTokenBySymbol("USDT", "arbitrum")!;
    usdc = testTokenList.getTokenBySymbol("USDC.e", "arbitrum")!;
    await mockPsmDeposit();
  });
  describe("quote", () => {
    it("should get a quote from a pegged token to a curve token", async () => {
      // usdt and usdc has 6 decimals
      const sellAmount = ethers.utils.parseUnits("5", 6);
      const quote = await ConvertSDK.getQuote({
        fromToken: usdt,
        toToken: usdc,
        receivingAccount: ethers.constants.AddressZero,
        sellAmount,
        gasPrice: ethers.constants.One,
        provider: signer.provider,
      });
      // won't overflow as units are 1e6
      const expectedBuyAmount = +sellAmount; // both tokens have the same decimals, and are usd stablecoins
      const tolerance = 0.02; // stablecoin swap won't have more than 2% variance

      const isBuyAmountWithinTolerance =
        +quote.buyAmount <= expectedBuyAmount * (1 + tolerance) &&
        +quote.buyAmount >= expectedBuyAmount * (1 - tolerance);

      expect(quote.allowanceTarget[0].target).to.eq(
        config.protocol.arbitrum.protocol.routers.routerHpsmHlpCurve
      );
      expect(quote.allowanceTarget.length).to.eq(1);
      expect(quote.sellAmount.toString()).to.eq(sellAmount.toString());
      expect(isBuyAmountWithinTolerance).to.be.true;
    });
    it("should get a quote from a pegged token to a different currency curve token", async () => {
      // usdt and usdc has 6 decimals
      const sellAmount = ethers.utils.parseUnits("5", 6);
      const quote = await ConvertSDK.getQuote({
        fromToken: usdt,
        toToken: eurs,
        receivingAccount: ethers.constants.AddressZero,
        sellAmount,
        gasPrice: ethers.constants.One,
        provider: signer.provider,
      });

      expect(quote.allowanceTarget[0].target).to.eq(
        config.protocol.arbitrum.protocol.routers.routerHpsmHlpCurve
      );
      expect(quote.allowanceTarget.length).to.eq(1);
      expect(quote.sellAmount.toString()).to.eq(sellAmount.toString());
      expect(quote).to.have.property("buyAmount");
      expect(typeof quote.buyAmount).to.eq("string");
    });
  });
  describe("swap", () => {
    it("should get a transaction from a pegged token to a curve token", async () => {
      // usdt has 6 decimals
      const sellAmount = ethers.utils.parseUnits("5", 6);
      // sample hlp methods havea 1:1 ratio of token prices
      const expectedBuyAmount = ethers.utils.parseUnits("5", 18);
      const tx = await ConvertSDK.getSwap({
        fromToken: usdt,
        toToken: usdc,
        sellAmount,
        gasPrice: ethers.constants.One,
        signer,
        buyAmount: expectedBuyAmount,
        slippage: 0.5,
      });
      expect(tx.to).to.eq(
        config.protocol.arbitrum.protocol.routers.routerHpsmHlpCurve
      );
    });
    it("should get a transaction from a pegged token to a different currency curve token", async () => {
      // usdt has 6 decimals
      const sellAmount = ethers.utils.parseUnits("5", 6);
      // sample hlp methods havea 1:1 ratio of token prices
      const expectedBuyAmount = ethers.utils.parseUnits("5", 18);
      const tx = await ConvertSDK.getSwap({
        fromToken: usdt,
        toToken: eurs,
        sellAmount,
        gasPrice: ethers.constants.One,
        signer,
        buyAmount: expectedBuyAmount,
        slippage: 0.5,
      });
      expect(tx.to).to.eq(
        config.protocol.arbitrum.protocol.routers.routerHpsmHlpCurve
      );
    });
  });
});
