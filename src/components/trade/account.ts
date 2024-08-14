import { BigNumber, Signer, ethers } from "ethers";
import {
  AccountSubscriptionContent,
  DepositOrWithdrawal,
  PeriodicFee,
  TradeAdapter,
  TradeLiquidityPool,
  TradeSubscriptionId,
} from ".";
import { TradeProtocol } from "./protocol";
import {
  AMOUNT_DECIMALS,
  parseAmount,
  parsePrice,
  PRICE_DECIMALS,
  ReaderPeriodicPositionFeeType,
  ReaderTradeType,
  TradeReader,
} from "./reader";
import {
  isSameAddress,
  pairFromString,
  pairToString,
} from "../../utils/general";
import { TokenInfo } from "@uniswap/token-lists";
import {
  ActiveOrder,
  GetHistoryArgs,
  OrderArgs,
  SimulateTradeArgs,
  TradeAction,
  TradeArgs,
  TradeEffect,
  TradePairId,
  TradeSimulation,
} from "./index";
import { parseUnits } from "ethers/lib/utils";
import { Position } from "./position";

export type AccountOrderArgs = OrderArgs & {
  lpId: string;
};

export type DepositArgs = {
  signer: Signer;
  amount: BigNumber;
  token: TokenInfo;
  useGasless?: boolean;
  psmToken?: string;
};

export type WithdrawArgs = {
  signer: Signer;
  amount: BigNumber;
  receiver: string;
  token: TokenInfo;
  psmToken?: string;
};

/**
 * @property userAddress User address to which the role will be granted.
 * @property role The trade account role to grant.
 * @property signer The account signer to perform the action.
 */
export type GrantRoleArgs = {
  userAddress: string;
  role: TradeAccountRole;
  signer: Signer;
};

/**
 * @property userAddress User address from which the role will be revoked.
 * @property role The trade account role to grant.
 * @property signer The account signer to perform the action.
 */
export type RevokeRoleArgs = {
  userAddress: string;
  role: TradeAccountRole;
  signer: Signer;
};

export type TransferArgs = {};

export type GetRolesArgs = {
  userAddress: string;
};

export type AccountTradeResponse = {
  tradeEffect: TradeEffect;
};

export enum TradeAccountRole {
  None = 0,
  Owner = 1,
  Trader = 2,
  Withdraw = 3,
  Deposit = 4,
  Open = 5,
  ProtocolAdmin = 6,
}

// This interface is private as the account does not need to be abstracted.
interface ITradeAccount {
  readonly id: number;
  getPosition(pair: TradePairId): Position;
  getAllPositions(): Position[];
  getTradeHistory(args: GetHistoryArgs): Promise<TradeAction[]>;
  getDepositWithdrawHistory(
    args: GetHistoryArgs
  ): Promise<DepositOrWithdrawal[]>;
  getPeriodicFeeHistory(args: GetHistoryArgs): Promise<PeriodicFee[]>;
  getActiveOrders(): Promise<ActiveOrder[]>;
  getEquity(lps?: TradeLiquidityPool[]): BigNumber;
  getRealisedEquity(): BigNumber;
  getUnrealisedEquity(lps?: TradeLiquidityPool[]): BigNumber;
  getAvailableEquity(lps?: TradeLiquidityPool[]): BigNumber;
  getInitialMarginRequirement(): BigNumber;
  getMaintenanceMarginRequirement(): BigNumber;
  getOpenInterest(): BigNumber;
  getLeverage(): BigNumber;
  getPositionLeverage(id: TradePairId): BigNumber;
  trade(args: TradeArgs): Promise<AccountTradeResponse>;
  simulateTrade(args: SimulateTradeArgs): TradeSimulation;
  deposit(args: DepositArgs): Promise<void>;
  withdraw(args: WithdrawArgs): Promise<void>;
  // Below are unimplemented so far.
  order(args: AccountOrderArgs): Promise<void>;
  grantRole(args: GrantRoleArgs): Promise<void>;
  revokeRole(args: RevokeRoleArgs): Promise<void>;
  transfer(args: TransferArgs): Promise<void>;
  getRolesArgs(args: GetRolesArgs): Promise<TradeAccountRole[]>;
}

export type AccountOpenArgs = {
  amount: BigNumber;
  wallet: Signer;
  protocol: TradeProtocol;
  adapter: TradeAdapter;
  equityToken: TokenInfo;
  reader: TradeReader;
  referralCode?: string;
  useGasless?: boolean;
  psmToken?: string;
};

