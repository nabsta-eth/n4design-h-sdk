import { BigNumber } from "ethers";

export type Pair = {
  baseSymbol: string;
  quoteSymbol: string;
};

/// Denotes that the underlying string represents a Pair as BASE/QUITE.
export type PairStringified = string;

export type WebsocketPrice = {
  pair: Pair;
  value: BigNumber;
  timestamp: number;
};

export type SignedQuote = {
  /// The quote pair. eg: Pair { base: "AUD", quote: "USD" } for "AUD/USD"
  pair: Pair;
  signatureParams: SignedQuoteParams;
  signature: Uint8Array;
};

export type SignedQuoteParams = {
  /// The value of the quote, with 8 decimals. eg: 100000000 for 1 AUD/USD
  value: BigNumber;
  signedTimestamp: BigNumber;
  chainId: number;
  validFromTimestamp: BigNumber;
  durationSeconds: BigNumber;
};
