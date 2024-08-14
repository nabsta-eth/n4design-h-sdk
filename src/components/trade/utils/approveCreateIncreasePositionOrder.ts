import { ethers, PopulatedTransaction } from "ethers";
import { isEtherAddress } from ".";
import { ERC20__factory } from "../../../contracts";
import { ApproveIncreasePositionArgs } from "../platforms/legacyInterface";

type OrderBook = {
  address: string;
};

type Router = {
  approvedPlugins: (arg1: string, arg2: string) => Promise<boolean>;
  populateTransaction: {
    approvePlugin: (arg1: string) => Promise<PopulatedTransaction>;
  };
  address: string;
};

export const approveCreateIncreasePositionOrder = async (
  args: ApproveIncreasePositionArgs,
  { orderBook, router }: { orderBook: OrderBook; router: Router }
): Promise<PopulatedTransaction[]> => {
  const address = await args.signer.getAddress();
  const isEth = isEtherAddress(args.collateralAddress);
  const approveTxs: PopulatedTransaction[] = [];
  const isApproved = await router.approvedPlugins(address, orderBook.address);
  if (!isApproved) {
    approveTxs.push(
      await router.populateTransaction.approvePlugin(orderBook.address)
    );
  }
  const erc20 = ERC20__factory.connect(args.collateralAddress, args.signer);
  if (!isEth) {
    // The Router transfers the funds via plugin, so the allowance to the
    // OrderBook is irrelevant.
    const existingAllowance = await erc20.allowance(address, router.address);
    if (existingAllowance.lt(args.collateralDelta)) {
      approveTxs.push(
        await erc20.populateTransaction.approve(
          router.address,
          args.maximise ? ethers.constants.MaxUint256 : args.collateralDelta
        )
      );
    }
  }
  return approveTxs;
};
