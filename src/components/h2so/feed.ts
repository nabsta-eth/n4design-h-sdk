import websocket, { IMessageEvent } from "websocket";
import { DATA_FEED_API_WS_URL_QUOTES } from "../../config";
import { Pair, PairStringified, WebsocketPrice } from "../../types/trade";
import {
  allSettledResults,
  isSamePair,
  pairsToStringCsv,
  pairToString,
} from "../../utils/general";
import { BigNumber } from "ethers";
import { Subscription, SubscriptionId } from "../../types/general";
import { toParsedDatafeedPair } from "./toParsedDatafeedPair";
import { config } from "../../index";

const RECONNECT_DELAY = 1_000;
const MAX_RECONNECT_ATTEMPTS = 10;

export type Options = {
  onConnect?: () => void;
  onClose?: () => void;
  connect?: boolean;
  websocketUrl?: string;
  autoReconnect?: boolean;
  reconnectDelayMillis?: number;
  connectMaxAttempts?: number;
};

type SubscriptionPair = {
  pair: Pair;
  connectionId: number;
};

type TimestampedPrice = Omit<WebsocketPrice, "pair">;

type PairMap<T> = { [pair: PairStringified]: T | undefined };

type ErrorCallback = (error: Error) => void;

type PriceCallback = (price: TimestampedPrice) => void;

type LocalSubscription = Subscription<SubscriptionCallback, Pair[]>;

/**
 * Watches for price updates on the h2so server at oracle.handle.fi,
 * allowing a client to subscribe to price updates.
 */
export class PriceFeed {
  private client?: websocket.w3cwebsocket;
  private userErrorCallback?: ErrorCallback;
  private internalErrorCallback?: ErrorCallback;
  private internalPriceCallbacks: PriceCallback[] = [];
  private options: Options;
  /** Subscriptions to the remote server. */
  private remoteSubscriptions: SubscriptionPair[] = [];
  /** Subscriptions from local users. */
  private localSubscriptions: Array<LocalSubscription | null> = [];
  private feed: PairMap<TimestampedPrice> = {};
  private clientOpenPromise?: Promise<void>;
  private connectionId = 0;
  private isConnecting = false;

  public constructor(options: Options) {
    this.options = options;
    if (options.connect) {
      this.connectPersisting(
        options?.connectMaxAttempts,
        options?.reconnectDelayMillis
      ).catch(console.error);
    }
  }

  private get websocketUrl() {
    return this.options.websocketUrl ?? DATA_FEED_API_WS_URL_QUOTES;
  }

  public setOptions(options: Options) {
    this.options = options;
  }

  public async connect(reconnectDelayMillis = RECONNECT_DELAY) {
    if (this.isConnecting) {
      await this.waitForConnection();
      return;
    }
    if (this.isConnected) {
      try {
        this.close();
      } catch (_) {}
    }
    this.isConnecting = true;
    try {
      await this.setupConnection(reconnectDelayMillis);
    } finally {
      this.isConnecting = false;
    }
  }

  private async setupConnection(reconnectDelayMillis = RECONNECT_DELAY) {
    this.client = new websocket.w3cwebsocket(this.websocketUrl);
    if (this.options.autoReconnect) {
      this.client.onclose = (e) => {
        console.debug("[handle-sdk] [feed] onclose (w/autoReconnect)", e);
        this.options.onClose?.();
        setTimeout(
          () =>
            this.connectPersisting(
              MAX_RECONNECT_ATTEMPTS,
              reconnectDelayMillis
            ),
          reconnectDelayMillis
        );
      };
    } else {
      this.client.onclose = (e) => {
        console.debug("[handle-sdk] [feed] onclose", e);
        this.options.onClose?.();
      };
    }
    // Set the error handler.
    this.client.onerror = (error) => {
      console.error("[handle-sdk] [feed] onerror", error);
      // Call both the internal & user callbacks, if defined.
      this.internalErrorCallback?.(error);
      this.userErrorCallback?.(error);
    };
    this.client.onmessage = this.handleMessage.bind(this);
    this.clientOpenPromise = new Promise((resolve, reject) => {
      this.client!.onopen = () => {
        console.debug("[handle-sdk] [feed] onopen");
        this.options.onConnect?.();
        // Subscribe to any existing pairs.
        const pairs = this.localSubscriptions
          .flatMap((s) => s?.arg ?? [])
          .reduce((pairs, pair) => {
            const hasPair = pairs.find((p) => isSamePair(p, pair));
            return hasPair ? pairs : [...pairs, pair];
          }, [] as Pair[]);
        this.subscribeRemote(pairs);
        resolve();
      };
      this.internalErrorCallback = reject;
    });
    this.connectionId += 1;
    console.debug(`[handle-sdk] [feed] connection #${this.connectionId}`);
    await this.waitForConnection();
  }

