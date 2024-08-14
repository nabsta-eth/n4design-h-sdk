import { z } from "zod";
import { parseAmount } from "../trade/reader";

export const ReferrerBalanceSchema = z.object({
  from: z.number(),
  to: z.number(),
  total_commission: z.string().transform(parseAmount),
});

export const ReferrerClaimableBalanceSchema = z.object({
  balance: z.string().transform(parseAmount),
});

export const ReferrerWithdrawalSchema = z.object({
  ok: z.boolean().optional(),
  amount: z.string().transform(parseAmount).optional(),
});

export const RebateClaimableBalanceSchema = z.object({
  balance: z.string().transform(parseAmount),
});

export const RebateWithdrawalSchema = z.object({
  ok: z.boolean().optional(),
  amount: z.string().transform(parseAmount).optional(),
});

export type ReferralBalance = z.infer<typeof ReferrerBalanceSchema>;
export type ReferralClaimableBalance = z.infer<
  typeof ReferrerClaimableBalanceSchema
>;
export type ReferrerWithdrawal = z.infer<typeof ReferrerWithdrawalSchema>;
export type RebateClaimableBalance = z.infer<
  typeof RebateClaimableBalanceSchema
>;
export type RebateWithdrawal = z.infer<typeof RebateWithdrawalSchema>;
