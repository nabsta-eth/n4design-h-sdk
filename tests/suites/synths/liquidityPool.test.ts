import { expect } from "chai";
import {
  TradeAdapter,
  DepositResponse,
  LpConfigUpdateResponse,
  OpenAccountResponse,
  WithdrawResponse,
  TradeResponse,
  LpPairTradeabilityListener,
  TradeLpPriceFeed,
  LiquidityPoolSingle,
  TradePairId,
  AMOUNT_DECIMALS,
  PRICE_DECIMALS,
  TradeSize,
  LpListener,
  LpId,
  AccountListener,
  TradeSubscriptionId,
  ClearSystemParamArgs,
  SetSystemParamArgs,
  GrantAccountUserRoleResponse,
  RevokeAccountUserRoleResponse,
  TradeAccountRole,
} from "../../../src/components/trade";
import { Pair } from "../../../src/types/trade";
import { pairToString } from "../../../src/utils/general";
import { BigNumber, Bytes, Wallet, ethers } from "ethers";
import { defaultTradePair, underlyingToken } from "./utils";
import { parseUnits } from "ethers/lib/utils";

describe("Trade: liquidity pool", () => {
  it("should get trade price", () => {
    const pair = { baseSymbol: "ETH", quoteSymbol: "USD" };
    const ethUsd = defaultTradePair(pair);
    const adapter = new MockAdapter();
    const priceFeed = new MockPriceFeed();
    const lp = new LiquidityPoolSingle(
      "1",
      [ethUsd],
      underlyingToken,
      adapter,
      priceFeed
    );

    expect(() => lp.getPrice(pair)).to.throw();
    expect(() =>
      lp.getTradePrice({ pair, size: parseUnits("1", AMOUNT_DECIMALS) })
    ).to.throw();
    expect(() =>
      lp.getTradePrice({ pair, size: parseUnits("-1", AMOUNT_DECIMALS) })
    ).to.throw();
    expect(() =>
      lp.getTradePrice({ pair, size: parseUnits("0", AMOUNT_DECIMALS) })
    ).to.throw();
    priceFeed.prices["ETH/USD"] = BigNumber.from("0");
    const price1 = lp.getPrice(pair);
    expect(price1.index.eq(BigNumber.from("0"))).to.be.true;
    expect(price1.bestBid.eq(BigNumber.from("0"))).to.be.true;
    expect(price1.bestAsk.eq(BigNumber.from("0"))).to.be.true;

    expect(
      lp
        .getTradePrice({ pair, size: parseUnits("1", AMOUNT_DECIMALS) })
        .eq(parseUnits("0", PRICE_DECIMALS))
    ).to.be.true;
    expect(
      lp
        .getTradePrice({ pair, size: parseUnits("-1", AMOUNT_DECIMALS) })
        .eq(parseUnits("0", PRICE_DECIMALS))
    ).to.be.true;
    expect(
      lp
        .getTradePrice({ pair, size: parseUnits("0", AMOUNT_DECIMALS) })
        .eq(parseUnits("0", PRICE_DECIMALS))
    ).to.be.true;
    priceFeed.prices["ETH/USD"] = parseUnits("1900", PRICE_DECIMALS);
    const price2 = lp.getPrice(pair);
    expect(price2.index.eq(parseUnits("1900", PRICE_DECIMALS))).to.be.true;
    expect(price2.bestBid.eq(parseUnits("1900", PRICE_DECIMALS))).to.be.true;
    expect(price2.bestAsk.eq(parseUnits("1900", PRICE_DECIMALS))).to.be.true;

    expect(
      lp
        .getTradePrice({ pair, size: parseUnits("1", AMOUNT_DECIMALS) })
        .eq(parseUnits("1900", PRICE_DECIMALS))
    ).to.be.true;
    expect(
      lp
        .getTradePrice({ pair, size: parseUnits("-1", AMOUNT_DECIMALS) })
        .eq(parseUnits("1900", PRICE_DECIMALS))
    ).to.be.true;
    expect(
      lp
        .getTradePrice({ pair, size: parseUnits("0", AMOUNT_DECIMALS) })
        .eq(parseUnits("1900", PRICE_DECIMALS))
    ).to.be.true;
    ethUsd.spreadFraction = parseUnits("0.01", AMOUNT_DECIMALS);
    const price3 = lp.getPrice(pair);
    expect(price3.index.eq(parseUnits("1900", PRICE_DECIMALS))).to.be.true;
    expect(price3.bestBid.eq(parseUnits("1881", PRICE_DECIMALS))).to.be.true;
    expect(price3.bestAsk.eq(parseUnits("1919", PRICE_DECIMALS))).to.be.true;

    expect(
      lp
        .getTradePrice({ pair, size: parseUnits("1", AMOUNT_DECIMALS) })
        .eq(parseUnits("1919", PRICE_DECIMALS))
    ).to.be.true;
    expect(
      lp
        .getTradePrice({ pair, size: parseUnits("-1", AMOUNT_DECIMALS) })
        .eq(parseUnits("1881", PRICE_DECIMALS))
    ).to.be.true;
    expect(
      lp
        .getTradePrice({ pair, size: parseUnits("0", AMOUNT_DECIMALS) })
        .eq(parseUnits("1900", PRICE_DECIMALS))
    ).to.be.true;
  });

  it("should get trade pair", () => {
    const pair = { baseSymbol: "ETH", quoteSymbol: "USD" };
    const ethUsd = defaultTradePair(pair);
    const adapter = new MockAdapter();
    const priceFeed = new MockPriceFeed();
    const lp = new LiquidityPoolSingle(
      "1",
      [ethUsd],
      underlyingToken,
      adapter,
      priceFeed
    );

    expect(lp.getTradePair(pair)).to.deep.equal(ethUsd);
    expect(() =>
      lp.getTradePair({ baseSymbol: "BTC", quoteSymbol: "USD" })
    ).to.throw();
  });

  it("should trade", async () => {
    const pair = { baseSymbol: "ETH", quoteSymbol: "USD" };
    const ethUsd = defaultTradePair(pair);
    const adapter = new MockAdapter();
    const signer = Wallet.createRandom();
    const priceFeed = new MockPriceFeed();
    const lp = new LiquidityPoolSingle(
      "1",
      [ethUsd],
      underlyingToken,
      adapter,
      priceFeed
    );
    const result = await lp.trade({
      accountId: 1,
      pairId: new TradePairId(pair, "1"),
      size: TradeSize.fromLot(parseUnits("1", AMOUNT_DECIMALS)),
      signer,
      oldSize: parseUnits("0", AMOUNT_DECIMALS),
    });
    expect(result.fillPrice.eq(parseUnits("1900", PRICE_DECIMALS))).to.be.true;
    expect(result.marginFee.eq(parseUnits("1", AMOUNT_DECIMALS))).to.be.true;

    await lp.trade({
      accountId: 1,
      pairId: new TradePairId(pair, "1"),
      size: TradeSize.fromLot(parseUnits("-2", AMOUNT_DECIMALS)),
      signer,
      oldSize: parseUnits("1", AMOUNT_DECIMALS),
    });

    const oi = lp.getOpenInterest({ pair });
    expect(oi.short.eq(parseUnits("1", AMOUNT_DECIMALS))).to.be.true;
    expect(oi.long.eq("0")).to.be.true;
  });
});