/**
 * A trade account instance.
 * The instance is connected to a specific equity token, and will
 * only have access to LPs with that same underlying token.
 */
export class TradeAccount implements ITradeAccount {
  public readonly id: number;
  public readonly equityTokenAddress: string;
  private readonly protocol: TradeProtocol;
  private readonly adapter: TradeAdapter;
  private readonly reader: TradeReader;
  private readonly remoteTimestamp: number;
  private realizedEquity: BigNumber;
  private positions: Position[];
  public onUpdate?: () => void;
  private subsriptionId: TradeSubscriptionId | null = null;
  private isProcessingSubscriptionRequest = false;

  constructor(
    id: number,
    realizedEquity: BigNumber,
    positions: Position[],
    protocol: TradeProtocol,
    adapter: TradeAdapter,
    reader: TradeReader,
    equityTokenAddress: string,
    remoteTimestamp?: number
  ) {
    this.id = id;
    this.realizedEquity = realizedEquity;
    this.positions = positions;
    this.protocol = protocol;
    this.adapter = adapter;
    this.reader = reader;
    this.equityTokenAddress = equityTokenAddress;
    this.remoteTimestamp = remoteTimestamp ?? 0;
  }

  public subscribeToRemoteUpdates() {
    if (this.subsriptionId || this.isProcessingSubscriptionRequest) {
      return;
    }
    this.isProcessingSubscriptionRequest = true;
    this.adapter
      .subscribeToAccount(this.id, this.handleAccountPublication.bind(this))
      .then((subscriptionId) => {
        this.subsriptionId = subscriptionId;
      })
      .finally(() => {
        this.isProcessingSubscriptionRequest = false;
      });
  }

  public cancelSubscriptionToRemoteUpdates() {
    this.subsriptionId = null;
  }

  private handleAccountPublication(
    content: AccountSubscriptionContent,
    topic: string
  ) {
    if (topic != "tradeAccount") {
      // This should never happen, because this is the only topic for this
      // publication.
      return;
    }
    this.positions = content.positions.map(
      (position) =>
        new Position(
          new TradePairId(pairFromString(position.pair), position.lpId),
          this.protocol.getLiquidityPool(position.lpId),
          parseAmount(position.size),
          parsePrice(position.entryPrice),
          parseAmount(position.snapshotSumFractionFunding),
          parseAmount(position.snapshotSumFractionBorrow)
        )
    );
    this.realizedEquity = parseAmount(content.realizedEquity);
    // Notify listener that the account instance has updated.
    this.onUpdate?.();
  }

  getPosition(pair: TradePairId): Position {
    return (
      this.positions.find((position) => position.pairId.eq(pair)) ??
      Position.Zero(pair, this.protocol.getLiquidityPool(pair.lpId))
    );
  }

  getAllPositions(): Position[] {
    return this.positions;
  }

  async getTradeHistory(args: GetHistoryArgs): Promise<TradeAction[]> {
    const history = await this.reader.getTradeHistory(
      this.id,
      args.limit ?? 1000,
      args.skip ?? 0,
      args.pairId ? pairToString(args.pairId.pair) : undefined
    );
    return history.map((trade) => {
      return new TradeAction(
        new TradePairId(pairFromString(trade.pair), trade.liquidityPool.id),
        BigNumber.from(trade.size),
        BigNumber.from(trade.price),
        +trade.transaction.timestamp,
        BigNumber.from(trade.realizedEquity),
        BigNumber.from(trade.marginFee),
        trade.tradeType === ReaderTradeType.Trade ? "trade" : "liquidation",
        trade.transaction.hash,
        trade.didOpenPosition,
        trade.didClosePosition
      );
    });
  }

