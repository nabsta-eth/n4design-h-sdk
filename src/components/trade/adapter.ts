import { BigNumber, Bytes, ethers, utils } from "ethers";
import { Pair, PairStringified } from "../../types/trade";
import websocket from "websocket";
import { Account__factory } from "../../contracts";
import { TradeAccountRole } from "./account";
import { pairToString } from "../../utils/general";
import {
  ClearSystemParamArgs,
  LpId,
  SetSystemParamArgs,
  TradeSize,
} from "./interface";
import config from "../../config";

const MESSAGE_SCOPE = utils.keccak256(
  utils.toUtf8Bytes("HANDLE_SYNTH_ACCOUNT_MESSAGE")
);
const OPEN_ACCOUNT_ID = 0;
const MAX_SOCKET_SEND_TRIES = 5;
const SOCKET_RETRY_DELAY = 500;

export type Request = {
  id?: string;
  method: string;
  params?: unknown;
};

/// A response object may have an optional ID.
/// It will either have a `result` property if successful,
/// or an `error` property if failed.
export type Response<C> = {
  id?: string;
  result?: {
    type: string;
    content: C;
  };
  error?: string;
};

export type PublicationResponse<C> = Response<{
  topic: string;
  content: C;
}>;

export type OpenAccountResponse = Response<{
  openAccount: {
    accountId: number;
    amount: string;
    timestampUnixMillis: number;
    owner: string;
    token: string;
    referralCode: string | undefined;
    signature: string;
  };
}>;
export type DepositResponse = Response<{
  deposit: {
    accountId: number;
    amount: string;
    timestampUnixMillis: number;
    depositor: string;
    token: string;
    signature: string;
  };
}>;
export type WithdrawResponse = Response<{
  withdraw: {
    accountId: number;
    amount: string;
    timestampUnixMillis: number;
    accountUser: string;
    token: string;
    recipient: string;
    signature: string;
  };
}>;
export type TradeResponse = Response<TradeResponseContent>;
type TradeResponseContent = {
  trade: {
    pair: string;
    accountId: number;
    lpId: string;
    price: string;
    size: string;
    marginFee: string;
    timestampUnixMillis: number;
    accountUser: string;
    signature: string;
  };
};
export type GrantAccountUserRoleResponse = Response<{
  grantAccountUserRole: {
    accountId: number;
    user: string;
    role: TradeAccountRole;
    accountOwner: string;
    signature: string;
  };
}>;
export type RevokeAccountUserRoleResponse = Response<{
  revokeAccountUserRole: {
    accountId: number;
    user: string;
    role: TradeAccountRole;
    accountOwner: string;
    signature: string;
  };
}>;
export type LpConfigUpdateResponse = Response<{
  lpConfigUpdate: {
    lpId: string;
    pair: string;
    config: {
      initialMarginFraction: string;
      maintenanceMarginFraction: string;
      incrementalInitialMarginFraction: string;
      baselinePositionSize: string;
      incrementalPositionSize: string;
      marginFeeFraction: string;
      symmetricalSpreadFraction: string;
      isActive: boolean;
      isReduceOnly: boolean;
      borrowFeeFactor: string;
      fundingFactor: string;
      fundingExponent: string;
      maxOpenInterestDiff: string | null;
      maxOpenInterestLong: string | null;
      maxOpenInterestShort: string | null;
      usePriceImpact: boolean;
      priceImpactFraction: string | null;
      skewScale: string | null;
    };
  }[];
}>;

