import { Pair, SignedQuote } from "../../types/trade";
import { BigNumber, BytesLike, ethers } from "ethers";
import { config } from "../..";
import axios from "axios";
import {
  DATA_FEED_API_BASE_URL,
  DATA_FEED_SIGNING_ADDRESS,
} from "../../config";
import { Provider } from "@ethersproject/providers";
import { toParsedDatafeedPair } from "./toParsedDatafeedPair";
import { pairToString } from "../../utils/general";
import { PriceFeed } from "./feed";

export type EncodedSignedQuote = {
  encoded: BytesLike;
  decoded: SignedQuote[];
};

type QuoteApiResponse = {
  data: {
    result: number;
    signed: null;
  };
};

type QuoteApiResponseSigned = {
  data: {
    /// Quote value as an 8 decimal number.
    result: number;
    signed: {
      signatureParams: {
        signedTimestamp: number;
        chainId: number;
        /// Timestamp from which the quote is valid. Seconds since unix epoch.
        validFromTimestamp: number;
        durationSeconds: number;
      };
      /// Hex-encoded signature.
      signature: string;
      /// Hex-encoded unsigned message.
      message: string;
    };
  };
};

export const fetchEncodedSignedQuotes = async (
  pairs: Pair[]
): Promise<EncodedSignedQuote> => {
  const signedQuotes = await fetchSignedQuotes(pairs);
  return {
    encoded: encodeQuotes(signedQuotes),
    decoded: signedQuotes,
  };
};

export const fetchUnsignedFeedQuote = async (
  pair: Pair,
  feed: PriceFeed
): Promise<number> => {
  try {
    // Try fetching the price from the H2SO feed first.
    pair = toParsedDatafeedPair(pair);
    const prices = await feed.fetchPrices([pair]);
    const price = prices?.[pairToString(pair)]?.toNumber();
    if (!price)
      throw new Error(
        `fetchUnsignedQuote: no price in h2so feed for ${pairToString(pair)}`
      );
    return price;
  } catch (error) {
    // In case of failure, fetch from the API server directly.
    console.error(error);
    return (await fetchApiQuote(pair, false)).data.result;
  }
};

export const fetchApiQuote = async (pair: Pair, sign = true) => {
  pair = toParsedDatafeedPair(pair);
  const result = await axios.get(
    `${DATA_FEED_API_BASE_URL}/${pair.baseSymbol}/${pair.quoteSymbol}?sign=${
      sign ? "true" : "false"
    }`
  );
  if (sign) {
    return result.data as QuoteApiResponseSigned;
  }
  return result.data as QuoteApiResponse;
};

const fetchSignedQuotes = async (pairs: Pair[]) => {
  const responses = await Promise.all(
    pairs.map(async (pair) => {
      const response = await fetchApiQuote(pair, true);
      if (response.data.signed) {
        return response as QuoteApiResponseSigned;
      } else {
        throw new Error(`No signature returned for ${pair}`);
      }
    })
  );
  return responses.map((response, i) =>
    quoteApiResponseToSignedQuote(pairs[i], response)
  );
};

const quoteApiResponseToSignedQuote = (
  pair: Pair,
  {
    data: {
      result,
      signed: { signatureParams, signature, message },
    },
  }: QuoteApiResponseSigned,
  verifySigner = true
): SignedQuote => {
  if (verifySigner) {
    const untrustedSigner = ethers.utils
      .verifyMessage(ethers.utils.arrayify(`0x${message}`), `0x${signature}`)
      .toLowerCase();
    if (untrustedSigner !== DATA_FEED_SIGNING_ADDRESS.toLowerCase())
      throw new Error(
        `Message is not signed by authorised signer (signed by "${untrustedSigner}")`
      );
  }
  return {
    pair,
    signature: signature.startsWith("0x")
      ? ethers.utils.arrayify(signature)
      : ethers.utils.arrayify(`0x${signature}`),
    signatureParams: {
      value: BigNumber.from(result),
      signedTimestamp: BigNumber.from(signatureParams.signedTimestamp),
      chainId: signatureParams.chainId,
      validFromTimestamp: BigNumber.from(signatureParams.validFromTimestamp),
      durationSeconds: BigNumber.from(signatureParams.durationSeconds),
    },
  };
};

export const encodeQuotes = (quotes: SignedQuote[]): BytesLike => {
  const concatenatedSignatures = quotes.reduce((buffer, quote, i) => {
    for (let j = 0; j < 65; j++) {
      const offset = i * 65;
      buffer[offset + j] = quote.signature[j];
    }
    return buffer;
  }, new Uint8Array(quotes.length * 65));
  const tokenAddresses = quotes.map((quote) =>
    symbolToAddress(quote.pair.baseSymbol)
  );
  return ethers.utils.defaultAbiCoder.encode(
    [
      "uint256",
      "address[]",
      "uint256[]",
      "uint256[]",
      "uint256[]",
      "uint256[]",
      "bytes",
    ],
    [
      tokenAddresses.length,
      tokenAddresses,
      quotes.map((quote) => quote.signatureParams.value),
      quotes.map((quote) => quote.signatureParams.signedTimestamp),
      quotes.map((quote) => quote.signatureParams.validFromTimestamp),
      quotes.map((quote) => quote.signatureParams.durationSeconds),
      concatenatedSignatures,
    ]
  );
};

type SymbolAddressConverter = (symbol: string) => string | undefined;

const symbolToAddress = (symbol: string): string => {
  const eth: SymbolAddressConverter = (symbol: string): string | undefined => {
    if (symbol !== "ETH" && symbol !== "WETH") return;
    return config.protocol.arbitrum.collaterals.WETH.address;
  };
  const fxToken: SymbolAddressConverter = (
    symbol: string
  ): string | undefined => {
    const fxSymbol = symbol.startsWith("fx") ? symbol : `fx${symbol}`;
    return config.fxTokenAddresses[fxSymbol];
  };
  // Find a valid address conversion.
  const result = [eth, fxToken]
    .map((converter) => converter(symbol))
    .find((address) => address != null);
  if (!result) throw new Error(`Couldn't get address for symbol "${symbol}"`);
  return result;
};

/// Returns the encoded signature after waiting (if needed) for
/// it to become valid.
export const fetchTimedEncodedSignedQuotes = async (
  pairs: Pair[],
  provider: Provider
): Promise<EncodedSignedQuote> => {
  const signature = await fetchEncodedSignedQuotes(pairs);
  const maxValidTime = Math.max(
    ...signature.decoded.map(
      (quote) => +quote.signatureParams.validFromTimestamp
    )
  );
  await waitForBlockWithTimestamp(maxValidTime, provider);
  return signature;
};

const waitForBlockWithTimestamp = async (
  timestamp: number,
  provider: ethers.providers.Provider
) =>
  new Promise<void>(async (resolve) => {
    const checkBlock = async () => {
      const block = await provider.getBlock("latest");
      if (block?.timestamp && block.timestamp >= timestamp) {
        provider.removeListener("block", checkBlock);
        resolve();
      }
    };
    await checkBlock();
    provider.addListener("block", checkBlock);
  });
