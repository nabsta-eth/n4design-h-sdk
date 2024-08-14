import { expect } from "chai";
import { fetchBalancerLpTokenPrice } from "../../../src/components/prices/sources/balancer";
import { BALANCER_FXUSD_FOREX_POOL_ID } from "../../../src/config";

// TODO: fix this test -- causes 429 (too many requests) in GH actions/alchemy.
describe.skip("fetchBalancerLpTokenPrice", () => {
  it("should fetch balancer lp token price from pool id", async () => {
    const price = await fetchBalancerLpTokenPrice(BALANCER_FXUSD_FOREX_POOL_ID);
    expect(typeof price).to.equal("number");
    expect(price > 0).to.be.true;
  });
});
