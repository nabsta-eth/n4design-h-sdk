import axios from "axios";
import {
  ethers,
  Signer,
  providers,
  BigNumber,
  ContractTransaction,
} from "ethers";
import sdkConfig, { FxTokenAddressMap } from "../config";
import { BridgeNetwork, BridgeNetworkMap } from "..";
import { Bridge__factory, ERC20__factory } from "../contracts";
import { DepositEvent } from "../contracts/Bridge";
import { getFxTokenSymbolFromAddress } from "../utils/fxToken";

export type BridgeConfigByNetwork = BridgeNetworkMap<{
  address: string;
  id: number;
}>;

export type BridgeConfig = {
  apiBaseUrl: string;
  byNetwork: BridgeConfigByNetwork;
  forexAddress: string;
  fxTokenAddresses: FxTokenAddressMap;
};

export type BridgeDepositArguments = {
  fromNetwork: BridgeNetwork;
  toNetwork: BridgeNetwork;
  tokenSymbol: string;
  amount: BigNumber;
};

export type BridgeWithdrawArguments = {
  tokenSymbol: string;
  amount: BigNumber;
  nonce: BigNumber;
  fromNetwork: BridgeNetwork;
  toNetwork: BridgeNetwork;
  signature: string;
  address?: string;
};

export type BridgeGetNonceArguments = {
  fromNetwork: BridgeNetwork;
  toNetwork: BridgeNetwork;
  address?: string;
};

type DepositEventData = DepositEvent["args"] & {
  txHash: string;
};

export type PendingWithdrawal = {
  txHash: string;
  tokenSymbol: string;
  amount: BigNumber;
  nonce: BigNumber;
  fromNetwork: BridgeNetwork;
  toNetwork: BridgeNetwork;
};

export default class Bridge {
  public config: BridgeConfig;

  constructor(c?: BridgeConfig) {
    this.config = c || {
      apiBaseUrl: sdkConfig.bridge.apiBaseUrl,
      forexAddress: sdkConfig.forexAddress,
      byNetwork: sdkConfig.bridge.byNetwork,
      fxTokenAddresses: sdkConfig.fxTokenAddresses,
    };
  }

  public deposit = async (
    args: BridgeDepositArguments,
    signer: Signer,
    options: ethers.Overrides = {}
  ): Promise<ContractTransaction> => {
    const depositBridge = this.getBridgeContract(args.fromNetwork, signer);
    const tokenAddress = this.getTokenAddress(args.tokenSymbol);
    const isAmountSufficient = await this.doesDepositMeetMinimumAmount(
      args.tokenSymbol,
      args.amount,
      args.toNetwork
    );
    if (!isAmountSufficient)
      throw new Error("Deposit amount lower than withdrawal fee");
    return depositBridge.deposit(
      tokenAddress,
      args.amount,
      this.config.byNetwork[args.toNetwork].id,
      options
    );
  };

  /// A minimum amount must be enforced due to the withdrawal fees.
  public doesDepositMeetMinimumAmount = async (
    tokenSymbol: string,
    amount: BigNumber,
    withdrawNetwork: BridgeNetwork
  ): Promise<boolean> =>
    amount.gt(await this.getTokenFee(tokenSymbol, withdrawNetwork));

  /// Returns the withdraw token fee for the input network.
  public getTokenFee = async (
    tokenSymbol: string,
    withdrawNetwork: BridgeNetwork
  ): Promise<BigNumber> =>
    this.getBridgeContract(
      withdrawNetwork,
      sdkConfig.providers[withdrawNetwork]!
    ).tokenFees(this.getTokenAddress(tokenSymbol));

  public withdraw = async (
    args: BridgeWithdrawArguments,
    signer: Signer,
    options: ethers.Overrides = {}
  ): Promise<ContractTransaction> => {
    const bridgeContract = this.getBridgeContract(args.toNetwork, signer);
    const tokenAddress = this.getTokenAddress(args.tokenSymbol);
    const address = args.address ?? (await signer.getAddress());
    return bridgeContract.withdraw(
      address,
      tokenAddress,
      args.amount,
      args.nonce,
      this.config.byNetwork[args.fromNetwork].id,
      ethers.utils.arrayify(args.signature),
      options
    );
  };

  public requestAutomaticWithdraw = async (
    network: BridgeNetwork,
    txHash: string
  ) => {
    const endpoint = `${this.config.apiBaseUrl}/withdraw`;
    const queryString = `network=${network}&transactionHash=${txHash}`;
    const response = await axios.put(`${endpoint}?${queryString}`);
    if (!response.data || !response.data.withdrawalTransactionHash)
      throw new Error("Automatic withdrawal request failed");
    return response.data.withdrawalTransactionHash;
  };

  public getDepositAllowance = (
    account: string,
    token: string,
    network: BridgeNetwork,
    signer: Signer
  ): Promise<BigNumber> => {
    const tokenAddress = this.getTokenAddress(token);
    const bridgeAddress = this.config.byNetwork[network].address;
    const contract = ERC20__factory.connect(tokenAddress, signer);
    return contract.allowance(account, bridgeAddress);
  };

