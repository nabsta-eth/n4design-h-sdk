import { calculateUserApr } from "../../../src/utils/reward";
import { expect } from "chai";

describe("APR calculations", () => {
  it("should calculate the correct APR", () => {
    expect(calculateUserApr(2.5, 2.5, 0.5)).to.eq(0.5);
    expect(calculateUserApr(1, 1, 0.5)).to.eq(0.5);
    expect(calculateUserApr(1, 2.5, 0.5)).to.eq(0.2);
    expect(calculateUserApr(2.5, 1, 0.5)).to.eq(1.25);
  });
});
