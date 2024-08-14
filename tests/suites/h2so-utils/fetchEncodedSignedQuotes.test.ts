import { pairFromString } from "../../../src/utils/general";
import { expect } from "chai";
import { fetchEncodedSignedQuotes } from "../../../src/components/h2so";
import { HandleTokenManager } from "../../../src";

xdescribe("h2so: fetchEncodedSignedQuotes", () => {
  it("should fetch encoded signed quotes for all hLP tokens", async () => {
    const { encoded } = await fetchEncodedSignedQuotes(
      new HandleTokenManager()
        .getHlpTokens("arbitrum")
        .map(({ symbol }) => pairFromString(`${symbol}/USD`))
    );
    expect(encoded.length).to.be.gt(0);
  });
});
