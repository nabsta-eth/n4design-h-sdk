import { pairToString } from "../../utils/general";
import {
  MarketPrice,
  TradeEffect,
  TradeLiquidityPool,
  TradePairId,
} from "./interface";
import {
  AMOUNT_UNIT,
  PRICE_UNIT,
  ReaderPeriodicPositionFeeCollection,
  TradeReader,
} from "./reader";
import { ethers, BigNumber } from "ethers";
import { PairState } from "./pairState";

const ZERO = BigNumber.from(0);
const MINUS_ONE = BigNumber.from(-1);

// When `JSON.stringify`ing a BigNumber, it includes a hex property.
export type BigNumberState = {
  hex: string;
};

export type GetPeriodicFeesArgs = {
  accountId: number;
  reader: TradeReader;
  startTimestamp: number;
};

export class Position {
  public pairId: TradePairId;
  public size: BigNumber;
  public entryPrice: BigNumber;
  // Only defined if the position is not zeroed.
  public snapshotSumFractionFunding?: BigNumber;
  // Only defined if the position is not zeroed.
  public snapshotSumFractionBorrow?: BigNumber;
  private liquidityPool: TradeLiquidityPool;

  public constructor(
    pairId: TradePairId,
    liquidityPool: TradeLiquidityPool,
    size: BigNumber,
    entryPrice: BigNumber,
    snapshotSumFractionFunding?: BigNumber,
    snapshotSumFractionBorrow?: BigNumber
  ) {
    this.pairId = pairId;
    this.size = size;
    this.entryPrice = entryPrice;
    this.snapshotSumFractionFunding = snapshotSumFractionFunding;
    this.snapshotSumFractionBorrow = snapshotSumFractionBorrow;
    this.liquidityPool = liquidityPool;
  }

  /**
   * Creates an empty position.
   * @param pairId The position pair ID.
   * @param liquidityPool Reference to the liquidity pool instance.
   */
  public static Zero(
    pairId: TradePairId,
    liquidityPool: TradeLiquidityPool
  ): Position {
    return new Position(
      pairId,
      liquidityPool,
      ethers.constants.Zero,
      ethers.constants.Zero
    );
  }

  public get isLong(): boolean {
    return this.size.gt("0");
  }

  public get isShort(): boolean {
    return this.size.lt("0");
  }

  public get isZero(): boolean {
    return this.size.eq(0);
  }

  /// Returns the unrealized equity to be realized given the position is fully
  /// closed, i.e. the PnL for the entire position (not including fees such as
  //  the margin fee).
  public calculateFullUnrealizedEquityToBeRealized(): BigNumber {
    const tradeSize = this.size.mul("-1");
    return this.calculateUnrealizedEquityToBeRealized(tradeSize);
  }

  /// Returns accrued account fees, i.e. borrow and funding fees.
  public calculateAccruedAccountFees(
    pairState: PairState,
    indexPrice: BigNumber
  ): BigNumber {
    return this.calculateAccruedFundingFee(pairState, indexPrice).add(
      this.calculateAccruedBorrowFee(pairState, indexPrice)
    );
  }

  public calculateAccruedFundingFee(
    pairState: PairState,
    indexPrice: BigNumber
  ): BigNumber {
    if (!this.snapshotSumFractionFunding) {
      return BigNumber.from(0);
    }
    const sumFractionFunding =
      pairState.getCurrentSumFractionFunding(indexPrice);
    return calculateFeeWithSumFractions(
      this.size,
      this.snapshotSumFractionFunding,
      this.isLong ? sumFractionFunding.long : sumFractionFunding.short
    );
  }

  public calculateAccruedBorrowFee(
    pairState: PairState,
    indexPrice: BigNumber
  ): BigNumber {
    if (!this.snapshotSumFractionBorrow) {
      return BigNumber.from(0);
    }
    const sumFractionBorrow = pairState.getCurrentSumFractionBorrow(indexPrice);
    return calculateFeeWithSumFractions(
      this.size,
      this.snapshotSumFractionBorrow,
      this.isLong ? sumFractionBorrow.long : sumFractionBorrow.short
    );
  }

