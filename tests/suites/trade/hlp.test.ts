import config from "../../../src/config";
import { ethers } from "hardhat";
import { expect } from "chai";
import { parseEther } from "ethers/lib/utils";
import { setEthBalance } from "../../utils";
import { HandleTokenManager } from "../../../src";
import { hlp } from "../../../src/components/trade/platforms";
import { pairFromString } from "../../../src/utils/general";
import { ETH_ADDRESS } from "../../../src/components/trade/utils";

const signer = ethers.provider.getSigner(0);

// TODO: fix tests
xdescribe("trade: hlp", async () => {
  it("should get position", async () => {
    const position = await hlp.trade.getPosition({
      collateralAddress: config.fxTokenAddresses.fxUSD,
      pair: pairFromString("AUD/USD"),
      account: await signer.getAddress(),
      isLong: false,
      provider: signer.provider,
    });
    expect(position.isLong).to.be.false;
  });
  it("should approve increase position", async () => {
    await setEthBalance(await signer.getAddress(), parseEther("10000"));
    const manager = new HandleTokenManager();
    const weth = manager.getTokenBySymbol("WETH", "arbitrum").address;
    await hlp.trade.approveIncreasePosition({
      collateralAddress: weth,
      collateralDelta: parseEther("2.5"),
      signer,
      pair: pairFromString("WETH/USD"),
    });
  });
  it("should increase position", async () => {
    // ETH long
    const tx = await hlp.trade.increasePosition({
      collateralAddress: ETH_ADDRESS,
      pair: pairFromString("ETH/USD"),
      isLong: true,
      indexDelta: parseEther("2.5"),
      collateralDelta: parseEther("0.25"),
      signer,
      receiver: await signer.getAddress(),
      slippagePercent: 1,
    });
    const receipt = await tx.wait(1);
    expect(receipt.status).to.equal(1);
  });
  it("should decrease position", async () => {
    // close ETH long from last test
    const tx = await hlp.trade.decreasePosition({
      collateralAddress: ETH_ADDRESS,
      pair: pairFromString("ETH/USD"),
      isLong: true,
      indexDelta: parseEther("2.5"),
      collateralDelta: parseEther("0.25"),
      signer,
      receiver: await signer.getAddress(),
      slippagePercent: 0,
    });
    const receipt = await tx.wait(1);
    expect(receipt.status).to.equal(1);
  });
});
