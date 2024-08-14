import {
  GetCollateralTokensArgs,
  GetTradePairArgs,
  MarketPrice,
  Position,
  Trade,
  TradeAction,
  TradePair,
} from "./legacyInterface";
import { Pair } from "../../../types/trade";
import {
  allSettledResults,
  isSamePair,
  pairToString,
} from "../../../utils/general";
import { TokenInfo } from "@uniswap/token-lists";
import { parseOrderId } from "../utils";

export type IgnorePlatformPair = {
  platformName: string;
  pair: Pair;
};

type GetCombinedPlatformPriceArgs = {
  pair: Pair;
  platform?: string;
};

// override the getPrice method to return the price from a specific platform
export type CombinedPlatform = Omit<Trade, "getPrice"> & {
  getPrice: (args: GetCombinedPlatformPriceArgs) => MarketPrice;
};

export const createCombinedPlatform = async (
  platforms: Trade[],
  ignorePlatformPairs: IgnorePlatformPair[] = []
): Promise<CombinedPlatform> => {
  const platformPairs = filterPlatformPairs(
    platforms,
    await Promise.all(
      platforms.map(async (platform) => {
        try {
          return await platform.getTradePairs();
        } catch (error) {
          console.error(
            `Failed to fetch trade pairs for ${platform.name}`,
            error
          );
          return [];
        }
      })
    ),
    ignorePlatformPairs
  );
  const getPlatformTokens = () => {
    return filterPlatformTokens(
      platforms,
      platforms.map((platform) => platform.getTokens()),
      ignorePlatformPairs
    );
  };
  let combinedSubscriptionCounter = 0;
  // Map from internal subscription id to trade index and subscription id.
  const priceSubscriptions: Record<
    number,
    {
      tradeIndex: number;
      tradeSubscriptionId: number;
    }
  > = {};
  return {
    get name() {
      return platforms.map((platform) => platform.name).join("+");
    },
    initialise: async () => {
      await allSettledResults(
        platforms.map((platform) => platform.initialise())
      );
    },
    getLpTokenPrice: () => {
      throw new Error("not supported");
    },
    approveIncreasePosition: (args) => {
      const { platform } = findPlatformByTradePair(
        args.pair,
        platforms,
        platformPairs
      );
      return platform.approveIncreasePosition(args).catch(console.error);
    },
    approveCreateIncreasePositionOrder: (args) => {
      const { platform } = findPlatformByTradePair(
        args.pair,
        platforms,
        platformPairs
      );
      return platform.approveCreateIncreasePositionOrder(args);
    },
    increasePosition: (args) => {
      const { platform } = findPlatformByTradePair(
        args.pair,
        platforms,
        platformPairs
      );
      return platform.increasePosition(args);
    },
    decreasePosition: (args) => {
      const { platform } = findPlatformByTradePair(
        args.pair,
        platforms,
        platformPairs
      );
      return platform.decreasePosition(args);
    },
    createIncreasePositionOrder: (args) => {
      const { platform } = findPlatformByTradePair(
        args.pair,
        platforms,
        platformPairs
      );
      return platform.createIncreasePositionOrder(args);
    },
    createDecreasePositionOrder: (args) => {
      const { platform } = findPlatformByTradePair(
        args.pair,
        platforms,
        platformPairs
      );
      return platform.createDecreasePositionOrder(args);
    },
    updateIncreasePositionOrder: (args) => {
      const platform = findPlatformByOrderId(args.orderId, platforms);
      return platform.updateIncreasePositionOrder(args);
    },
    updateDecreasePositionOrder: (args) => {
      const platform = findPlatformByOrderId(args.orderId, platforms);
      return platform.updateDecreasePositionOrder(args);
    },
    getPosition: (args) => {
      const { platform } = findPlatformByTradePair(
        args.pair,
        platforms,
        platformPairs
      );
      return platform.getPosition(args);
    },
    getAllPositions: (args) =>
      Promise.all(
        platforms.map(async (platform) => {
          try {
            return await platform.getAllPositions(args);
          } catch (error) {
            console.error(
              `Failed to fetch trade positions for ${platform.name}`,
              error
            );
            return [];
          }
        })
      ).then((positions) =>
        filterPlatformPositionsByPairs(positions, platformPairs).flat()
      ),
    getUpdatedPosition: (args) => {
      const { platform } = findPlatformByTradePair(
        args.position.pair,
        platforms,
        platformPairs
      );
      return platform.getUpdatedPosition(args);
    },
    simulateIncreasePosition: (args) => {
      const { platform } = findPlatformByTradePair(
        args.position.pair,
        platforms,
        platformPairs
      );
      return platform.simulateIncreasePosition(args);
    },
    simulateDecreasePosition: (args) => {
      const { platform } = findPlatformByTradePair(
        args.position.pair,
        platforms,
        platformPairs
      );
      return platform.simulateDecreasePosition(args);
    },
    getPrice: (args: GetCombinedPlatformPriceArgs): MarketPrice => {
      // If platform is specified, use that platform to get the price.
      if (args.platform) {
        const { platform } = findPlatformByName(args.platform, platforms);
        return platform.getPrice(args);
      }
      // Otherwise, use the first platform that supports the pair.
      const { platform } = findPlatformByTokenFromPair(
        args.pair,
        platforms,
        getPlatformTokens()
      );
      return platform.getPrice(args);
    },
    subscribeToMarketPrice: (args) => {
      const { platform, index } = findPlatformByTradePair(
        args.pair,
        platforms,
        platformPairs
      );
      const tradeSubscriptionId = platform.subscribeToMarketPrice(args);
      const id = combinedSubscriptionCounter++;
      priceSubscriptions[id] = {
        tradeSubscriptionId,
        tradeIndex: index,
      };
      return id;
    },
    unsubscribeFromMarketPrice: (id) => {
      const subscription = priceSubscriptions[id];
      const platform = platforms[subscription.tradeIndex];
      return platform.unsubscribeFromMarketPrice(
        subscription.tradeSubscriptionId
      );
    },
    getTradePairs: async () => platformPairs.flat(),
    getTokens: () => platforms.map((platform) => platform.getTokens()).flat(),
    getCollateralTokens(args: GetCollateralTokensArgs): TokenInfo[] {
      const { platform } = findPlatformByTradePair(
        args.pair,
        platforms,
        platformPairs
      );
      return platform.getCollateralTokens(args);
    },
    getTradePair(args: GetTradePairArgs): TradePair {
      const { platform } = findPlatformByTradePair(
        args.pair,
        platforms,
        platformPairs
      );
      return platform.getTradePair(args);
    },
    async getTradeHistory(args): Promise<TradeAction[]> {
      const actions = await Promise.all(
        platforms.map((p) => p.getTradeHistory(args))
      );
      return actions.flat().sort((a, b) => b.timestamp - a.timestamp);
    },
    getAvailableLiquidity(args) {
      const { platform } = findPlatformByTradePair(
        args.pair,
        platforms,
        platformPairs
      );
      return platform.getAvailableLiquidity(args);
    },
    getPairAvailability(args) {
      const { platform } = findPlatformByTradePair(
        args.pair,
        platforms,
        platformPairs
      );
      return platform.getPairAvailability(args);
    },
    async getActiveOrders(args) {
      const orders = await Promise.all(
        platforms.map((platform) => platform.getActiveOrders(args))
      );
      return {
        increase: orders.map((o) => o.increase).flat(),
        decrease: orders.map((o) => o.decrease).flat(),
      };
    },
    getMinimumPositionCollateral(args) {
      const { platform } = findPlatformByTradePair(
        args.pair,
        platforms,
        platformPairs
      );
      return platform.getMinimumPositionCollateral(args);
    },
  } as Trade;
};