  /// Returns the equity to be realized given a trade size is filled.
  /// When a position is decreased, the user realizes its unrealized PnL
  /// proportionally to the trade size, up to the full position size.
  /// When a position is increased, no equity is realized.
  /// This does not include fees (such as the margin fee).
  public calculateUnrealizedEquityToBeRealized(
    tradeSize: BigNumber
  ): BigNumber {
    const marketPrice = this.liquidityPool.getPrice(
      this.pairId.pair,
      tradeSize
    );
    const tradePrice = marketPrice.getTradePriceFromTradeSize(tradeSize);
    const tradeSizeEffect = this.getPositionTradeSizeEffect(tradeSize);
    return this.calculateRealizedPnl(tradeSizeEffect, tradePrice);
  }

  /// When increasing a position size, due to spread the trade may
  /// add new unrealized equity (at a loss).
  public calculateNewUnrealizedEquity(
    tradeSize: BigNumber,
    marketPrice: MarketPrice
  ): BigNumber {
    const tradeSizeEffect = this.getPositionTradeSizeEffect(tradeSize);
    const getIncreaseSize = () => {
      switch (tradeSizeEffect.sizeChangeType) {
        case SizeChangeType.Decrease:
          return ZERO;
        case SizeChangeType.Increase:
          return tradeSizeEffect.relevantTradeSize;
        case SizeChangeType.CloseAndFlipIncrease:
          return tradeSizeEffect.relevantTradeSize;
        default:
          throw new Error("unknown tradeSizeEffect enum variant");
      }
    };
    const isBuying = tradeSize.gt(0);
    const increaseSize = getIncreaseSize();
    const entryPrice = marketPrice.getTradePrice(isBuying);
    const markPrice = marketPrice.getTradePrice(!isBuying);
    const spreadLoss = increaseSize
      .mul(markPrice.sub(entryPrice))
      .div(PRICE_UNIT);
    if (spreadLoss.gt(0)) {
      throw new Error("spread loss cannot be positive");
    }
    return spreadLoss;
  }

  /// Calculates the REALIZED PnL from a trade.
  /// This does not account for any unrealised PnL that may be created
  /// after the trade is done, such as due to spread.
  private calculateRealizedPnl(
    tradeSizeEffect: PositionTradeSizeEffect,
    price: BigNumber
  ): BigNumber {
    const realizedPnl = this.getSizeDecreasing(tradeSizeEffect)
      .mul(price.sub(this.entryPrice))
      .div(PRICE_UNIT);
    return realizedPnl;
  }

  public applyTradeEffect(effect: TradeEffect, size: BigNumber) {
    const nextSize = this.size.add(size);
    const tradeSizeEffect = this.getPositionTradeSizeEffect(size);
    const nextEntryPrice = this.getNextEntryPrice(
      tradeSizeEffect,
      effect.fillPrice
    );
    // Any changes to the position's state must happen AFTER this.
    this.size = nextSize;
    this.entryPrice = nextEntryPrice;
    const pairState = this.liquidityPool.getPairState(this.pairId.pair);
    const indexPrice = this.liquidityPool.getPrice(this.pairId.pair).index;
    // Update the fee snapshots.
    this.snapshotSumFractionFunding = this.isLong
      ? pairState.getCurrentSumFractionFunding(indexPrice).long
      : pairState.getCurrentSumFractionFunding(indexPrice).short;
    this.snapshotSumFractionBorrow = this.isLong
      ? pairState.getCurrentSumFractionBorrow(indexPrice).long
      : pairState.getCurrentSumFractionBorrow(indexPrice).short;
  }

  public getPositionTradeSizeEffect(
    tradeSize: BigNumber
  ): PositionTradeSizeEffect {
    const isIncreasing = tradeSize.gt(ZERO) == this.size.gt(ZERO);
    if (isIncreasing) {
      return {
        sizeChangeType: SizeChangeType.Increase,
        relevantTradeSize: tradeSize,
      };
    }
    const tradeSizeAbs = tradeSize.abs();
    const positionSizeAbs = this.size.abs();
    if (tradeSizeAbs.lte(positionSizeAbs)) {
      return {
        sizeChangeType: SizeChangeType.Decrease,
        relevantTradeSize: tradeSize,
      };
    }
    const increaseSizeAfterClose = tradeSize.add(this.size);
    return {
      sizeChangeType: SizeChangeType.CloseAndFlipIncrease,
      relevantTradeSize: increaseSizeAfterClose,
    };
  }

