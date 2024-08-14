import { expect } from "chai";
import { BigNumber, ethers } from "ethers";
import { getLiquidationPrice } from "../../../src/components/trade/platforms/hlp/internals";
import { pairFromString } from "../../../src/utils/general";
import { PositionHlp } from "../../../src/components/trade/platforms/hlp/internals/tokens";
import { hlp } from "../../../src/components/trade/platforms";
import config from "../../../src/config";

const ZERO_POSITION = (
  collateralToken = ethers.constants.AddressZero
): PositionHlp => ({
  averagePrice: ethers.constants.Zero,
  collateral: ethers.constants.Zero,
  collateralAddress: collateralToken,
  hasRealisedProfit: false,
  isLong: false,
  lastIncreasedTime: ethers.constants.Zero,
  realisedPnL: ethers.constants.Zero,
  size: ethers.constants.Zero,
  reserveAmount: ethers.constants.Zero,
  pair: pairFromString("AUD/USD"),
  delta: ethers.constants.Zero,
  leverage: ethers.constants.Zero,
  hasProfit: false,
  fundingRatePpm: ethers.constants.Zero,
  fundingFee: ethers.constants.Zero,
  liquidationPrice: ethers.constants.Zero,
  uid: "",
  platformName: "test",
  internals: {
    entryFundingRate: ethers.constants.Zero,
    cumulativeFundingRate: ethers.constants.Zero,
  },
});

const EXISTING_POSITION = () => {
  const position = ZERO_POSITION();
  position.size = ethers.utils.parseUnits("50", 30);
  position.collateral = ethers.utils.parseUnits("25", 30);
  position.averagePrice = ethers.utils.parseUnits("1", 30);
  position.fundingFee = ethers.constants.Zero;
  return position;
};

const bn = BigNumber.from;

describe.skip("getLiquidationPrice", () => {
  describe("no initial position", () => {
    before(async () => {
      // Initialise trade pairs.
      config.sdk.shouldUseCacheServer = false;
      await hlp.internals.fetchTradePairsHlp();
    });
    it("can calculate liquidation price for a long position", async () => {
      const position = ZERO_POSITION();
      position.isLong = true;
      position.averagePrice = bn("0x8c2bb4717cfe748e2874c0000000");
      const delta = {
        collateral: bn("0x8c2bb4717cfe748e2874c0000000"),
        size: bn("0x014f9ab2464536f038b6a8d0f2e000"),
      };
      const price = getLiquidationPrice({
        ...position,
        collateral: position.collateral.add(delta.collateral),
        size: position.size.add(delta.size),
        delta: ethers.constants.Zero,
        hasProfit: false,
      });
      expect(ethers.utils.formatUnits(price, 30)).to.equal(
        "1712.433666666666666382475964222223"
      );
    });
    it("can calculate liquidation price for a short position", async () => {
      const position = ZERO_POSITION();
      position.averagePrice = bn("0x8bfa7add196bc82c889660000000");
      const delta = {
        collateral: bn("0x04ee2d6d415b85acef8100000000"),
        size: bn("0x0bcdf91fbc8f1fc0d6f3bef91800"),
      };
      const price = getLiquidationPrice({
        ...position,
        collateral: position.collateral.add(delta.collateral),
        size: position.size.add(delta.size),
        delta: ethers.constants.Zero,
        hasProfit: false,
      });
      expect(ethers.utils.formatUnits(price, 30)).to.equal(
        "3968.115433333333340091773551376522"
      );
    });
  });
  describe("initial position", () => {
    it("can calculate liquidation price for a long position", async () => {
      const position = EXISTING_POSITION();
      position.isLong = true;
      const price = getLiquidationPrice({
        ...position,
        delta: ethers.constants.Zero,
        hasProfit: false,
      });
      expect(ethers.utils.formatUnits(price, 30)).to.equal("0.541");
    });
    it("can calculate liquidation price for a short position", async () => {
      const position = EXISTING_POSITION();
      const price = getLiquidationPrice({
        ...position,
        delta: ethers.constants.Zero,
        hasProfit: false,
      });
      expect(ethers.utils.formatUnits(price, 30)).to.equal("1.459");
    });
  });
  describe("inital position and delta position", () => {
    describe("long", () => {
      it("is correct when subtracting position size and collateral", async () => {
        const position = EXISTING_POSITION();
        position.isLong = true;
        const delta = {
          size: ethers.utils.parseUnits("25", 30),
          collateral: ethers.utils.parseUnits("10", 30),
        };
        const price = getLiquidationPrice({
          ...position,
          delta: ethers.constants.Zero,
          collateral: position.collateral.add(delta.collateral),
          size: position.size.add(delta.size),
          hasProfit: false,
        });
        expect(ethers.utils.formatUnits(price, 30)).to.equal("0.482");
      });
      it("is correct when adding position size and collateral", async () => {
        const position = EXISTING_POSITION();
        position.isLong = true;
        const delta = {
          size: ethers.utils.parseUnits("25", 30),
          collateral: ethers.utils.parseUnits("10", 30),
        };
        const price = getLiquidationPrice({
          ...position,
          collateral: position.collateral.add(delta.collateral),
          size: position.size.add(delta.size),
          delta: ethers.constants.Zero,
          hasProfit: false,
        });
        expect(ethers.utils.formatUnits(price, 30)).to.equal(
          "0.560666666666666666666666666667"
        );
      });
    });
    describe("short", () => {
      it("is correct when subtracting position size and collateral", async () => {
        const position = EXISTING_POSITION();
        const delta = {
          size: ethers.utils.parseUnits("25", 30),
          collateral: ethers.utils.parseUnits("10", 30),
        };
        const price = getLiquidationPrice({
          ...position,
          collateral: position.collateral.add(delta.collateral),
          size: position.size.add(delta.size),
          delta: ethers.constants.Zero,
          hasProfit: false,
        });
        expect(ethers.utils.formatUnits(price, 30)).to.equal("1.518");
      });
      it("is correct when adding position size and collateral", async () => {
        const position = EXISTING_POSITION();
        const delta = {
          size: ethers.utils.parseUnits("25", 30),
          collateral: ethers.utils.parseUnits("10", 30),
        };
        const price = getLiquidationPrice({
          ...position,
          collateral: position.collateral.add(delta.collateral),
          size: position.size.add(delta.size),
          delta: ethers.constants.Zero,
          hasProfit: false,
        });
        expect(ethers.utils.formatUnits(price, 30)).to.equal(
          "1.439333333333333333333333333333"
        );
      });
    });
  });
});
