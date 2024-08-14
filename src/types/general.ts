export type Promisified<T> = {
  [K in keyof T]: Promise<T[K]>;
};

/// A subscription ID is a number identifying a subscriber.
export type SubscriptionId = number;

export type Subscription<TCallback, TArg> = {
  callback: TCallback;
  arg: TArg;
};
