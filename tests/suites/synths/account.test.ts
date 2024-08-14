// @ts-nocheck
import * as trade from "../../../src/components/trade";
import { MockPriceFeed, defaultTradePair, underlyingToken } from "./utils";
import { expect } from "chai";
import { pairToString } from "../../../src/utils/general";
import { BigNumber, Bytes, Wallet, ethers } from "ethers";
import { Pair } from "../../../src/types/trade";
import { parseUnits } from "ethers/lib/utils";
import {
  AMOUNT_DECIMALS,
  formatAmount,
  formatPrice,
  parseAmount,
  parsePrice,
  PRICE_DECIMALS,
  ReaderPeriodicPositionFeeType,
  ReaderTrade,
  ReaderTradeType,
} from "../../../src/components/trade/reader";
import {
  AccountListener,
  LpId,
  LpListener,
  LpPairTradeabilityListener,
  TradeAdapterWebsocket,
  TradeSize,
  TradeSubscriptionId,
} from "../../../src/components/trade";
import { Position } from "../../../src/components/trade/position";
import config from "../../../src/config";

describe("Trade: account", () => {
  it("should be able to get the equity", () => {
    const tradePair = defaultTradePair(
      { baseSymbol: "ETH", quoteSymbol: "USD" },
      "1"
    );
    const adapter = new MockAdapter();
    const priceFeed = new MockPriceFeed();
    const protocol = new trade.TradeProtocol([
      new trade.LiquidityPoolSingle(
        "1",
        [tradePair],
        underlyingToken,
        adapter,
        priceFeed
      ),
    ]);
    let account = new trade.TradeAccount(
      1,
      BigNumber.from("0"),
      [],
      protocol,
      adapter,
      {} as trade.reader.TradeReader
    );
    expect(account.getEquity().eq("0")).to.be.true;

    account = new trade.TradeAccount(
      1,
      parseUnits("100", AMOUNT_DECIMALS),
      [],
      protocol,
      adapter,
      {} as trade.reader.TradeReader
    );
    expect(account.getEquity().eq(parseUnits("100", AMOUNT_DECIMALS))).to.be
      .true;
    expect(account.getRealisedEquity().eq(parseUnits("100", AMOUNT_DECIMALS)))
      .to.be.true;
    const positions = [
      new Position(
        tradePair.id,
        parseUnits("10", AMOUNT_DECIMALS),
        parseUnits("1000", PRICE_DECIMALS)
      ),
    ];
    account = new trade.TradeAccount(
      1,
      parseUnits("100", AMOUNT_DECIMALS),
      positions,
      protocol,
      adapter,
      {} as trade.reader.TradeReader
    );
    priceFeed.prices[pairToString(tradePair.id.pair)] = parseUnits(
      "1100",
      PRICE_DECIMALS
    );
    expect(account.getEquity().eq(parseUnits("1100", AMOUNT_DECIMALS))).to.be
      .true;
    expect(account.getRealisedEquity().eq(parseUnits("100", AMOUNT_DECIMALS)))
      .to.be.true;
    expect(
      account.getUnrealisedEquity().eq(parseUnits("1000", AMOUNT_DECIMALS))
    ).to.be.true;
  });

  it("should deposit", async () => {
    const adapter = new MockAdapter();
    const protocol = new trade.TradeProtocol([]);
    const account = new trade.TradeAccount(
      1,
      BigNumber.from("0"),
      [],
      protocol,
      adapter,
      {} as trade.reader.TradeReader
    );
    // TODO: test account onUpdate trigger depending on:
    // https://github.com/handle-fi/handle-sdk/issues/533
    // if so, also test that the realised account equity is updated.
    await account.deposit({
      amount: parseUnits("1", underlyingToken.decimals),
      signer: Wallet.createRandom(),
      token: underlyingToken,
    });
  });

  it("should withdraw", async () => {
    const adapter = new MockAdapter();
    const protocol = new trade.TradeProtocol([]);
    const account = new trade.TradeAccount(
      1,
      parseUnits("2", AMOUNT_DECIMALS),
      [],
      protocol,
      adapter,
      {} as trade.reader.TradeReader
    );
    // TODO: test account onUpdate trigger depending on:
    // https://github.com/handle-fi/handle-sdk/issues/533
    // if so, also test that the realised account equity is updated.
    await account.withdraw({
      amount: BigNumber.from("10").pow(underlyingToken.decimals),
      signer: Wallet.createRandom(),
      receiver: Wallet.createRandom().address,
      token: underlyingToken,
    });
  });

  it("should adjust realized equity and positions on trade", async () => {
    const tradePair = defaultTradePair(
      { baseSymbol: "ETH", quoteSymbol: "USD" },
      "1"
    );
    tradePair.marginFeeFraction = parseUnits("0.01", AMOUNT_DECIMALS);
    const adapter = new MockAdapter();
    const priceFeed = new MockPriceFeed();
    const protocol = new trade.TradeProtocol([
      new trade.LiquidityPoolSingle(
        "1",
        [tradePair],
        underlyingToken,
        adapter,
        priceFeed
      ),
    ]);
    let positions = [
      new Position(
        tradePair.id,
        parseUnits("10", AMOUNT_DECIMALS),
        parseUnits("1000", PRICE_DECIMALS)
      ),
    ];
    const account = new trade.TradeAccount(
      1,
      parseUnits("100", AMOUNT_DECIMALS),
      positions,
      protocol,
      adapter,
      {} as trade.reader.TradeReader
    );
    priceFeed.prices[pairToString(tradePair.id.pair)] = parseUnits(
      "1100",
      PRICE_DECIMALS
    );
    expect(
      account.getUnrealisedEquity().eq(parseUnits("1000", AMOUNT_DECIMALS))
    ).to.be.true;
    expect(account.getEquity().eq(parseUnits("1100", AMOUNT_DECIMALS))).to.be
      .true;
    // TODO: test account onUpdate trigger depending on:
    // https://github.com/handle-fi/handle-sdk/issues/533
    // if so, also test that the account properties are updated.
    await account.trade({
      size: TradeSize.fromLot(parseAmount("1")),
      pairId: tradePair.id,
      signer: Wallet.createRandom(),
    });
  });

  it("should adjust realized equity and positions on trade of a price impacted asset", async () => {
    const tradePair = defaultTradePair(
      { baseSymbol: "ETH", quoteSymbol: "USD" },
      "1"
    );
    tradePair.marginFeeFraction = parseUnits("0.01", AMOUNT_DECIMALS);
    tradePair.usePriceImpact = true;
    tradePair.priceImpactFraction = parseUnits("0.00003", AMOUNT_DECIMALS);
    tradePair.skewScale = parseUnits("1000000", AMOUNT_DECIMALS);
    const adapter = new MockAdapter();
    const priceFeed = new MockPriceFeed();
    const protocol = new trade.TradeProtocol([
      new trade.LiquidityPoolSingle(
        "1",
        [tradePair],
        underlyingToken,
        adapter,
        priceFeed
      ),
    ]);
    let positions = [
      new Position(
        tradePair.id,
        parseUnits("10", AMOUNT_DECIMALS),
        parseUnits("1000", PRICE_DECIMALS)
      ),
    ];
    const account = new trade.TradeAccount(
      1,
      parseUnits("100", AMOUNT_DECIMALS),
      positions,
      protocol,
      adapter,
      {} as trade.reader.TradeReader
    );
    priceFeed.prices[pairToString(tradePair.id.pair)] = parseUnits(
      "1100",
      PRICE_DECIMALS
    );
    expect(
      account
        .getUnrealisedEquity()
        .eq(parseUnits("1000.3850016", AMOUNT_DECIMALS))
    ).to.be.true;
    expect(account.getEquity().eq(parseUnits("1100.3850016", AMOUNT_DECIMALS)))
      .to.be.true;
    // TODO: test account onUpdate trigger depending on:
    // https://github.com/handle-fi/handle-sdk/issues/533
    // if so, also test that the account properties are updated.
    await account.trade({
      size: TradeSize.fromLot(parseAmount("1")),
      pairId: tradePair.id,
      signer: Wallet.createRandom(),
    });
  });

  it("should parse trade history", async () => {
    const defaultValues = {
      account: { id: "1" },
      liquidityPool: { id: "1" },
      marginFee: "0",
      pair: "ETH/USD",
      size: "1",
      realizedEquity: "1",
      tradeType: ReaderTradeType.Trade,
      didOpenPosition: false,
      didClosePosition: false,
    };
    const rawTradeHistory: ReaderTrade[] = [
      {
        id: "1",
        price: "1000",
        transaction: { timestamp: "3", hash: "0x" },
        ...defaultValues,
      },
      {
        id: "2",
        price: "1100",
        transaction: { timestamp: "2", hash: "0x" },
        ...defaultValues,
      },
      {
        price: "900",
        transaction: { timestamp: "1", hash: "0x" },
        ...defaultValues,
      },
    ];
    const reader = {
      getTradeHistory: async () => rawTradeHistory,
    } as unknown as trade.reader.TradeReader;
    const account = new trade.TradeAccount(
      1,
      BigNumber.from("0"),
      [],
      new trade.TradeProtocol([]),
      new MockAdapter(),
      reader
    );
    const history = await account.getTradeHistory({});
    expect(history.length).to.equal(3);
    expect(history[0].timestamp).to.equal(3);
    expect(history[1].timestamp).to.equal(2);
    expect(history[2].timestamp).to.equal(1);
  });

  it("should parse periodic fee history", async () => {
    const reader = {
      getPeriodicFeeHistory: async (): Promise<
        trade.reader.ReaderPeriodicPositionFeeCollection[]
      > => [
        {
          id: "1",
          account: { id: "1" },
          liquidityPool: { id: "1" },
          pair: "ETH/USD",
          amount: "1",
          periodicPositionFeeType: ReaderPeriodicPositionFeeType.Borrow,
          transaction: { timestamp: "3" },
        },
      ],
    } as unknown as trade.reader.TradeReader;
    const account = new trade.TradeAccount(
      1,
      BigNumber.from("0"),
      [],
      new trade.TradeProtocol([]),
      new MockAdapter(),
      reader
    );
    const history = await account.getPeriodicFeeHistory({});
    expect(history.length).to.equal(1);
  });

  it("should parse deposit withdraw history", async () => {
    const reader = {
      getDepositWithdrawHistory:
        async (): Promise<trade.reader.ReaderDepositWithdrawHistory> => ({
          accountAssetDeposits: [
            {
              id: "1",
              account: { id: "1" },
              depositorAddress: "0x123",
              assetAddress: "0x456",
              amount: "1",
              transaction: { timestamp: "5", hash: "0x" },
            },
            {
              id: "1",
              account: { id: "1" },
              depositorAddress: "0x123",
              assetAddress: "0x456",
              amount: "1",
              transaction: { timestamp: "3", hash: "0x" },
            },
          ],
          accountAssetWithdrawals: [
            {
              id: "2",
              account: { id: "1" },
              accountUser: "0x123",
              assetAddress: "0x456",
              amount: "1",
              transaction: { timestamp: "4", hash: "0x" },
            },
          ],
        }),
    };
    const account = new trade.TradeAccount(
      1,
      BigNumber.from("0"),
      [],
      new trade.TradeProtocol([]),
      new MockAdapter(),
      reader as unknown as trade.reader.TradeReader
    );
    const history = await account.getDepositWithdrawHistory({});
    expect(history.length).to.equal(3);
    expect(history[0].timestamp).to.equal(5);
    expect(history[0].amount.toNumber()).to.equal(1);
    expect(history[1].timestamp).to.equal(4);
    expect(history[1].amount.toNumber()).to.equal(-1);
    expect(history[2].timestamp).to.equal(3);
    expect(history[2].amount.toNumber()).to.equal(1);
  });

  it("should re-subscribe after reconnection", async () => {
    const adapter = await MockTradeAdapterWebsocket.create();
    // Simulate the original subscription.
    await adapter.subscribeToAccount(1, () => {});
    await adapter.subscribeToAccount(2, () => {});
    await adapter.subscribeToAccount(3, () => {});
    // Simulate a disconnection and reconnection.
    await adapter.reconnect();
    const resubscriptionResults = adapter.resubscriptionResults;
    expect(resubscriptionResults.length).to.be.greaterThan(0);
  });
});

