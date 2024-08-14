import { expect } from "chai";
import { isFxTokenSymbol } from "../../../src/utils/fxToken";

describe("isFxTokenSymbol", () => {
  it("should accept fxAUD", () => expect(isFxTokenSymbol("fxAUD")).to.be.true);
  it("should accept fxUSD", () => expect(isFxTokenSymbol("fxUSD")).to.be.true);
  it("should accept fxAAA", () => expect(isFxTokenSymbol("fxAAA")).to.be.true);
  it("should not accept fxaud", () =>
    expect(isFxTokenSymbol("fxaud")).to.be.false);
  it("should not accept fxfxf", () =>
    expect(isFxTokenSymbol("fxfxf")).to.be.false);
  it("should not accept FxAud", () =>
    expect(isFxTokenSymbol("FxAud")).to.be.false);
  it("should not accept fxAUd", () =>
    expect(isFxTokenSymbol("fxAUd")).to.be.false);
  it("should not accept fxEURS", () =>
    expect(isFxTokenSymbol("fxEURS")).to.be.false);
});
