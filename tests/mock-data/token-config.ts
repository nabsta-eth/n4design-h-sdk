import { exit } from "process";
import HandleTokenManager from "../../src/components/token-manager/HandleTokenManager";
import { loadTokens } from "../suites/convert/test-tokens";
import { HlpConfig } from "../../src/components/trade/platforms/hlp/config";
import { BASIS_POINTS_DIVISOR } from "../../src/constants";
import { PRICE_UNIT } from "../../src/components/trade/platforms/legacyInterface";

export const testTokenList = new HandleTokenManager();

export const TEST_CONFIG: HlpConfig = {
  marginFeeBasisPoints: 10,
  swapFeeBasisPoints: 20,
  stableSwapFeeBasisPoints: 1,
  maxLeverage: 50 * BASIS_POINTS_DIVISOR,
  mintBurnFeeBasisPoints: 20,
  taxBasisPoints: 10,
  stableTaxBasisPoints: 5,
  minProfitTime: 60,
  liquidationFee: PRICE_UNIT.mul(2),
};

testTokenList.initialLoad
  .then(() => {
    loadTokens();
    run();
  })
  .catch((e) => {
    console.error(e);
    exit(1);
  });
