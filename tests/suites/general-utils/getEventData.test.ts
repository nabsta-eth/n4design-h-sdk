import { BigNumber, ContractReceipt } from "ethers";
import { expect } from "chai";
import { ReferrerAccountOpenedEvent } from "../../../src/contracts/Referrals";
import { getEventData } from "../../../src/utils/web3";
import { Referrals__factory } from "../../../src/contracts";

const CONTRACT_RECEIPT = {
  to: "0x891aefD9B384544694F47FF83C5B34e950eAF888",
  from: "0x9eD02c83f797F34d9426e5Fea2a7559e9a1ec620",
  contractAddress: null,
  transactionIndex: 8,
  gasUsed: BigNumber.from("0x02697c"),
  logsBloom:
    "0x000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000c0200000000000000000000000000000000000000008000000000000000000000100000000000000000000000000020000000000000400000800000000000002000000000010000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004800000000040000002000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000040000000000000",
  blockHash:
    "0xd71e7e0f79091eaeedb6690cbc007dfee009fe476d730033ce4c7a50c77bc3c6",
  transactionHash:
    "0xb57dd17e9605f8651685f7eae045a2f217fefe0507d8853745a487481ff407cb",
  logs: [
    {
      transactionIndex: 8,
      blockNumber: 4002203,
      transactionHash:
        "0xb57dd17e9605f8651685f7eae045a2f217fefe0507d8853745a487481ff407cb",
      address: "0x891aefD9B384544694F47FF83C5B34e950eAF888",
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000009ed02c83f797f34d9426e5fea2a7559e9a1ec620",
        "0x0000000000000000000000000000000000000000000000000000000000000008",
      ],
      data: "0x",
      logIndex: 15,
      blockHash:
        "0xd71e7e0f79091eaeedb6690cbc007dfee009fe476d730033ce4c7a50c77bc3c6",
    },
    {
      transactionIndex: 8,
      blockNumber: 4002203,
      transactionHash:
        "0xb57dd17e9605f8651685f7eae045a2f217fefe0507d8853745a487481ff407cb",
      address: "0x891aefD9B384544694F47FF83C5B34e950eAF888",
      topics: [
        "0x9a7432bf07854f45908bbf46b0065e7f327449b76270d7285562745015be663a",
        "0x0000000000000000000000009ed02c83f797f34d9426e5fea2a7559e9a1ec620",
      ],
      data: "0x00000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000",
      logIndex: 16,
      blockHash:
        "0xd71e7e0f79091eaeedb6690cbc007dfee009fe476d730033ce4c7a50c77bc3c6",
    },
  ],
  blockNumber: 4002203,
  confirmations: 1,
  cumulativeGasUsed: BigNumber.from("0x0fa246"),
  effectiveGasPrice: BigNumber.from("0x59682f09"),
  status: 1,
  type: 2,
  byzantium: true,
  events: [
    {
      transactionIndex: 8,
      blockNumber: 4002203,
      transactionHash:
        "0xb57dd17e9605f8651685f7eae045a2f217fefe0507d8853745a487481ff407cb",
      address: "0x891aefD9B384544694F47FF83C5B34e950eAF888",
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x0000000000000000000000009ed02c83f797f34d9426e5fea2a7559e9a1ec620",
        "0x0000000000000000000000000000000000000000000000000000000000000008",
      ],
      data: "0x",
      logIndex: 15,
      blockHash:
        "0xd71e7e0f79091eaeedb6690cbc007dfee009fe476d730033ce4c7a50c77bc3c6",
      args: [
        "0x0000000000000000000000000000000000000000",
        "0x9eD02c83f797F34d9426e5Fea2a7559e9a1ec620",
        BigNumber.from("0x08"),
      ],
      event: "Transfer",
      eventSignature: "Transfer(address,address,uint256)",
    },
    {
      transactionIndex: 8,
      blockNumber: 4002203,
      transactionHash:
        "0xb57dd17e9605f8651685f7eae045a2f217fefe0507d8853745a487481ff407cb",
      address: "0x891aefD9B384544694F47FF83C5B34e950eAF888",
      topics: [
        "0x9a7432bf07854f45908bbf46b0065e7f327449b76270d7285562745015be663a",
        "0x0000000000000000000000009ed02c83f797f34d9426e5fea2a7559e9a1ec620",
      ],
      data: "0x00000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000",
      logIndex: 16,
      blockHash:
        "0xd71e7e0f79091eaeedb6690cbc007dfee009fe476d730033ce4c7a50c77bc3c6",
      args: [
        "0x9eD02c83f797F34d9426e5Fea2a7559e9a1ec620",
        BigNumber.from("0x08"),
        BigNumber.from("0x00"),
      ],
      event: "ReferrerAccountOpened",
      eventSignature: "ReferrerAccountOpened(address,uint256,uint256)",
    },
  ],
} as unknown as ContractReceipt;

describe("getEventData", () => {
  it("should be able to get event data from contract receipt", () => {
    const contractInterface = Referrals__factory.createInterface();
    const eventData = getEventData<ReferrerAccountOpenedEvent>(
      "ReferrerAccountOpened",
      contractInterface,
      CONTRACT_RECEIPT
    );
    expect(eventData).not.to.be.null;
    if (!eventData) {
      throw new Error("eventData is null");
    }
    expect(eventData.args.owner).to.equal(
      "0x9eD02c83f797F34d9426e5Fea2a7559e9a1ec620"
    );
    expect(eventData.args.referrerId.toNumber()).to.equal(8);
    expect(eventData.args.parentReferrerId.toNumber()).to.equal(0);
  });
});