  public async connectPersisting(
    maxAttempts = MAX_RECONNECT_ATTEMPTS,
    reconnectDelayMillis = RECONNECT_DELAY
  ) {
    let lastError: unknown;
    for (let attempt = 1; attempt < maxAttempts + 1; attempt++) {
      try {
        await this.connect(reconnectDelayMillis);
        return;
      } catch (error) {
        lastError = error;
        console.error(error);
        if (config.sdk.printLogs) {
          console.debug(
            `[handle-sdk] [feed] re-trying connection (attempt ${attempt})`
          );
        }
        await new Promise((resolve) =>
          setTimeout(resolve, reconnectDelayMillis * attempt)
        );
      }
    }
    throw lastError;
  }

  public close() {
    if (!this.isConnected || !this.client) {
      return;
    }
    this.client.onclose = () => null;
    this.client.close();
  }

  public onError(callback: (error: Error) => void) {
    if (!this.client) return;
    this.userErrorCallback = callback;
  }

  private handleMessage(message: IMessageEvent) {
    if (typeof message.data !== "string") {
      return;
    }
    const data = JSON.parse(message.data);
    const value = BigNumber.from(String(data.value));
    this.handlePrice(data.pair, value, data.timestamp);
  }

  private handlePrice(pair: Pair, price: BigNumber, timestamp: number) {
    // Set instance state.
    const timestampedPrice: TimestampedPrice = {
      value: price,
      timestamp,
    };
    this.feed[pairToString(pair)] = timestampedPrice;
    // Trigger internal callbacks.
    this.internalPriceCallbacks.forEach((cb) => cb(timestampedPrice));
    // Trigger subscription callbacks.
    this.publishPriceUpdate({
      pair,
      ...timestampedPrice,
    });
  }

  /**
   * Subscribes to price updates from the remote server.
   * Only returns when the prices have been received.
   */
  private async subscribeRemote(pairs: Pair[]) {
    if (pairs.length === 0) {
      console.warn("[handle-sdk] [feed] would subscribe to zero pairs");
    }
    if (!this.isConnected) {
      throw new Error("PriceFeed: websocket is not connected");
    }
    this.removeOldSubscriptions();
    // Filter out pairs that are already subscribed.
    pairs = pairs
      .map(
        (pair) =>
          ({
            pair,
            connectionId: this.connectionId,
          } satisfies SubscriptionPair)
      )
      .filter(this.isNewSubscription.bind(this))
      .map((s) => s.pair);
    // Return early if there are no new subscriptions.
    if (pairs.length === 0) {
      return;
    }
    this.client!.send(
      JSON.stringify({
        action: "subscribe",
        params: {
          pairs: pairs.map(pairToString).join(","),
        },
      })
    );
    console.debug(
      `[handle-sdk] [feed] subscribing to ${pairs.length} pairs:`,
      pairsToStringCsv(pairs)
    );
    try {
      await Promise.all(pairs.map((p) => this.waitForPrice(p, true)));
    } catch (error) {
      console.error("[handle-sdk] [feed] subscription failed", error);
      return;
    }
    // Keep unique subscriptions.
    const subscriptions: SubscriptionPair[] = pairs
      .map((pair) => ({
        pair,
        connectionId: this.connectionId,
      }))
      .filter(this.isNewSubscription.bind(this));
    // Push subscriptions to state.
    this.remoteSubscriptions.push(...subscriptions);
    console.debug(
      `[handle-sdk] [feed] subscribed to ${subscriptions.length} pairs: `,
      pairsToStringCsv(subscriptions.map((s) => s.pair))
    );
  }