  async getDepositWithdrawHistory(
    args: GetHistoryArgs
  ): Promise<DepositOrWithdrawal[]> {
    let limit = args.limit ?? 1000;
    const history = await this.reader.getDepositWithdrawHistory(
      this.id,
      limit,
      args.skip ?? 0
    );
    const depositsOrWithdrawls: DepositOrWithdrawal[] = [];
    // Merge deposits and withdrawals into one array, sorted by timestamp, up to limit.
    while (limit--) {
      const depositTimestamp =
        history.accountAssetDeposits[0]?.transaction.timestamp;
      const withdrawTimestamp =
        history.accountAssetWithdrawals[0]?.transaction.timestamp;
      if (depositTimestamp === undefined && withdrawTimestamp === undefined) {
        break;
      }

      if (depositTimestamp === undefined && withdrawTimestamp !== undefined) {
        const withdraw = history.accountAssetWithdrawals.shift()!;
        depositsOrWithdrawls.push({
          amount: BigNumber.from(withdraw.amount).mul(-1),
          timestamp: +withdrawTimestamp,
          txHash: withdraw.transaction.hash,
        });
        continue;
      }

      if (depositTimestamp !== undefined && withdrawTimestamp === undefined) {
        const deposit = history.accountAssetDeposits.shift()!;
        depositsOrWithdrawls.push({
          amount: BigNumber.from(deposit.amount),
          timestamp: +depositTimestamp,
          txHash: deposit.transaction.hash,
        });
        continue;
      }

      if (+depositTimestamp > +withdrawTimestamp) {
        const deposit = history.accountAssetDeposits.shift()!;
        depositsOrWithdrawls.push({
          amount: BigNumber.from(deposit.amount),
          timestamp: +depositTimestamp,
          txHash: deposit.transaction.hash,
        });
      } else {
        const withdraw = history.accountAssetWithdrawals.shift()!;
        depositsOrWithdrawls.push({
          amount: BigNumber.from(withdraw.amount).mul(-1),
          timestamp: +withdrawTimestamp,
          txHash: withdraw.transaction.hash,
        });
      }
    }
    return depositsOrWithdrawls;
  }

  async getPeriodicFeeHistory(args: GetHistoryArgs): Promise<PeriodicFee[]> {
    const history = await this.reader.getPeriodicFeeHistory(
      this.id,
      args.limit ?? 1000,
      args.skip ?? 0,
      args.startTimestamp
    );
    return history.map(
      (fee): PeriodicFee => ({
        pairId: new TradePairId(pairFromString(fee.pair), fee.liquidityPool.id),
        type:
          fee.periodicPositionFeeType === ReaderPeriodicPositionFeeType.Borrow
            ? "borrow"
            : "funding",
        amount: BigNumber.from(fee.amount),
        timestamp: +fee.transaction.timestamp,
      })
    );
  }

  async getActiveOrders(): Promise<ActiveOrder[]> {
    return [];
  }

  /**
   * Returns the available equity for the account.
   */
  getEquity(): BigNumber {
    return this.getRealisedEquity().add(this.getUnrealisedEquity());
  }

  getRealisedEquity(): BigNumber {
    return this.realizedEquity;
  }

  /**
   * Returns the available equity for the account.
   */
  getAvailableEquity(): BigNumber {
    return this.getEquity().sub(this.getInitialMarginRequirement());
  }

  /**
   * Returns the unrealised equity for the account.
   */
  getUnrealisedEquity(): BigNumber {
    let equity = BigNumber.from("0");
    const lps = this.protocol.getLiquidityPools();
    for (const position of this.positions) {
      const marketPrice = this.protocol.getPrice(
        position.pairId,
        position.size
      );
      const unrealizedEquity =
        position.calculateFullUnrealizedEquityToBeRealized();
      const lp = lps.find((lp) => lp.id === position.pairId.lpId);
      const pairState = lp?.getPairState(position.pairId.pair);
      const accruedFees = pairState
        ? position.calculateAccruedAccountFees(pairState, marketPrice.index)
        : BigNumber.from(0);
      equity = equity.add(unrealizedEquity).sub(accruedFees);
    }
    return equity;
  }

  getInitialMarginRequirement(): BigNumber {
    let margin = BigNumber.from("0");
    for (const position of this.positions) {
      const price = this.protocol.getPrice(position.pairId).index;
      const tradePair = this.protocol.getTradePair(position.pairId);
      margin = margin.add(tradePair.getInitialMargin(position.size, price));
    }
    return margin;
  }

  getMaintenanceMarginRequirement(): BigNumber {
    let margin = BigNumber.from("0");
    for (const position of this.positions) {
      const price = this.protocol.getPrice(position.pairId).index;
      const tradePair = this.protocol.getTradePair(position.pairId);
      margin = margin.add(tradePair.getMaintenanceMargin(position.size, price));
    }
    return margin;
  }

