import { ethers } from "ethers";
import { Collateral, CollateralSymbol, ProtocolParameters } from "../../src";
import { FxToken } from "../../src";
import { VaultCollateralToken, VaultData } from "../../src/types/vaults";

export const createMockCollateral = (
  overrides: Partial<Collateral> = {}
): Collateral => {
  return {
    symbol: `COLLATERAL_${randomId()}` as unknown as CollateralSymbol,
    address: ethers.Wallet.createRandom().address,
    decimals: 18,
    chainId: 1,
    name: "Mock Collateral",
    mintCR: ethers.BigNumber.from("200"),
    liquidationFee: ethers.BigNumber.from("1250"),
    interestRate: ethers.BigNumber.from("25"),
    price: ethers.constants.WeiPerEther,
    ...overrides,
  };
};

export const createMockCollaterals = (overrides: Partial<Collateral>[]) => {
  return overrides.map(createMockCollateral);
};

export const createMockFxToken = (
  overrides: Partial<FxToken> = {}
): FxToken => {
  const id = randomId();
  return {
    name: `FX_TOKEN_${id}`,
    symbol: `FX_${id}`,
    address: ethers.Wallet.createRandom().address,
    decimals: 18,
    chainId: 1,
    price: ethers.constants.WeiPerEther,
    ...overrides,
  };
};

export const createVaultCollateralFromCollateral = (
  collateral: Collateral,
  amount: ethers.BigNumber
): VaultCollateralToken<CollateralSymbol> => {
  return {
    symbol: collateral.symbol,
    decimals: collateral.decimals,
    address: collateral.address,
    amount,
    chainId: 1,
    name: "Vault Collateral Token",
  };
};

export const createMockVaultData = (
  debt: ethers.BigNumber,
  collateral: VaultCollateralToken<CollateralSymbol>[]
): VaultData => {
  return {
    account: "0x3e5c9ced70887166612ced5b537fb294dcecb357",
    fxToken: {
      symbol: "MOCK_FX_TOKEN",
      address: ethers.Wallet.createRandom().address,
      decimals: 18,
      chainId: 1,
      name: "Mock Fx Token",
      price: ethers.constants.WeiPerEther,
    },
    debt,
    collateral,
  };
};

export const createMockVaultDataFromMockCollaterals = (
  debt: ethers.BigNumber,
  collateral: Collateral[],
  amounts: ethers.BigNumber[]
) => {
  const vaultCollaterals = collateral.map((c, i) =>
    createVaultCollateralFromCollateral(c, amounts[i])
  );

  return createMockVaultData(debt, vaultCollaterals);
};

export const createMockProtocolParams = (
  overrides: Partial<ProtocolParameters> = {}
): ProtocolParameters => {
  return {
    mintFee: ethers.constants.Zero,
    burnFee: ethers.constants.Zero,
    withdrawFee: ethers.constants.Zero,
    depositFee: ethers.constants.Zero,
    minimumMintingAmountAsEth: ethers.constants.Zero,
    ...overrides,
  };
};

const randomId = () => Math.floor(Math.random() * 1e8);