class MockPriceFeed implements TradeLpPriceFeed {
  public prices: Record<string, BigNumber> = {};

  getLatestPrice(pair: Pair): BigNumber {
    const price = this.prices[pairToString(pair)];
    if (price === undefined) {
      throw new Error(`Price for pair ${pairToString(pair)} not found`);
    }
    return price;
  }

  subscribe(): number {
    return 0;
  }

  unsubscribe(): void {
    return;
  }
}

class MockAdapter implements TradeAdapter {
  getOwnerMessage(_signerAddress: string, _accountId: number): Promise<Bytes> {
    throw new Error("Method not implemented.");
  }
  grantAccountUserRole(
    _accountId: number,
    _user: string,
    _role: TradeAccountRole,
    _accountOwner: string,
    _signature: string
  ): Promise<GrantAccountUserRoleResponse> {
    throw new Error("Method not implemented.");
  }
  revokeAccountUserRole(
    _accountId: number,
    _user: string,
    _role: TradeAccountRole,
    _accountOwner: string,
    _signature: string
  ): Promise<RevokeAccountUserRoleResponse> {
    throw new Error("Method not implemented.");
  }
  setSystemParam(_args: SetSystemParamArgs): Promise<void> {
    throw new Error("Method not implemented.");
  }
  clearSystemParam(_args: ClearSystemParamArgs): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getLpConfig(): Promise<LpConfigUpdateResponse> {
    throw new Error("Method not implemented.");
  }
  waitForConnect(): Promise<void> {
    return Promise.resolve();
  }
  getOpenAccountMessage(): Promise<Bytes> {
    throw new Error("Method not implemented.");
  }
  getDepositMessage(): Promise<Bytes> {
    throw new Error("Method not implemented.");
  }
  getWithdrawMessage(): Promise<Bytes> {
    throw new Error("Method not implemented.");
  }
  async getTradeMessage(): Promise<Bytes> {
    return ethers.utils.toUtf8Bytes("message");
  }
  openAccount(): Promise<OpenAccountResponse> {
    throw new Error("Method not implemented.");
  }
  deposit(): Promise<DepositResponse> {
    throw new Error("Method not implemented.");
  }
  withdraw(): Promise<WithdrawResponse> {
    throw new Error("Method not implemented.");
  }

  async trade(
    _accountId: number,
    _liquidityPoolId: string,
    _size: TradeSize,
    pair: Pair,
    accountUser: string,
    signature: string
  ): Promise<TradeResponse> {
    return {
      result: {
        type: "event",
        content: {
          trade: {
            accountId: 1,
            accountUser,
            lpId: "1",
            marginFee: "1",
            pair: pairToString(pair),
            price: "1900",
            size: "1",
            timestampUnixMillis: 0,
            signature,
          },
        },
      },
    };
  }

  listenToLpPairTradeability(_listener: LpPairTradeabilityListener) {}

  requestHandshakeDataBroadcast(): void {}

  cancelSubscription(_subscriptionId: string): void {}

  subscribeToAccount(
    _accountId: number,
    _listener: AccountListener
  ): Promise<TradeSubscriptionId> {
    return Promise.resolve({} as unknown as TradeSubscriptionId);
  }

  subscribeToLp(
    _lpId: LpId,
    _listener: LpListener
  ): Promise<TradeSubscriptionId> {
    return Promise.resolve({} as unknown as TradeSubscriptionId);
  }
}