/// A TradeAdapter is a trade client, i.e. it allows sending requests and
/// fetching live data.
export interface TradeAdapter {
  getOpenAccountMessage(signerAddress: string): Promise<Bytes>;
  getDepositMessage(signerAddress: string, accountId: number): Promise<Bytes>;
  getWithdrawMessage(signerAddress: string, accountId: number): Promise<Bytes>;
  getTradeMessage(signerAddress: string, accountId: number): Promise<Bytes>;
  getOwnerMessage(signerAddress: string, accountId: number): Promise<Bytes>;
  openAccount(
    amount: string,
    tokenAddress: string,
    ownerAddress: string,
    signature: string,
    referralCode?: string,
    useGasless?: boolean,
    psmToken?: string
  ): Promise<OpenAccountResponse>;
  deposit(
    amount: string,
    accountId: number,
    tokenAddress: string,
    depositorAddress: string,
    signature: string,
    useGasless?: boolean,
    psmToken?: string
  ): Promise<DepositResponse>;
  withdraw(
    amount: string,
    accountId: number,
    accountUser: string,
    tokenAddress: string,
    recipientAddress: string,
    signature: string,
    psmToken?: string
  ): Promise<WithdrawResponse>;
  trade(
    accountId: number,
    liquidityPoolId: string,
    size: TradeSize,
    pair: Pair,
    accountUser: string,
    signature: string
  ): Promise<TradeResponse>;
  grantAccountUserRole(
    accountId: number,
    user: string,
    role: TradeAccountRole,
    accountOwner: string,
    signature: string
  ): Promise<GrantAccountUserRoleResponse>;
  revokeAccountUserRole(
    accountId: number,
    user: string,
    role: TradeAccountRole,
    accountOwner: string,
    signature: string
  ): Promise<RevokeAccountUserRoleResponse>;
  setSystemParam(args: SetSystemParamArgs): Promise<void>;
  clearSystemParam(args: ClearSystemParamArgs): Promise<void>;
  getLpConfig(): Promise<LpConfigUpdateResponse>;
  waitForConnect(): Promise<void>;
  subscribeToAccount(
    accountId: number,
    listener: AccountListener
  ): Promise<TradeSubscriptionId>;
  subscribeToLp(lpId: LpId, listener: LpListener): Promise<TradeSubscriptionId>;
  cancelSubscription(subscriptionId: string): void;
}

export type LpPairTradeabilityListener = (
  lpId: LpId,
  pair: Pair,
  isTradeable: boolean
) => void;

export type SubscriptionListener<C> = (content: C, topic: string) => void;

export type AccountSubscriptionContent = {
  id: number;
  realizedEquity: string;
  positions: SerializedPosition[];
};

export type SerializedPosition = {
  pair: string;
  lpId: string;
  size: string;
  entryPrice: string;
  snapshotSumFractionFunding: string;
  snapshotSumFractionBorrow: string;
};

export type AccountListener = SubscriptionListener<AccountSubscriptionContent>;

export type LpPairPublication<C> = {
  lpPair: SerializedLpPair;
  content: C;
};

export type SerializedLpPair = {
  lpId: LpId;
  pair: PairStringified;
};

export type LpPublication = LpPairPublication<boolean> | SerializedPairState;

export type LpListener = SubscriptionListener<LpPublication>;

export type SerializedPairState = {
  lpPair: SerializedLpPair;
  sumFractionFunding: SerializedTimestampedBigDecimalMarketSide;
  sumFractionBorrow: SerializedTimestampedBigDecimalMarketSide;
  openInterest: SerializedBigDecimalMarketSide;
};

export type SerializedTimestampedBigDecimalMarketSide = {
  value: SerializedBigDecimalMarketSide;
  timestamp: number;
};

export type SerializedBigDecimalMarketSide = {
  long: string;
  short: string;
};

export type TradeSubscriptionId = string;

/// The subscription response as sent from the server.
export type SubscriptionResponse = Response<TradeSubscriptionId>;

const DEFAULT_CONFIG = {
  // The address of the Account contract.
  accountAddress: config.protocol["arbitrum-sepolia"].tradeAccount,
  // The timeout for waiting for a response from the server ws.
  timeout: 15_000,
};

export type WebsocketListener = (message: string) => void;

type SubscriptionRequest<C> = {
  topic: string;
  params: unknown;
  listener: SubscriptionListener<C>;
};