const findPlatformByName = (
  name: string,
  platforms: Trade[]
): { platform: Trade; index: number } => {
  const index = platforms.findIndex((platform) => platform.name === name);
  const platform = platforms[index];
  if (!platform) {
    throw new Error(`findPlatformByName: not found (${name})`);
  }
  return {
    platform,
    index,
  };
};

const findPlatformByTradePair = (
  pair: Pair,
  platforms: Trade[],
  platformPairs: TradePair[][]
): { platform: Trade; index: number } => {
  const index = platformPairs.findIndex((pairs) =>
    pairs.some((platformPair) => isSamePair(platformPair.pair, pair))
  );
  const platform = platforms[index];
  if (!platform) {
    throw new Error(`findPlatformByPair: not found (${pairToString(pair)})`);
  }
  return {
    platform,
    index,
  };
};

const findPlatformByTokenFromPair = (
  pair: Pair,
  platforms: Trade[],
  platformTokens: TokenInfo[][]
): { platform: Trade; index: number } => {
  const index = platformTokens.findIndex((platforms) =>
    platforms.some(
      (token) =>
        token.symbol === pair.baseSymbol || token.symbol === pair.quoteSymbol
    )
  );
  const platform = platforms[index];
  if (!platform) {
    throw new Error(
      `findPlatformByTokenSymbol: not found (${pairToString(pair)})`
    );
  }
  return {
    platform,
    index,
  };
};

