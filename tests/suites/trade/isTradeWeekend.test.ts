import { isTradeWeekend } from "../../../src/utils/trade";
import { expect } from "chai";

describe("isTradeWeekend", () => {
  // EST
  it("should return true for a weekend", () => {
    // Friday 5:01pm EST
    const date = new Date(1704492060 * 1000);
    expect(isTradeWeekend(date)).to.be.true;
    // Sunday 4:59pm EST
    const date2 = new Date(1704059940 * 1000);
    expect(isTradeWeekend(date2)).to.be.true;
  });
  it("should return false for a weekday", () => {
    // Friday 4:59pm EST
    const date = new Date(1704491940 * 1000);
    expect(isTradeWeekend(date)).to.be.false;
    // Sunday 5:01pm EST
    const date2 = new Date(1704060060 * 1000);
    expect(isTradeWeekend(date2)).to.be.false;
  });
  // EDT
  it("should return true for a weekend", () => {
    // Friday 5:01pm EDT
    const date = new Date(1688158860 * 1000);
    expect(isTradeWeekend(date)).to.be.true;
    // Sunday 4:59pm EDT
    const date2 = new Date(1687726740 * 1000);
    expect(isTradeWeekend(date2)).to.be.true;
  });
  it("should return false for a weekday", () => {
    // Friday 4:59pm EDT
    const date = new Date(1688158740 * 1000);
    expect(isTradeWeekend(date)).to.be.false;
    // Sunday 5:01pm EDT
    const date2 = new Date(1687726860 * 1000);
    expect(isTradeWeekend(date2)).to.be.false;
  });
});