  private isNewSubscription(subscription: SubscriptionPair): boolean {
    return !this.remoteSubscriptions.find(
      (existing) =>
        pairToString(existing.pair) == pairToString(subscription.pair) &&
        existing.connectionId == this.connectionId
    );
  }

  /**
   * Unsubscribes from price updates from the remote server.
   */
  private unsubscribeRemote(pairs: Pair[]) {
    if (pairs.length === 0) {
      console.warn("[handle-sdk] [feed] would unsubscribe from zero pairs");
      return;
    }
    if (!this.isConnected) {
      throw new Error("PriceFeed: websocket is not connected");
    }
    // Assert that pairs are valid.
    this.client!.send(
      JSON.stringify({
        action: "unsubscribe",
        params: {
          pairs: pairs.map(pairToString).join(","),
        },
      })
    );
    // Delete subscriptions from state.
    this.remoteSubscriptions = this.remoteSubscriptions.filter(
      (subscription) =>
        !pairs.some(
          (pair) => pairToString(pair) === pairToString(subscription.pair)
        )
    );
  }

  public async waitForConnection() {
    await this.clientOpenPromise;
  }

  public get isConnected() {
    return (
      this.client && this.client.readyState === websocket.w3cwebsocket.OPEN
    );
  }

  public async getPrice(pair: Pair): Promise<BigNumber> {
    const pairString = pairToString(pair);
    // Ensure pair subscription price availability.
    await this.subscribeRemote([pair]);
    if (!this.feed[pairString]) {
      throw new Error(`PriceFeed: no price for ${pairString}`);
    }
    return this.feed[pairString]!.value;
  }

  /**
   * Gets a (nullable) price from the feed, and does not subscribe to the pair
   * if missing.
   */
  public getPriceSync(pair: Pair): BigNumber | undefined {
    return this.feed[pairToString(pair)]?.value;
  }

  private removeOldSubscriptions() {
    const indicesToRemove = this.remoteSubscriptions
      .map((s, i) => ({ subscription: s, i }))
      .filter((v) => v.subscription.connectionId !== this.connectionId)
      .map((v) => v.i);
    for (let i = this.remoteSubscriptions.length; i >= 0; i--) {
      if (!indicesToRemove.includes(i)) {
        continue;
      }
      this.remoteSubscriptions.splice(i, 1);
    }
  }

  public async fetchPrices(
    pairs: Pair[]
  ): Promise<Record<PairStringified, BigNumber | undefined>> {
    pairs = pairs.map(toParsedDatafeedPair);
    if (!this.isConnected) {
      console.debug("[handle-sdk] [feed] re-connecting socket");
      await this.connectPersisting();
    }
    // This is required as there are many-to-one subscriptions to the feed,
    // and subsequent ones will not call `connectPersisting`, so they must
    // use this promise to ensure the connection is live.
    await this.waitForConnection();
    const prices = await allSettledResults(pairs.map(this.getPrice.bind(this)));
    return prices.reduce(
      (object, price, i) => ({
        ...object,
        [pairToString(pairs[i])]: price,
      }),
      {} as Record<PairStringified, BigNumber | undefined>
    );
  }

  public async fetchPrice(pair: Pair): Promise<BigNumber> {
    const prices = await this.fetchPrices([pair]);
    const price = prices[pairToString(pair)];
    if (!price) {
      throw new Error(`getPrice: no price for ${pairToString(pair)}`);
    }
    return price;
  }