const findPlatformByOrderId = (orderId: string, platforms: Trade[]): Trade => {
  const { platform: platformName } = parseOrderId(orderId);
  const platform = platforms.find((p) => p.name === platformName);
  if (!platform) {
    throw new Error(`Platform ${platformName} not found`);
  }
  return platform;
};

const filterPlatformPairs = (
  platforms: Trade[],
  platformPairs: TradePair[][],
  ignorePlatformPairs: IgnorePlatformPair[]
): TradePair[][] => {
  const filteredPlatformPairs: TradePair[][] = [];
  platformPairs.forEach((pairs, i) => {
    const ignoredPairs = getIgnoredPairs(ignorePlatformPairs, platforms[i]);
    const filteredPairs = pairs.filter(
      (tradePair) =>
        !ignoredPairs.some((pair) => isSamePair(pair, tradePair.pair))
    );
    filteredPlatformPairs.push(filteredPairs);
  });
  return filteredPlatformPairs;
};

const filterPlatformTokens = (
  platforms: Trade[],
  platformTokens: TokenInfo[][],
  ignorePlatformPairs: IgnorePlatformPair[]
): TokenInfo[][] => {
  const filteredPlatformTokens: TokenInfo[][] = [];
  platformTokens.forEach((tokens, i) => {
    const ignoredPairs = getIgnoredPairs(ignorePlatformPairs, platforms[i]);
    const filteredTokens = tokens.filter(
      (token) =>
        !ignoredPairs.some(
          (pair) =>
            token.symbol === pair.baseSymbol ||
            token.symbol === pair.quoteSymbol
        )
    );
    filteredPlatformTokens.push(filteredTokens);
  });
  return filteredPlatformTokens;
};

const filterPlatformPositionsByPairs = (
  platformPositions: Position[][],
  platformPairs: TradePair[][]
): Position[][] => {
  const filteredPlatformPositions: Position[][] = [];
  platformPositions.forEach((positions, i) => {
    const tradePairs = platformPairs[i];
    const filteredPositions = positions.filter((position) =>
      tradePairs.some(({ pair }) => isSamePair(pair, position.pair))
    );
    filteredPlatformPositions.push(filteredPositions);
  });
  return filteredPlatformPositions;
};

const getIgnoredPairs = (
  ignorePlatformPairs: IgnorePlatformPair[],
  platform: Trade
): Pair[] =>
  ignorePlatformPairs
    .filter((ignore) => ignore.platformName === platform.name)
    .map((ignore) => ignore.pair);