type NonceMap = { [userAddress: string]: number | undefined };

export class TradeAdapterWebsocket implements TradeAdapter {
  private socket!: websocket.w3cwebsocket;
  private connectionPromise!: Promise<void>;
  private listeners: Array<WebsocketListener> = [];
  // TODO: manage one-to-many server-to-client subscriptions?
  private activeSubscriptions: Set<TradeSubscriptionId> = new Set();
  private subscriptionRequests: Array<SubscriptionRequest<any>> = [];
  protected resubscriptionResults: string[] = [];
  public provider: ethers.providers.Provider;
  private config = DEFAULT_CONFIG;
  private localNonces: NonceMap = {};

  private constructor(
    provider: ethers.providers.Provider,
    config = DEFAULT_CONFIG
  ) {
    this.provider = provider;
    this.config = config;
  }

  public static async create(
    wsUrl: string,
    provider: ethers.providers.Provider,
    config = DEFAULT_CONFIG
  ): Promise<TradeAdapterWebsocket> {
    const adapter = new TradeAdapterWebsocket(provider, config);
    await adapter.reconnect(wsUrl);
    return adapter;
  }

  public async waitForConnect(): Promise<void> {
    const isOpen = () => this.socket.readyState === websocket.w3cwebsocket.OPEN;
    if (isOpen()) {
      return;
    }
    // Check every 250 ms whether it is connected, or times out.
    return new Promise(async (resolve, reject) => {
      let hasResolved = false;
      let hasTimedOut = false;
      setTimeout(() => {
        if (hasResolved) {
          return;
        }
        hasTimedOut = true;
        reject();
      }, this.config.timeout);
      while (!hasTimedOut && !hasResolved) {
        await new Promise((r) => setTimeout(r, 250));
        if (isOpen()) {
          hasResolved = true;
          resolve();
        }
      }
    });
  }

  public async reconnect(newWsUrl?: string) {
    if (!newWsUrl && !this.socket) {
      throw new Error("No WS URL given for connection");
    }
    console.debug("[trade adapter] ws (re-)connection triggered");
    return new Promise<void>((resolve, reject) => {
      this.socket = new websocket.w3cwebsocket(newWsUrl ?? this.socket.url);
      this.socket.onmessage = (message) => {
        this.listeners.forEach((l) => l(message.data.toString()));
      };
      this.socket.onclose = (event) => {
        console.debug("[trade adapter] connection closed: ", event);
        // Only attempt to reconnect if the close was not expected/intentional.
        this.reconnect();
      };
      this.socket.onopen = async () => {
        await this.resubscribe();
        console.debug("[trade adapter]: connection (re-)established");
        resolve();
      };
      this.socket.onerror = (error) => {
        console.error("[trade adapter] error:", error);
        reject(error);
      };
    });
  }

  private async getUserNonce(signerAddress: string): Promise<BigNumber> {
    signerAddress = signerAddress.toLowerCase();
    const localNonce = this.localNonces[signerAddress] ?? 0;
    const remoteNonce = await Account__factory.connect(
      this.config.accountAddress,
      this.provider
    ).userNonce(signerAddress);
    if (remoteNonce.lt(localNonce)) {
      // The remote nonce is outdated.
      return BigNumber.from(localNonce);
    }
    // Ensure the local nonce is synced up to the remote nonce.
    this.localNonces[signerAddress] = remoteNonce.toNumber();
    return remoteNonce;
  }

  public async getOpenAccountMessage(signerAddress: string): Promise<Bytes> {
    const userNonce = await this.getUserNonce(signerAddress);
    return this.getUserRoleMessage(
      userNonce,
      OPEN_ACCOUNT_ID,
      TradeAccountRole.Open
    );
  }

  public async getDepositMessage(
    signerAddress: string,
    accountId: number
  ): Promise<Bytes> {
    const userNonce = await this.getUserNonce(signerAddress);
    return this.getUserRoleMessage(
      userNonce,
      accountId,
      TradeAccountRole.Deposit
    );
  }