  private getNextEntryPrice(
    tradeSizeEffect: PositionTradeSizeEffect,
    tradePrice: BigNumber
  ): BigNumber {
    switch (tradeSizeEffect.sizeChangeType) {
      case SizeChangeType.Decrease:
        return this.entryPrice;
      case SizeChangeType.CloseAndFlipIncrease:
        return tradePrice;
      case SizeChangeType.Increase:
        const existingSize: WeightedAverageInput = {
          amount: this.entryPrice,
          weight: this.size,
        };
        const tradeSize: WeightedAverageInput = {
          amount: tradePrice,
          weight: tradeSizeEffect.relevantTradeSize,
        };
        return calculateWeightedAverage([existingSize, tradeSize]);
      default:
        throw new Error("unknown tradeSizeEffect enum variant");
    }
  }

  /// Returns the position size that is subtracted from this position
  /// by a `PositionTradeSizeEffect`.
  private getSizeDecreasing(
    tradeSizeEffect: PositionTradeSizeEffect
  ): BigNumber {
    switch (tradeSizeEffect.sizeChangeType) {
      case SizeChangeType.Increase:
        return ZERO;
      case SizeChangeType.Decrease:
        return tradeSizeEffect.relevantTradeSize.mul(MINUS_ONE);
      case SizeChangeType.CloseAndFlipIncrease:
        return this.size;
      default:
        throw new Error("unknown tradeSizeEffect enum variant");
    }
  }

  public getNotionalValue(markPrice: BigNumber): BigNumber {
    return this.size.mul(markPrice).div(PRICE_UNIT);
  }

  public getMarkPrice(marketPrice: MarketPrice): BigNumber {
    return marketPrice.getTradePrice(this.isShort);
  }

  /// The "increase price" is the price used for trades that
  /// match the side of the position.
  /// For example, if placing a buy trade on a long position,
  /// the price used is the increase price i.e. the ask.
  /// However, if placing a sell trade on a long position,
  /// the price used is the mark price which is the "decrease" price.
  public getIncreasePrice(marketPrice: MarketPrice): BigNumber {
    return marketPrice.getTradePrice(this.isLong);
  }

  public async getPeriodicFees(
    args: GetPeriodicFeesArgs
  ): Promise<ReaderPeriodicPositionFeeCollection[]> {
    return args.reader.getPeriodicFeesForPosition(
      args.accountId,
      pairToString(this.pairId.pair),
      args.startTimestamp
    );
  }

  public clone(): Position {
    return new Position(
      this.pairId,
      this.liquidityPool,
      this.size,
      this.entryPrice,
      this.snapshotSumFractionFunding,
      this.snapshotSumFractionBorrow
    );
  }
}

export type PositionTradeSizeEffect = {
  sizeChangeType: SizeChangeType;
  relevantTradeSize: BigNumber;
};

export enum SizeChangeType {
  Increase,
  Decrease,
  CloseAndFlipIncrease,
}

export type WeightedAverageInput = {
  amount: BigNumber;
  weight: BigNumber;
};

const calculateWeightedAverage = (
  inputs: WeightedAverageInput[]
): BigNumber => {
  const totalWeight = inputs
    .map((input) => input.weight)
    .reduce((sum, weight) => sum.add(weight), ZERO);
  return inputs.reduce(
    (weightedAverage, input) =>
      weightedAverage.add(input.weight.mul(input.amount).div(totalWeight)),
    ZERO
  );
};

const calculateFeeWithSumFractions = (
  size: BigNumber,
  previousSumFraction: BigNumber,
  currentSumFraction: BigNumber
): BigNumber =>
  size.abs().mul(currentSumFraction.sub(previousSumFraction)).div(AMOUNT_UNIT);
