import { config } from "../index";
import axios from "axios";
import { BigNumber } from "ethers";

const logPrefix = (type: string) =>
  `[${new Date().toLocaleString()}] [handle-sdk] [${type}] `;

const sendLog = (type: string, ...args: any) => {
  if (!config.sdk.printLogs) return;
  console.log(`${logPrefix(type)}`, ...args);
};

const log = (...args: any[]) => sendLog("log", ...args);

const trace = (...args: any[]) => sendLog("trace", ...args);

export const fetchCacheApi = async <T>(endpoint: string): Promise<T> => {
  const apiCacheBaseUrl = `${config.api.baseUrl}/cache`;
  const slash =
    !apiCacheBaseUrl.endsWith("/") && !endpoint.startsWith("/") ? "/" : "";
  const url = `${apiCacheBaseUrl}${slash}${endpoint}`;
  type Response = {
    data: T;
  };
  let {
    data: { data },
  } = await axios.get<Response>(url);
  data = recursivelyParseBigNumbersInObject(data);
  return data;
};

/// Identifies any JSON-stringified BigNumbers and parses them.
const recursivelyParseBigNumbersInObject = (object: any) => {
  if (!object) return;
  // Check if the entire object is a BigNumber.
  const objectBn = tryGetBigNumber(object);
  if (objectBn) return objectBn;
  // Check if any of the object properties are a BigNumber.
  const keys = Object.keys(object);
  for (let key of keys) {
    const value = object[key];
    if (typeof value !== "object") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => recursivelyParseBigNumbersInObject(item));
      continue;
    }
    const valueBn = tryGetBigNumber(value);
    if (!valueBn) {
      recursivelyParseBigNumbersInObject(value);
      continue;
    }
    object[key] = valueBn;
  }
  return object;
};

const tryGetBigNumber = (object: any): BigNumber | null =>
  object && object.type === "BigNumber" && object.hex
    ? BigNumber.from(object.hex)
    : null;

export const retryPromise = async <T>(
  promise: () => Promise<T>,
  maxTries = 5,
  retryDelay = 500
): Promise<T> => {
  let lastError: unknown;
  for (let i = 0; i < maxTries; i++) {
    let succeeded = true;
    let value: undefined | T;
    try {
      value = await promise();
    } catch (e) {
      lastError = e;
      succeeded = false;
    }
    if (succeeded) {
      return value!;
    }
    await new Promise((r) => setTimeout(r, retryDelay));
  }
  throw lastError;
};

export const getCacheServerErrorMessage = () =>
  logPrefix("cache sever lookup failed; defaulting to local");

export default {
  log,
  trace,
};