  public setDepositAllowance = (
    token: string,
    network: BridgeNetwork,
    amount: BigNumber,
    signer: Signer,
    options: ethers.Overrides = {}
  ): Promise<ContractTransaction> => {
    const tokenAddress = this.getTokenAddress(token);
    const bridgeAddress = this.config.byNetwork[network].address;
    const tokenContract = ERC20__factory.connect(tokenAddress, signer);
    return tokenContract.approve(bridgeAddress, amount, options);
  };

  public getPendingWithdrawals = async (
    account: string,
    signers: BridgeNetworkMap<Signer>
  ): Promise<PendingWithdrawal[]> => {
    const depositEventPromises = Object.keys(signers).map((n) => {
      const network = n as BridgeNetwork;
      return this.getPendingWithdrawsForNetwork(account, network, signers);
    });

    const results = await Promise.all(depositEventPromises);
    return results.reduce((acc, curr) => [...acc, ...curr], []);
  };

  public getWithdrawSignature = async (
    network: BridgeNetwork,
    txHash: string
  ) => {
    const { data } = await axios.get(
      `${this.config.apiBaseUrl}/sign?network=${network}&transactionHash=${txHash}`
    );
    return data.signature;
  };

  public getWithdrawNonce = async (
    args: BridgeGetNonceArguments,
    signer: Signer
  ): Promise<BigNumber> => {
    const bridgeContract = this.getBridgeContract(args.toNetwork, signer);
    const account = args.address ?? (await signer.getAddress());
    return bridgeContract.withdrawNonce(
      account,
      this.config.byNetwork[args.fromNetwork].id
    );
  };

  private getPendingWithdrawsForNetwork = async (
    account: string,
    network: BridgeNetwork,
    signers: BridgeNetworkMap<Signer>
  ): Promise<PendingWithdrawal[]> => {
    const signer = signers[network];
    const bridgeContract = this.getBridgeContract(network, signer);
    const fromBlock =
      network === "polygon"
        ? (await signer.provider!.getBlockNumber()) - 1990
        : undefined;

    const filter = bridgeContract.filters.Deposit(account);

    const rawEvents = await bridgeContract.queryFilter(filter, fromBlock);

    const events: DepositEventData[] = rawEvents.map(
      (event) =>
        ({
          txHash: event.transactionHash,
          ...(bridgeContract.interface.parseLog(event)
            .args as unknown as DepositEvent["args"]),
        } as DepositEventData)
    );

    const eventsByNetwork = events.reduce((progress, event) => {
      const property = this.bridgeIdToNetwork(event.toId.toNumber());
      const values = progress[property] || [];
      return {
        ...progress,
        [property]: [...values, event],
      };
    }, {} as Partial<BridgeNetworkMap<DepositEventData[]>>);

    const networksWithEvents = Object.keys(eventsByNetwork) as BridgeNetwork[];

    const withdrawCounts = await Promise.all(
      networksWithEvents
        .filter((n) => n !== network)
        .map((n) => {
          const bc = this.getBridgeContract(n, signers[n]);
          return bc.withdrawNonce(account, this.config.byNetwork[network].id);
        })
    );

    const withdrawCountsByNetwork = withdrawCounts.reduce(
      (progress, count, index) => {
        return {
          ...progress,
          [networksWithEvents[index]]: Number(count.toString()),
        };
      },
      {} as Partial<BridgeNetworkMap<number>>
    );

    const pendingWithdraws = networksWithEvents.reduce((progress, network) => {
      const events = eventsByNetwork[network];
      const depositCount = events?.length || 0;
      const withdrawCount = withdrawCountsByNetwork[network || 0];
      const pendingCount = depositCount - (withdrawCount || 0);

      const pendingEvents =
        events?.slice(events.length - pendingCount, events.length) || [];

      return [...progress, ...pendingEvents];
    }, [] as DepositEventData[]);

    return pendingWithdraws.map((pw) => ({
      txHash: pw.txHash,
      tokenSymbol: this.getTokenSymbolFromAddress(pw.token),
      amount: pw.amount,
      nonce: pw.nonce,
      fromNetwork: this.bridgeIdToNetwork(pw.fromId.toNumber()),
      toNetwork: this.bridgeIdToNetwork(pw.toId.toNumber()),
    }));
  };

  private getTokenAddress = (token: string) => {
    const tokenAddress =
      token === "FOREX"
        ? this.config.forexAddress
        : this.config.fxTokenAddresses[token];

    if (!tokenAddress) {
      throw new Error(`Invalid token symbol: ${token}`);
    }

    return tokenAddress;
  };

  private getTokenSymbolFromAddress = (tokenAddress: string): string => {
    if (tokenAddress === this.config.forexAddress) {
      return "FOREX";
    }

    return getFxTokenSymbolFromAddress(
      tokenAddress,
      this.config.fxTokenAddresses
    );
  };

  public getBridgeContract = (
    network: BridgeNetwork,
    signerOrProvider: Signer | providers.Provider
  ) =>
    Bridge__factory.connect(
      this.config.byNetwork[network].address,
      signerOrProvider
    );

  private bridgeIdToNetwork = (bridgeId: number): BridgeNetwork => {
    const networkNames = Object.keys(this.config.byNetwork);
    const ids = Object.values(this.config.byNetwork).map((x) => x.id);
    const index = ids.indexOf(bridgeId);
    return networkNames[index] as BridgeNetwork;
  };
}
