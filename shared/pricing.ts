/**
 * Marketplace money rules. All amounts are integer US cents.
 *
 * - Customer service fee: added on top of the creators' package prices.
 * - Creator commission: deducted from each creator's package price on payout.
 * - Deposit: a share of the customer total, paid when the booking is confirmed.
 * - Balance: the remainder, paid once the customer confirms completion.
 *
 * Refunds are not calculated here. The Refund and Cancellation Policy (shared/policy.ts) and the time rules
 * (shared/cancellation.ts) decide them.
 */

export const CUSTOMER_FEE_RATE = 0.08;
export const CREATOR_COMMISSION_RATE = 0.1;
export const DEPOSIT_RATE = 0.3;

export interface QuoteMemberInput {
  userId: string;
  priceCents: number;
}

export interface QuoteMember extends QuoteMemberInput {
  commissionCents: number;
  payoutCents: number;
}

export interface Quote {
  subtotalCents: number;
  customerFeeCents: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
  creatorCommissionCents: number;
  creatorPayoutCents: number;
  members: QuoteMember[];
}

export function roundCents(value: number): number {
  return Math.round(value);
}

export function quoteTeam(members: QuoteMemberInput[]): Quote {
  const split: QuoteMember[] = members.map((m) => {
    const commissionCents = roundCents(m.priceCents * CREATOR_COMMISSION_RATE);
    return { ...m, commissionCents, payoutCents: m.priceCents - commissionCents };
  });
  const subtotalCents = members.reduce((sum, m) => sum + m.priceCents, 0);
  const customerFeeCents = roundCents(subtotalCents * CUSTOMER_FEE_RATE);
  const totalCents = subtotalCents + customerFeeCents;
  const depositCents = roundCents(totalCents * DEPOSIT_RATE);
  const creatorCommissionCents = split.reduce((sum, m) => sum + m.commissionCents, 0);
  return {
    subtotalCents,
    customerFeeCents,
    totalCents,
    depositCents,
    balanceCents: totalCents - depositCents,
    creatorCommissionCents,
    creatorPayoutCents: subtotalCents - creatorCommissionCents,
    members: split,
  };
}
