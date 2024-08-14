import { task } from "hardhat/config";
import { pairFromString } from "../src/utils/general";
import { fetchEncodedSignedQuotes } from "../src/components/h2so";
import { getHlpContracts } from "../src/components/trade/platforms/hlp/config";

task("fetch-signed-quote")
  .addParam("pairs")
  .setAction(async ({ pairs }, _hre) => {
    pairs = pairs.split(",");
    const { encoded } = await fetchEncodedSignedQuotes(
      pairs.map(pairFromString)
    );
    console.log("data: ", encoded);
  });

task("try-submit-signed-quote")
  .addParam("pairs")
  .addParam("privatekey")
  .setAction(async ({ pairs, privatekey }, hre) => {
    pairs = pairs.split(",");
    const data = await fetchEncodedSignedQuotes(pairs.map(pairFromString));
    console.log("data: ", data);
    const { vaultPriceFeed } = getHlpContracts("arbitrum");
    const signer = new hre.ethers.Wallet(privatekey, hre.ethers.provider);
    await vaultPriceFeed.connect(signer).h2sofaApplySignedQuote(data.encoded);
  });
