import { BigNumber } from "ethers";
import { OpenInterest, TradePair } from "./interface";
import { SerializedPairState } from "./adapter";
import { AMOUNT_UNIT, parseAmount, PRICE_UNIT } from "./reader";
import { getCurrentUnixTimestamp } from "../../utils/general";

export class PairState {
  public readonly tradePair: TradePair;
  public openInterest: OpenInterest;
  private readonly sumFractionFunding: TimestampedBigNumberMarketSide;
  private readonly sumFractionBorrow: TimestampedBigNumberMarketSide;

  private constructor(
    tradePair: TradePair,
    sumFractionFunding: TimestampedBigNumberMarketSide,
    sumFractionBorrow: TimestampedBigNumberMarketSide,
    openInterest: OpenInterest
  ) {
    this.tradePair = tradePair;
    this.sumFractionFunding = sumFractionFunding;
    this.sumFractionBorrow = sumFractionBorrow;
    this.openInterest = openInterest;
  }

  public static fromSerialized(
    serialized: SerializedPairState,
    tradePair: TradePair
  ): PairState {
    const sumFractionFunding: TimestampedBigNumberMarketSide = {
      value: {
        long: parseAmount(serialized.sumFractionFunding.value.long),
        short: parseAmount(serialized.sumFractionFunding.value.short),
      },
      timestamp: serialized.sumFractionFunding.timestamp,
    };
    const sumFractionBorrow: TimestampedBigNumberMarketSide = {
      value: {
        long: parseAmount(serialized.sumFractionBorrow.value.long),
        short: parseAmount(serialized.sumFractionBorrow.value.short),
      },
      timestamp: serialized.sumFractionBorrow.timestamp,
    };
    const openInterest = new OpenInterest(
      parseAmount(serialized.openInterest.long),
      parseAmount(serialized.openInterest.short)
    );
    return new PairState(
      tradePair,
      sumFractionFunding,
      sumFractionBorrow,
      openInterest
    );
  }

  public static zero(tradePair: TradePair) {
    const zeroTimestampedBigNumberMarketSide: TimestampedBigNumberMarketSide = {
      value: {
        long: BigNumber.from(0),
        short: BigNumber.from(0),
      },
      timestamp: 0,
    };
    return new PairState(
      tradePair,
      zeroTimestampedBigNumberMarketSide,
      zeroTimestampedBigNumberMarketSide,
      OpenInterest.zero()
    );
  }

  public getCurrentSumFractionFunding(
    indexPrice: BigNumber
  ): MarketSide<BigNumber> {
    const currentTimestamp = getCurrentUnixTimestamp();
    const fundingRates = this.tradePair.getFundingRate(this.openInterest);
    return {
      long: calculateCurrentSumFractionNotional(
        indexPrice,
        fundingRates.long,
        this.sumFractionFunding.value.long,
        this.sumFractionFunding.timestamp,
        currentTimestamp
      ),
      short: calculateCurrentSumFractionNotional(
        indexPrice,
        fundingRates.short,
        this.sumFractionFunding.value.short,
        this.sumFractionFunding.timestamp,
        currentTimestamp
      ),
    };
  }

  public getLpFundingRate(indexPrice: BigNumber): BigNumber {
    if (this.openInterest.total().isZero()) {
      return BigNumber.from(0);
    }
    const fundingRates = this.tradePair.getFundingRate(this.openInterest);
    return getSmallerMarketSide(fundingRates).mul(indexPrice).div(PRICE_UNIT);
  }

  public getCurrentSumFractionBorrow(
    indexPrice: BigNumber
  ): MarketSide<BigNumber> {
    const currentTimestamp = getCurrentUnixTimestamp();
    const borrowRates = this.tradePair.getBorrowRate(this.openInterest);
    return {
      long: calculateCurrentSumFractionNotional(
        indexPrice,
        borrowRates.long,
        this.sumFractionBorrow.value.long,
        this.sumFractionBorrow.timestamp,
        currentTimestamp
      ),
      short: calculateCurrentSumFractionNotional(
        indexPrice,
        borrowRates.short,
        this.sumFractionBorrow.value.short,
        this.sumFractionBorrow.timestamp,
        currentTimestamp
      ),
    };
  }
}

export type TimestampedBigNumberMarketSide = TimestampedValue<
  MarketSide<BigNumber>
>;

export type TimestampedValue<T> = {
  value: T;
  timestamp: number;
};

export type MarketSide<T> = {
  long: T;
  short: T;
};

const calculateCurrentSumFraction = (
  rate: BigNumber,
  snapshotValue: BigNumber,
  snapshotTimestamp: number,
  currentTimestamp: number
): BigNumber => {
  const hoursElapsed = calculateHoursElapsed(
    snapshotTimestamp,
    currentTimestamp
  );
  const accrued = rate.mul(hoursElapsed).div(AMOUNT_UNIT);
  return snapshotValue.add(accrued);
};

const calculateCurrentSumFractionNotional = (
  indexPrice: BigNumber,
  rate: BigNumber,
  snapshotValue: BigNumber,
  snapshotTimestamp: number,
  currentTimestamp: number
): BigNumber =>
  calculateCurrentSumFraction(
    rate.mul(indexPrice).div(PRICE_UNIT),
    snapshotValue,
    snapshotTimestamp,
    currentTimestamp
  );

const calculateHoursElapsed = (
  fromUnixTimestamp: number,
  toUnixTimestamp: number
): BigNumber =>
  parseAmount((toUnixTimestamp - fromUnixTimestamp).toString()).div(60 * 60);

const getSmallerMarketSide = (marketSide: MarketSide<BigNumber>): BigNumber => {
  return marketSide.short.lt(marketSide.long)
    ? marketSide.short
    : marketSide.long;
};
