import { fetchInstruments } from "../../../src/components/trade/instruments";
import { expect } from "chai";
import { CURRENT_INSTRUMENT_SCHEMA_VERSION } from "../../../src/config";
import { PRICE_UNIT } from "../../../src/components/trade/reader";

describe.only("instruments", () => {
  it("should correctly fetch & parse instruments, validate that the first instrument is 'ETH/USD/crypto/ethereum' and that the version is correct", async () => {
    const instruments = await fetchInstruments("arbitrum");
    console.log("[instruments]", instruments);
    expect(instruments[0].version).to.equal(CURRENT_INSTRUMENT_SCHEMA_VERSION);
    expect(instruments[0].pair).to.equal("ETH/USD");
    expect(instruments[0].marketType).to.equal("crypto");
    expect(instruments[0].unitName).to.equal("ethereum");
    expect(instruments[0].getDescription()).to.equal("ethereum");
    expect(instruments[0].getUnitName(true)).to.equal("ethereum");
    expect(instruments[0].getDisplayDecimals(PRICE_UNIT.mul(100))).to.equal(2);
    expect(
      instruments[0].getDisplayDecimals(PRICE_UNIT.mul(100), true)
    ).to.equal(2);
  });
});
