import { TradeReaderSubgraph } from "../../../src/components/trade/reader";
import { expect } from "chai";

describe("Trade: reader subgraph", () => {
  const reader = new TradeReaderSubgraph(
    "https://api.studio.thegraph.com/query/49615/handle-fi-synths-testnet/version/latest"
  );

  it("should read trade history", async () => {
    const history = await reader.getTradeHistory(1, 10, 0);
    expect(Array.isArray(history)).to.be.true;
  });
  it("should read deposit/withdraw history", async () => {
    const history = await reader.getDepositWithdrawHistory(1, 10, 0);
    expect(Array.isArray(history.accountAssetDeposits)).to.be.true;
    expect(Array.isArray(history.accountAssetWithdrawals)).to.be.true;
  });
  it("should read periodic fee history", async () => {
    const history = await reader.getPeriodicFeeHistory(1, 10, 0);
    expect(Array.isArray(history)).to.be.true;
  });
  it("should read account", async () => {
    const account = await reader.getAccount(1);
    expect(account).to.not.be.null;
  });
});
