import { expect } from "chai";
import { ethers } from "ethers";
import { calculateCollateralAsEth } from "../../../src/utils/vault";
import {
  createMockCollaterals,
  createMockVaultDataFromMockCollaterals,
} from "../../mock-data/mock-data";

describe("calculateTotalCollateralBalanceAsEth", () => {
  it("It calculates the correct value with no collateral deposited", async () => {
    const collaterals = createMockCollaterals([
      { price: ethers.constants.WeiPerEther.div(2) },
    ]);

    const vaultData = createMockVaultDataFromMockCollaterals(
      ethers.constants.Zero,
      collaterals,
      [ethers.constants.Zero]
    );

    expect(
      calculateCollateralAsEth(vaultData, collaterals).eq(ethers.constants.Zero)
    ).to.eql(true);
  });

  it("It calculates the correct value with one collateral", async () => {
    const collaterals = createMockCollaterals([
      { price: ethers.constants.WeiPerEther.div(2) },
    ]);

    const vaultData = createMockVaultDataFromMockCollaterals(
      ethers.constants.Zero,
      collaterals,
      [ethers.constants.WeiPerEther.mul(2)]
    );

    expect(
      calculateCollateralAsEth(vaultData, collaterals).eq(
        ethers.constants.WeiPerEther
      )
    ).to.eql(true);
  });

  xit("It calculates the correct value with two collaterals", async () => {
    // TODO figure out why this test randomly fails. Currently it is skipped

    const collaterals = createMockCollaterals([
      { price: ethers.constants.WeiPerEther.div(2) },
      { price: ethers.constants.WeiPerEther },
    ]);

    const vaultData = createMockVaultDataFromMockCollaterals(
      ethers.constants.Zero,
      collaterals,
      [ethers.constants.WeiPerEther.mul(4), ethers.constants.WeiPerEther.mul(2)]
    );

    expect(
      calculateCollateralAsEth(vaultData, collaterals).eq(
        ethers.constants.WeiPerEther.mul(4)
      )
    ).to.eql(true);
  });
});