  /// Subscribes to h2so feed.
  /**
   * Subscribes to the H2SO feed.
   * @param pairs Pairs to subscribe to.
   * @param callback Callback for receiving updates.
   * @param shouldSendExistingPrice Whether to immediately call the callback
   * with an exiting price, if available. If this is set to false, the
   * callback will only be called when a remote price update is received.
   */
  public subscribe(
    pairs: Pair[],
    callback: SubscriptionCallback,
    shouldSendExistingPrice = true
  ): SubscriptionId {
    const subscription = {
      callback,
      arg: pairs,
    };
    const subscriberId = this.localSubscriptions.push(subscription) - 1;
    console.debug(
      `[handle-sdk] [feed] locally subscribed to ${pairs.length} pairs:`,
      pairsToStringCsv(pairs)
    );
    this.subscribeRemote(pairs).catch(console.error);
    if (shouldSendExistingPrice) {
      for (const pair of pairs) {
        const existingPrice = this.feed[pairToString(pair)];
        if (!existingPrice) {
          continue;
        }
        // Set a zeroed timeout so that the client code has a chance
        // to run other lines of code after the subscription before
        // the callback is executed.
        setTimeout(() => callback(pair, existingPrice.value), 0);
      }
    }
    return subscriberId;
  }

  public unsubscribe(id: SubscriptionId) {
    if (!this.localSubscriptions[id]) {
      throw new Error("h2so feed: not subscribed");
    }
    const pairs = this.localSubscriptions[id]?.arg ?? [];
    this.localSubscriptions[id] = null;
    const pairToUnsubscribeRemote: Pair[] = [];
    for (const pair of pairs) {
      if (!this.isSubscribedToPairLocal(pair)) {
        // There are no more local subscriptions to this pair,
        // therefore also mark for unsubscription of remote updates.
        pairToUnsubscribeRemote.push(pair);
      }
    }
    if (pairToUnsubscribeRemote.length > 0) {
      this.unsubscribeRemote(pairToUnsubscribeRemote);
    }
  }

  private isSubscribedToPairLocal(pair: Pair): boolean {
    for (const subscription of this.localSubscriptions) {
      const hasPair = subscription?.arg.some((p) => isSamePair(p, pair));
      if (hasPair) {
        return true;
      }
    }
    return false;
  }

  /// Gets the latest socket price; throws if not available.
  public getLatestPrice(pair: Pair) {
    const price = this.getPriceSync(pair);
    if (!price) {
      throw new Error(`h2so: no price for ${pairToString(pair)}`);
    }
    return price;
  }

  private publishPriceUpdate(data: WebsocketPrice) {
    const pair = pairToString(data.pair);
    for (let subscription of this.localSubscriptions) {
      if (!subscription) continue;
      for (let subscriptionPair of subscription.arg) {
        if (pairToString(subscriptionPair) !== pair) continue;
        subscription.callback(data.pair, data.value);
      }
    }
  }

  public async waitForPrice(
    pair: Pair,
    shouldReturnExisting = false,
    timeoutMillis = 15_000
  ): Promise<TimestampedPrice> {
    const existingPrice = this.feed[pairToString(pair)];
    if (existingPrice && shouldReturnExisting) {
      return existingPrice;
    }
    return new Promise((resolve, reject) => {
      const ref = {
        isResolved: false,
        isRejected: false,
        callbackIndex: -1,
      };
      const deleteCallback = () =>
        this.internalPriceCallbacks.splice(ref.callbackIndex, 1);
      const callback = (price: TimestampedPrice) => {
        if (ref.isRejected) {
          return;
        }
        ref.isResolved = true;
        deleteCallback();
        resolve(price);
      };
      setTimeout(() => {
        if (ref.isResolved) {
          return;
        }
        ref.isRejected = true;
        deleteCallback();
        reject(`h2so timed out waiting for ${pairToString(pair)}`);
      }, timeoutMillis);
      ref.callbackIndex = this.internalPriceCallbacks.push(callback) - 1;
    });
  }
}

export type SubscriptionCallback = (pair: Pair, price: BigNumber) => any;
