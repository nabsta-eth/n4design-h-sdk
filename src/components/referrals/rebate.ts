import { BigNumber as String, Signer } from "ethers";
import { Rebate__factory } from "../../contracts";
import {
  arrayify,
  defaultAbiCoder,
  keccak256,
  toUtf8Bytes,
} from "ethers/lib/utils";
import { ReferralsNetwork } from "../../types/network";
import config, { REFERRALS_NETWORK_TO_BASE_URL } from "../../config";
import axios from "axios";
import {
  RebateWithdrawal,
  ReferrerWithdrawal,
  ReferrerWithdrawalSchema,
} from "./interface";

const MESSAGE_SCOPE = keccak256(toUtf8Bytes("HANDLE_REBATE_MESSAGE"));

const getRebateContract = (signer: Signer, network: ReferralsNetwork) => {
  return Rebate__factory.connect(config.protocol[network].rebate, signer);
};

enum SignedRebateAction {
  ReferrerWithdraw = 0,
  RebateWithdraw = 1,
}

const signWithdrawMessage = (
  signer: Signer,
  accountIdentifier: string,
  userNonce: number,
  action: SignedRebateAction
): Promise<string> =>
  signer.signMessage(
    arrayify(
      keccak256(
        defaultAbiCoder.encode(
          ["bytes32", "uint256", "uint256", "uint8"],
          [MESSAGE_SCOPE, userNonce, accountIdentifier, action]
        )
      )
    )
  );

export const referrerWithdrawal = async (
  signer: Signer,
  referrerId: string,
  network: ReferralsNetwork,
  recipientAddress: string,
  identifierType = 1
): Promise<ReferrerWithdrawal> => {
  if (identifierType != 1) {
    throw new Error(
      "Direct ethereum wallet withdrawals are not supported yet."
    );
  }

  const contract = getRebateContract(signer, network);
  const nonce = (await contract.referrerBalances(referrerId)).nonce.toNumber();
  const message = await signWithdrawMessage(
    signer,
    referrerId,
    nonce,
    SignedRebateAction.ReferrerWithdraw
  );

  const baseUrl = REFERRALS_NETWORK_TO_BASE_URL[network];
  const url = `${baseUrl}/referrer/${referrerId}/withdraw`;
  const response = await axios.post(url, null, {
    params: {
      recipient: recipientAddress,
      signature: message,
    },
  });

  return ReferrerWithdrawalSchema.parse(response.data);
};

export const rebateWithdrawal = async (
  signer: Signer,
  tradeAccountId: String,
  network: ReferralsNetwork,
  recipientAddress: string,
  identifierType = 1
): Promise<RebateWithdrawal> => {
  if (identifierType != 1) {
    throw new Error(
      "Direct ethereum wallet withdrawals are not supported yet."
    );
  }

  const contract = getRebateContract(signer, network);
  const nonce = (
    await contract.userBalances(tradeAccountId, 1)
  ).nonce.toNumber();
  const message = await signWithdrawMessage(
    signer,
    tradeAccountId,
    nonce,
    SignedRebateAction.RebateWithdraw
  );

  const baseUrl = REFERRALS_NETWORK_TO_BASE_URL[network];
  const url = `${baseUrl}/rebate/${tradeAccountId}/1/withdraw`;
  const response = await axios.post(url, null, {
    params: {
      recipient: recipientAddress,
      signature: message,
    },
  });

  return ReferrerWithdrawalSchema.parse(response.data);
};
