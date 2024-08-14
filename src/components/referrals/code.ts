// This referral code is used internally throughout the SDK.
let referralCode: string | null = null;

export const setReferralCode = (code: string | null) => {
  referralCode = code;
};

export const getReferralCode = (): string | null => referralCode;