  /**
   * @returns The total value of all positions in the liquidity token currency
   * (currently USD).
   */
  getOpenInterest(): BigNumber {
    let openInterest = BigNumber.from("0");
    for (const position of this.positions) {
      const price = this.protocol.getPrice(position.pairId).index;
      openInterest = openInterest.add(
        position.size.abs().mul(price).div(parseUnits("1", PRICE_DECIMALS))
      );
    }
    return openInterest;
  }

  getLeverage(): BigNumber {
    return this.getEquity().isZero()
      ? ethers.constants.Zero
      : this.getOpenInterest()
          .mul(parseUnits("1", AMOUNT_DECIMALS))
          .div(this.getEquity());
  }

  getPositionLeverage(id: TradePairId): BigNumber {
    const position = this.getPosition(id);
    return position.size
      .mul(this.protocol.getPrice(id).index)
      .div(parseUnits("1", PRICE_DECIMALS));
  }

  async trade(args: TradeArgs): Promise<AccountTradeResponse> {
    const liquidityPool = this.protocol.getLiquidityPool(args.pairId.lpId);
    const existingPosition = this.getPosition(args.pairId);
    const tradeEffect = await liquidityPool.trade({
      ...args,
      oldSize: existingPosition.size,
      accountId: this.id,
    });
    return {
      tradeEffect,
    };
  }

  private applyTradeEffect(
    pairId: TradePairId,
    effect: TradeEffect,
    size: BigNumber,
    gasFee: BigNumber
  ): Position {
    const position = this.getPosition(pairId);
    if (size.isZero()) {
      return position;
    }
    const fees = effect.marginFee.add(gasFee);
    this.realizedEquity = this.realizedEquity.sub(fees);
    // Realise existing position before placing new trade on the position.
    const existingPositionUnrealizedEquity =
      position.calculateUnrealizedEquityToBeRealized(size);
    this.realizedEquity = this.realizedEquity.add(
      existingPositionUnrealizedEquity
    );
    position.applyTradeEffect(effect, size);
    if (position.size.eq("0")) {
      // Remove existing position as it has a size of zero.
      this.positions = this.positions.filter((p) => !p.pairId.eq(pairId));
    } else if (!this.positions.some((p) => p.pairId.eq(pairId))) {
      // Push new position.
      this.positions.push(position);
    }
    return position;
  }

  simulateTrade(args: SimulateTradeArgs): TradeSimulation {
    const nextAccount = new TradeAccount(
      this.id,
      this.realizedEquity,
      this.positions.map((p) => p.clone()),
      this.protocol,
      this.adapter,
      this.reader,
      this.equityTokenAddress
    );
    const tradePrice = this.protocol.getTradePrice(args.pairId.lpId, {
      size: args.size,
      pair: args.pairId.pair,
    });
    const tradePair = this.protocol.getTradePair(args.pairId);
    const nextPosition =
      nextAccount.positions.find((p) => p.pairId === args.pairId) ??
      Position.Zero(
        args.pairId,
        this.protocol.getLiquidityPool(args.pairId.lpId)
      );
    const spreadFee = nextPosition.calculateUnrealizedEquityToBeRealized(
      args.size
    );
    const effect = {
      fillPrice: tradePrice,
      marginFee: tradePair.getMarginFee(args.size, tradePrice),
      spreadFee,
    };
    if (args.size.isZero()) {
      // Must return early before applying sequencer fees on
      // zero trade size.
      return {
        nextAccount,
        effect,
        spreadFee,
      };
    }
    nextAccount.applyTradeEffect(args.pairId, effect, args.size, args.gasFee);
    let failureReason: string | undefined;
    const equity = nextAccount.getEquity();
    const initialMargin = nextAccount.getInitialMarginRequirement();
    if (equity < initialMargin) {
      failureReason = "Insufficient equity";
    } else if (!tradePair.isActive) {
      failureReason = "Pair is inactive";
    } else if (tradePair.isReduceOnly) {
      const oldSize = this.getPosition(args.pairId).size;
      const newSize = nextAccount.getPosition(args.pairId).size;
      if (newSize.abs().gt(oldSize)) {
        failureReason = "Reduce only";
      }
    }
    return {
      failureReason,
      effect,
      spreadFee,
      nextAccount,
    };
  }