class MockTradeAdapterWebsocket extends TradeAdapterWebsocket {
  public static async create(): Promise<MockTradeAdapterWebsocket> {
    const testnetProtocol = config.protocol["arbitrum-sepolia"];
    const adapter = new MockTradeAdapterWebsocket(
      new ethers.providers.JsonRpcProvider(),
      {
        timeout: 30_000,
        accountAddress: testnetProtocol.tradeAccount,
      }
    );
    await adapter.reconnect(testnetProtocol.tradeApiWsUrl);
    return adapter;
  }
}

class MockAdapter implements trade.TradeAdapter {
  getLpConfig(): Promise<trade.LpConfigUpdateResponse> {
    throw new Error("Method not implemented.");
  }
  waitForConnect(): Promise<void> {
    return Promise.resolve();
  }
  getOpenAccountMessage(): Promise<Bytes> {
    throw new Error("Method not implemented.");
  }
  async getDepositMessage(): Promise<Bytes> {
    return ethers.utils.toUtf8Bytes("deposit message");
  }
  async getWithdrawMessage(): Promise<Bytes> {
    return ethers.utils.toUtf8Bytes("withdraw message");
  }
  async getTradeMessage(): Promise<Bytes> {
    return ethers.utils.toUtf8Bytes("trade message");
  }
  openAccount(): Promise<trade.OpenAccountResponse> {
    throw new Error("Method not implemented.");
  }
  async withdraw(
    amount: string,
    accountId: number,
    accountUser: string,
    tokenAddress: string,
    recipientAddress: string,
    signature: string
  ): Promise<trade.WithdrawResponse> {
    return {
      result: {
        type: "event",
        content: {
          withdraw: {
            accountId,
            amount,
            token: tokenAddress,
            recipient: recipientAddress,
            timestampUnixMillis: Date.now(),
            accountUser: accountUser,
            signature,
          },
        },
      },
    };
  }
  async deposit(
    amount: string,
    accountId: number,
    tokenAddress: string,
    depositorAddress: string,
    signature: string
  ): Promise<trade.DepositResponse> {
    return {
      result: {
        type: "event",
        content: {
          deposit: {
            accountId,
            amount,
            token: tokenAddress,
            depositor: depositorAddress,
            timestampUnixMillis: Date.now(),
            signature,
          },
        },
      },
    };
  }
  async trade(
    accountId: number,
    liquidityPoolId: string,
    size: TradeSize,
    pair: Pair,
    accountUser: string,
    signature: string
  ): Promise<trade.TradeResponse> {
    const price = parsePrice("1100");
    return {
      result: {
        type: "event",
        content: {
          trade: {
            accountId,
            lpId: liquidityPoolId,
            size: formatAmount(size.lots(price)),
            pair: pairToString(pair),
            accountUser: accountUser,
            timestampUnixMillis: Date.now(),
            marginFee: "11.00",
            price: formatPrice(price),
            signature,
          },
        },
      },
    };
  }

  listenToLpPairTradeability(_listener: LpPairTradeabilityListener): void {}

  requestHandshakeDataBroadcast(): void {}

  cancelSubscription(_subscriptionId: string): void {}

  subscribeToAccount(
    _accountId: number,
    _listener: AccountListener
  ): Promise<TradeSubscriptionId> {
    return Promise.resolve("test-mock-id-account-subscription");
  }

  subscribeToLp(
    _lpId: LpId,
    _listener: LpListener
  ): Promise<TradeSubscriptionId> {
    return Promise.resolve("test-mock-id-lp-subscription");
  }
}
