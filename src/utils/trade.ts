import { BigNumber, ethers } from "ethers";
import { transformDecimals } from "./general";
import { HLP_TRADING_ENABLED_ON_WEEKEND } from "../components/trade/platforms/hlp/config";
import {
  MarketPrice,
  PRICE_DECIMALS,
  PRICE_UNIT,
} from "../components/trade/platforms/legacyInterface";
import { BASIS_POINTS_DIVISOR } from "../constants";

export const toUsEasternTime = (date: Date) => {
  return new Date(
    date.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
};

export const isTradeWeekend = (date = new Date()) => {
  // Get current date as EST/EDT
  const usEasternTime = toUsEasternTime(date);

  // getDay() returns the weekday number,
  // which starts at 0 for Sunday and
  // goes up to 6 for Saturday.
  const weekdayNumber = usEasternTime.getDay();
  const hour = usEasternTime.getHours();

  // Trades are closed:
  // * from Friday 17:00 EST/EDT;
  // * until Sunday 17:00 EST/EDT.

  if (weekdayNumber === 5 && hour >= 17) {
    // Friday from 17:00 EST/EDT.
    return true;
  }

  if (weekdayNumber === 0 && hour < 17) {
    // Sunday before 17:00 EST/EDT.
    return true;
  }

  // If the weekday is Saturday (6), then it is the trade weekend,
  // otherwise, it must be in the trade week.
  return weekdayNumber === 6;
};

export const isHlpMarketClosed = (symbol: string): boolean =>
  isTradeWeekend() && !HLP_TRADING_ENABLED_ON_WEEKEND[symbol];

/// Gets the token amount as USD given the USD price and a token amount.
export const getUsdTokenAmount = (
  usdPrice: BigNumber,
  tokenAmount: BigNumber
) => usdPrice.mul(tokenAmount).div(PRICE_UNIT);

/// Gets the token amount given the USD price and an USD amount.
export const getTokenAmount = (
  usdPrice: BigNumber,
  usdAmount: BigNumber,
  tokenDecimals: number
) =>
  usdAmount
    .mul(ethers.utils.parseUnits("1", tokenDecimals))
    .div(transformDecimals(usdPrice, PRICE_DECIMALS, tokenDecimals));

/**
 * Gets the correct price from a spread price for a position.
 * @param isLong Whether the position is long.
 * @param isIncreasing Whether the position is being increased.
 * @param price The market price for the position.
 * @param slippage The slippage, as a percentage, to apply to the price.
 */
export const getActionPrice = (
  isLong: boolean,
  isIncreasing: boolean,
  price: MarketPrice,
  slippage = 0
) => {
  const markPrice = getActionPriceNoSlippage(isLong, isIncreasing, price);
  const isLoweringValue = isIncreasing ? !isLong : isLong;
  return applySlippage(markPrice, slippage, isLoweringValue);
};

const getActionPriceNoSlippage = (
  isLong: boolean,
  isIncreasing: boolean,
  price: MarketPrice
) => {
  if (isIncreasing) {
    return isLong ? price.bestAsk : price.bestBid;
  }
  return isLong ? price.bestBid : price.bestAsk;
};

export const applySlippage = (
  value: BigNumber,
  slippage: number,
  isLoweringValue: boolean
) => {
  const amount = value
    .mul((BASIS_POINTS_DIVISOR * slippage) / 100)
    .div(BASIS_POINTS_DIVISOR);
  return isLoweringValue ? value.sub(amount) : value.add(amount);
};