  async deposit(args: DepositArgs): Promise<void> {
    const address = await args.signer.getAddress();
    const message = await this.adapter.getDepositMessage(address, this.id);
    const signature = await args.signer.signMessage(message);
    const response = await this.adapter.deposit(
      ethers.utils.formatUnits(args.amount, args.token.decimals),
      this.id,
      args.token.address,
      address,
      signature,
      args.useGasless,
      args.psmToken
    );
    if (response.error) {
      throw new Error(response.error);
    }
  }

  async withdraw(args: WithdrawArgs): Promise<void> {
    const address = await args.signer.getAddress();
    const message = await this.adapter.getWithdrawMessage(address, this.id);
    const signature = await args.signer.signMessage(message);
    const response = await this.adapter.withdraw(
      ethers.utils.formatUnits(args.amount, args.token.decimals),
      this.id,
      address,
      args.token.address,
      args.receiver,
      signature,
      args.psmToken
    );
    if (response.error) {
      throw new Error(response.error);
    }
  }

  static async open({
    amount,
    wallet,
    protocol,
    adapter,
    equityToken,
    reader,
    referralCode,
    useGasless,
    psmToken,
  }: AccountOpenArgs): Promise<TradeAccount> {
    const amountString = ethers.utils.formatUnits(amount, equityToken.decimals);
    const ownerAddress = await wallet.getAddress();
    const message = await adapter.getOpenAccountMessage(ownerAddress);
    const signature = await wallet.signMessage(message);
    const response = await adapter.openAccount(
      amountString,
      equityToken.address,
      ownerAddress,
      signature,
      referralCode,
      useGasless,
      psmToken
    );
    if (response.error) {
      throw new Error(response.error);
    }
    return new TradeAccount(
      response.result!.content.openAccount.accountId,
      parseUnits(response.result!.content.openAccount.amount, AMOUNT_DECIMALS),
      [],
      protocol,
      adapter,
      reader,
      equityToken.address
    );
  }

  static async fromId(
    id: number,
    reader: TradeReader,
    protocol: TradeProtocol,
    adapter: TradeAdapter,
    equityTokenAddress: string
  ): Promise<TradeAccount> {
    const response = await reader.getAccount(id);
    if (!response?.account) {
      throw new Error(`Account ${id} not found`);
    }
    const equityTokenLpIds = protocol
      .getLiquidityPoolsOfUnderlyingToken(equityTokenAddress)
      .map((lp) => lp.id);
    const positions = response.account.positions
      .map((position) => {
        return new Position(
          new TradePairId(
            pairFromString(position.pair),
            position.liquidityPool.id
          ),
          protocol.getLiquidityPool(position.liquidityPool.id),
          BigNumber.from(position.size),
          BigNumber.from(position.entryPrice),
          BigNumber.from(position.snapshotSumFractionFunding),
          BigNumber.from(position.snapshotSumFractionBorrow)
        );
      })
      .filter(
        (position) =>
          !position.size.eq("0") &&
          equityTokenLpIds.includes(position.pairId.lpId)
      );
    const realizedEquity = response.account.realizedEquities.find((e) =>
      isSameAddress(e.token, equityTokenAddress)
    )?.value;
    return new TradeAccount(
      id,
      BigNumber.from(realizedEquity ?? "0"),
      positions,
      protocol,
      adapter,
      reader,
      equityTokenAddress,
      response._meta.block.timestamp
    );
  }

  order(_: AccountOrderArgs): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async grantRole(args: GrantRoleArgs): Promise<void> {
    const ownerAddress = await args.signer.getAddress();
    const message = await this.adapter.getOwnerMessage(ownerAddress, this.id);
    const signature = await args.signer.signMessage(message);
    await this.adapter.grantAccountUserRole(
      this.id,
      args.userAddress,
      args.role,
      ownerAddress,
      signature
    );
  }

  async revokeRole(args: RevokeRoleArgs): Promise<void> {
    const ownerAddress = await args.signer.getAddress();
    const message = await this.adapter.getOwnerMessage(ownerAddress, this.id);
    const signature = await args.signer.signMessage(message);
    await this.adapter.revokeAccountUserRole(
      this.id,
      args.userAddress,
      args.role,
      ownerAddress,
      signature
    );
  }

  transfer(_: TransferArgs): Promise<void> {
    throw new Error("Method not implemented.");
  }

  getRolesArgs(_: GetRolesArgs): Promise<TradeAccountRole[]> {
    throw new Error("Method not implemented.");
  }

  timestamp(): number {
    return this.remoteTimestamp;
  }
}
