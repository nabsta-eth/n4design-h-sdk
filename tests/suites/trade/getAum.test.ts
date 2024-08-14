import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { calculateAum } from "../../../src/components/trade/platforms/hlp/internals/getAum";
import { parseUnits } from "ethers/lib/utils";
import { PRICE_UNIT } from "../../../src/components/trade/platforms/legacyInterface";

const tokenPrice = PRICE_UNIT;
const tokenAmount = parseUnits("10", 18);
const tenDollarAumToken = {
  averagePrice: tokenPrice,
  price: tokenPrice,
  address: "",
  isWhitelisted: true,
  tokenDecimals: 18,
  tokenWeight: 1,
  minProfitBasisPoints: 0,
  maxUsdHlpAmount: tokenAmount,
  isStable: true,
  isShortable: false,
  poolAmount: tokenAmount,
  size: tokenAmount,
  guaranteedUsd: tokenAmount,
  reservedAmount: tokenAmount,
};

describe("getAum", () => {
  it("has no assets under management", () => {
    const aum = calculateAum([], constants.Zero, constants.Zero);
    expect(aum.eq(constants.Zero)).to.be.true;
  });
  it("has one $10 asset under management", () => {
    const aum = calculateAum(
      [tenDollarAumToken],
      constants.Zero,
      constants.Zero
    );
    const aumExpected = tokenPrice.mul(10); // price of 1 x $10 tokens
    expect(aum.eq(aumExpected)).to.be.true;
  });
  it("has two $10 assets under management", () => {
    const aum = calculateAum(
      [tenDollarAumToken, tenDollarAumToken],
      constants.Zero,
      constants.Zero
    );
    const aumExpected = tokenPrice.mul(20); // price of 2 x $10 tokens
    expect(aum.eq(aumExpected)).to.be.true;
  });
  it("has many assets under management (maximum price)", () => {
    const aumExpected = BigNumber.from("52336567557216789424777171831303458");
    const tokens = [
      {
        address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
        isWhitelisted: true,
        price: BigNumber.from("1641584142000000000000000000000000"),
        poolAmount: BigNumber.from("4345913623647142037"),
        tokenDecimals: 18,
        isStable: false,
        size: BigNumber.from("0"),
        averagePrice: BigNumber.from("1612530426067214912166453638977828"),
        guaranteedUsd: BigNumber.from("1146270757011123290466530838000000"),
        reservedAmount: BigNumber.from("870774554378844534"),
      },
      {
        address: "?",
        isWhitelisted: true,
        price: BigNumber.from("682080870000000000000000000000"),
        poolAmount: BigNumber.from("9501256525319077473443"),
        tokenDecimals: 18,
        isStable: false,
        size: constants.Zero,
        averagePrice: BigNumber.from("687356150000000000000000000000"),
        guaranteedUsd: constants.Zero,
        reservedAmount: constants.Zero,
      },
      {
        address: "0x3d147cd9ac957b2a5f968de9d1c6b9d0872286a0",
        isWhitelisted: true,
        price: BigNumber.from("17530000000000000000000000000"),
        poolAmount: BigNumber.from("7073447371217772166217"),
        tokenDecimals: 18,
        isStable: false,
        size: constants.Zero,
        averagePrice: constants.Zero,
        guaranteedUsd: constants.Zero,
        reservedAmount: constants.Zero,
      },
      {
        address: "0x116172b2482c5dc3e6f445c16ac13367ac3fcd35",
        isWhitelisted: true,
        price: BigNumber.from("1008303900000000000000000000000"),
        poolAmount: BigNumber.from("10814796917423697963617"),
        tokenDecimals: 18,
        isStable: false,
        size: BigNumber.from("23933717387923804613205803200000000"),
        averagePrice: BigNumber.from("992647801789558276608390303761"),
        guaranteedUsd: constants.Zero,
        reservedAmount: constants.Zero,
      },
      {
        address: "0xf4e8ba79d058fff263fd043ef50e1010c1bdf991",
        isWhitelisted: true,
        price: BigNumber.from("721000000000000000000000000"),
        poolAmount: constants.Zero,
        tokenDecimals: 18,
        isStable: false,
        size: constants.Zero,
        averagePrice: constants.Zero,
        guaranteedUsd: constants.Zero,
        reservedAmount: constants.Zero,
      },
      {
        address: "0x2c29daace6aa05e3b65743efd61f8a2c448302a3",
        isWhitelisted: true,
        price: BigNumber.from("144020000000000000000000000000"),
        poolAmount: BigNumber.from("6993000000000000000000"),
        tokenDecimals: 18,
        isStable: false,
        size: constants.Zero,
        averagePrice: constants.Zero,
        guaranteedUsd: constants.Zero,
        reservedAmount: constants.Zero,
      },
      {
        address: "0x8c414cb8a9af9f7b03673e93df73c23c1aa05b4e",
        isWhitelisted: true,
        price: BigNumber.from("1035930000000000000000000000000"),
        poolAmount: constants.Zero,
        tokenDecimals: 18,
        isStable: false,
        size: constants.Zero,
        averagePrice: constants.Zero,
        guaranteedUsd: constants.Zero,
        reservedAmount: constants.Zero,
      },
      {
        address: "0x8616e8ea83f048ab9a5ec513c9412dd2993bce3f",
        isWhitelisted: true,
        price: BigNumber.from("1000000000000000000000000000000"),
        poolAmount: BigNumber.from("26591723027091341011372"),
        tokenDecimals: 18,
        isStable: true,
        size: constants.Zero,
        averagePrice: constants.Zero,
        guaranteedUsd: constants.Zero,
        reservedAmount: BigNumber.from("23933717387923804613205"),
      },
    ];
    const aum = calculateAum(tokens, constants.Zero, constants.Zero);
    expect(`${aum}`).to.equal(`${aumExpected}`);
  });
});