  public async getWithdrawMessage(
    signerAddress: string,
    accountId: number
  ): Promise<Bytes> {
    const userNonce = await this.getUserNonce(signerAddress);
    return this.getUserRoleMessage(
      userNonce,
      accountId,
      TradeAccountRole.Withdraw
    );
  }

  public async getTradeMessage(
    signerAddress: string,
    accountId: number
  ): Promise<Bytes> {
    const userNonce = await this.getUserNonce(signerAddress);
    return this.getUserRoleMessage(
      userNonce,
      accountId,
      TradeAccountRole.Trader
    );
  }

  public async getAdminMessage(
    signerAddress: string,
    accountId: number
  ): Promise<Bytes> {
    const userNonce = await this.getUserNonce(signerAddress);
    return this.getUserRoleMessage(
      userNonce,
      accountId,
      TradeAccountRole.ProtocolAdmin
    );
  }

  public async getOwnerMessage(
    signerAddress: string,
    accountId: number
  ): Promise<Bytes> {
    const userNonce = await this.getUserNonce(signerAddress);
    return this.getUserRoleMessage(
      userNonce,
      accountId,
      TradeAccountRole.Owner
    );
  }

  private getUserRoleMessage(
    nonce: BigNumber,
    accountId: number,
    role: number
  ): Bytes {
    const message = utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "uint256", "uint8"],
      [MESSAGE_SCOPE, nonce, accountId, role]
    );
    const messageHash = utils.keccak256(message);
    return ethers.utils.arrayify(messageHash);
  }

  public async openAccount(
    amount: string,
    tokenAddress: string,
    ownerAddress: string,
    signature: string,
    referralCode?: string,
    useGasless?: boolean,
    psmToken?: string
  ): Promise<OpenAccountResponse> {
    return this.sendRequest({
      method: "openAccount",
      params: {
        amount,
        token: tokenAddress,
        owner: ownerAddress,
        useGasless: useGasless,
        referralCode,
        signature,
        psmToken,
      },
    });
  }

  public async deposit(
    amount: string,
    accountId: number,
    tokenAddress: string,
    depositorAddress: string,
    signature: string,
    useGasless?: boolean,
    psmToken?: string
  ): Promise<DepositResponse> {
    return this.sendRequest({
      method: "deposit",
      params: {
        amount,
        accountId: accountId,
        depositor: depositorAddress,
        token: tokenAddress,
        signature,
        useGasless,
        psmToken,
      },
    });
  }

  public async withdraw(
    amount: string,
    accountId: number,
    accountUser: string,
    tokenAddress: string,
    recipientAddress: string,
    signature: string,
    psmToken?: string
  ): Promise<WithdrawResponse> {
    return this.sendRequest({
      method: "withdraw",
      params: {
        amount,
        accountId: accountId,
        accountUser: accountUser,
        token: tokenAddress,
        recipient: recipientAddress,
        signature,
        psmToken,
      },
    });
  }

  public async trade(
    accountId: number,
    liquidityPoolId: string,
    size: TradeSize,
    pair: Pair,
    accountUser: string,
    signature: string
  ): Promise<TradeResponse> {
    const response = await this.sendRequest<TradeResponseContent>({
      method: "trade",
      params: {
        id: accountId,
        lpId: liquidityPoolId,
        size: size.serialize(),
        pair: pairToString(pair),
        accountUser: accountUser,
        signature,
      },
    });
    this.increaseLocalUserNonce(accountUser);
    return response;
  }

  public async grantAccountUserRole(
    accountId: number,
    user: string,
    role: TradeAccountRole,
    accountOwner: string,
    ownerSignature: string
  ): Promise<GrantAccountUserRoleResponse> {
    return this.sendRequest({
      method: "grantAccountUserRole",
      params: {
        // The trade server expects a string, not a number.
        role: TradeAccountRole[role],
        accountId,
        user,
        accountOwner,
        ownerSignature,
      },
    });
  }

  public async revokeAccountUserRole(
    accountId: number,
    user: string,
    role: TradeAccountRole,
    accountOwner: string,
    signature: string
  ): Promise<RevokeAccountUserRoleResponse> {
    return this.sendRequest({
      method: "revokeAccountUserRole",
      params: {
        accountId,
        user,
        role,
        accountOwner,
        signature,
      },
    });
  }

  public async setSystemParam(args: SetSystemParamArgs) {
    const signerAddress = await args.signer.getAddress();
    const message = await this.getAdminMessage(
      signerAddress,
      args.adminTradeAccountId
    );
    const signature = await args.signer.signMessage(message);
    const response = await this.sendRequest({
      method: "setSystemParam",
      params: {
        paramId: args.paramId,
        paramValue: args.paramValue.toHexString(),
        adminRequest: {
          tradeAccountId: args.adminTradeAccountId,
          admin: signerAddress,
          signature,
        },
      },
    });
    if (response?.error) {
      throw response.error;
    }
  }

  public async clearSystemParam(args: ClearSystemParamArgs) {
    const signerAddress = await args.signer.getAddress();
    const message = await this.getAdminMessage(
      signerAddress,
      args.adminTradeAccountId
    );
    const signature = await args.signer.signMessage(message);
    const response = await this.sendRequest({
      method: "clearSystemParam",
      params: {
        paramId: args.paramId,
        adminRequest: {
          tradeAccountId: args.adminTradeAccountId,
          admin: signerAddress,
          signature,
        },
      },
    });
    if (response?.error) {
      throw response.error;
    }
  }

  public async getLpConfig(): Promise<LpConfigUpdateResponse> {
    return this.sendRequest({
      method: "getLpConfig",
    });
  }

  /** This function has no validation that the returned type is T */
  private waitForRequestId<T>(
    requestId: string,
    timeout = this.config.timeout
  ): { result: Promise<T>; cancel: () => void } {
    // Make a ref object so that the callback can be updated in the promise.
    const cancelRef: { result: Promise<T> | null; cancel: () => void } = {
      cancel: () => {},
      result: null,
    };
    cancelRef.result = new Promise<T>((resolve, reject) => {
      let resolved = false;
      const removeListener = (listener: WebsocketListener) => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      };
      const listener = (raw: string) => {
        setTimeout(() => {
          if (resolved) return;
          removeListener(listener);
          reject(new Error("Timeout"));
        }, timeout);
        cancelRef.cancel = () => {
          removeListener(listener);
        };
        try {
          const response = JSON.parse(raw) as Response<unknown> & T;
          if (response.id !== requestId) {
            return;
          }
          removeListener(listener);
          resolved = true;
          resolve(response);
        } catch (e) {
          removeListener(listener);
          return reject(e);
        }
      };
      this.listeners.push(listener);
    });
    return cancelRef as { result: Promise<T>; cancel: () => void };
  }

  public close() {
    this.socket.close();
  }

  public async subscribeToAccount(
    accountId: number,
    listener: AccountListener
  ): Promise<TradeSubscriptionId> {
    const subscriptionId = await this.subscribe({
      topic: "tradeAccount",
      params: accountId,
      listener,
    });
    return subscriptionId;
  }

  public subscribeToLp(
    lpId: LpId,
    listener: LpListener
  ): Promise<TradeSubscriptionId> {
    return this.subscribe({
      topic: "liquidityPool",
      params: lpId,
      listener,
    });
  }

  public cancelSubscription(subscriptionId: TradeSubscriptionId): void {
    this.activeSubscriptions.delete(subscriptionId);
  }

  private async subscribe<C>(
    request: SubscriptionRequest<C>
  ): Promise<TradeSubscriptionId> {
    // Store the request for re-subscription
    this.pushUniqueSubscriptionRequest(request);
    const payload = {
      method: "subscribe",
      params: {
        topic: request.topic,
        params: request.params,
      },
    };
    console.debug("[trade adapter] sending (re-)subscription request", request);
    const response = await this.sendRequest<TradeSubscriptionId>(payload);
    if (response.error) {
      throw new Error(response.error);
    }
    const subscriptionId = response.result!.content;
    // Setup listener.
    this.setupSubscriptionListener(subscriptionId, request.listener).catch(
      console.error
    );
    console.debug("[trade adapter] received subscription id", response);
    return subscriptionId;
  }

  private pushUniqueSubscriptionRequest<C>(request: SubscriptionRequest<C>) {
    const isExisting = this.subscriptionRequests.some((r) =>
      isSameSubscriptionRequest(r, request)
    );
    if (isExisting) {
      return;
    }
    this.subscriptionRequests.push(request);
  }

  private async resubscribe() {
    console.debug("[trade adapter] ws re-subscription triggered");
    this.resubscriptionResults = await Promise.all(
      this.subscriptionRequests.map((request) => this.subscribe(request))
    );
    return this.resubscriptionResults;
  }

  private async sendRequestRetry(stringifiedRequest: string) {
    let lastError: unknown;
    let success = false;
    for (let i = 0; i < MAX_SOCKET_SEND_TRIES; i++) {
      try {
        this.socket.send(stringifiedRequest);
        success = true;
        break;
      } catch (e) {
        lastError = e;
      }
      await new Promise((r) => setTimeout(r, SOCKET_RETRY_DELAY));
    }
    if (!success) {
      throw lastError;
    }
  }

  private async sendRequest<C>(request: Request): Promise<Response<C>> {
    const requestId = request.id ?? randomId();
    if (!request.id) {
      request.id = requestId;
    }
    await this.connectionPromise;
    await this.sendRequestRetry(JSON.stringify(request));
    return this.waitForRequestId<Response<C>>(requestId).result;
  }

  /**
   * Sets up a listener for the subscription.
   * The listener will loop through sever updates for as long as the client
   * keeps the subscription active.
   * When called, this function should not be awaited as it is meant to be
   * executed as a background task.
   * @private
   */
  private async setupSubscriptionListener<C>(
    subscriptionId: TradeSubscriptionId,
    listener: SubscriptionListener<C>
  ) {
    // Because this is setting up the subscription, it sets it as active.
    this.activeSubscriptions.add(subscriptionId);
    const wsListener = (raw: string) => {
      const response = JSON.parse(raw) as PublicationResponse<C>;
      if (response.id !== subscriptionId) {
        return;
      }
      if (response.error) {
        console.error(`[trade adapter] subscription error:`, response);
        return;
      }
      const result = response.result!;
      const content = result.content.content;
      listener(content, result.content.topic);
    };
    this.listeners.push(wsListener);
    // Over the lifetime of this function, the subscription may be cancelled.
    const isActive = () => this.activeSubscriptions.has(subscriptionId);
    // Fire background task to periodically check for subscription status.
    while (isActive()) {
      // While the subscription is active, wait.
      // The waiting interval here is the timeout but this is not really
      // a timeout, but rather it is just an arbitrary waiting period.
      await new Promise((resolve) => setTimeout(resolve, this.config.timeout));
    }
    // The subscription has been cancelled by the client.
    this.listeners = this.listeners.filter((l) => l !== wsListener);
  }

  private increaseLocalUserNonce(address: string) {
    address = address.toLowerCase();
    const currentValue = this.localNonces[address] ?? 0;
    this.localNonces[address] = currentValue + 1;
  }
}

const randomId = (len = 6) =>
  Math.random()
    .toString(36)
    .substring(len + 1);

const isSameSubscriptionRequest = <C>(
  a: SubscriptionRequest<C>,
  b: SubscriptionRequest<C>
) =>
  a.topic === b.topic &&
  a.listener === b.listener &&
  JSON.stringify(a.params) === JSON.stringify(b.params);
