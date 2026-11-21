import { addDaysIso, all, get, newId, nowIso, run, todayIso, transaction, type Db } from '../db';
import { conflict, HttpError, notFound } from '../http';
import type { PaymentProvider } from '../payments/provider';
import { quoteTeam } from '../../shared/pricing';
import type { PaymentKind, PaymentStatus, PaymentView, ProjectStatus } from '../../shared/types';
import type { UserRow } from './people';
import { type AcceptedVersions, createBookingRecord, recordPolicyAcceptance } from './policy';
import {
  acceptedBrief,
  acceptedQuoteTotals,
  buildDetail,
  getProjectRow,
  logEvent,
  paymentTotals,
  requireProject,
  type ProjectRow,
} from './projects';

interface PaymentRow {
  id: string;
  project_id: string;
  kind: PaymentKind;
  amount_cents: number;
  provider: 'demo' | 'stripe';
  provider_ref: string | null;
  client_secret: string | null;
  status: PaymentStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function paymentView(row: PaymentRow): PaymentView {
  return {
    id: row.id,
    kind: row.kind,
    amountCents: row.amount_cents,
    status: row.status,
    provider: row.provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function paymentRow(db: Db, id: string): PaymentRow | undefined {
  return get<PaymentRow>(db, 'SELECT * FROM payments WHERE id = ?', id);
}

function setPaymentStatus(db: Db, id: string, status: PaymentStatus): void {
  run(db, 'UPDATE payments SET status = ?, updated_at = ? WHERE id = ?', status, nowIso(), id);
}

function setProjectStatus(db: Db, projectId: string, status: ProjectStatus): void {
  run(db, 'UPDATE projects SET status = ?, updated_at = ? WHERE id = ?', status, nowIso(), projectId);
}

function requireCustomer(user: UserRow, project: ProjectRow): void {
  if (user.role !== 'customer' || project.customer_id !== user.id) {
    throw new HttpError(403, 'Only the customer on this project can make payments.', 'FORBIDDEN');
  }
}

export interface CheckoutResult {
  payment: PaymentView;
  clientSecret: string | null;
  mode: 'demo' | 'stripe';
  amountCents: number;
  kind: PaymentKind;
  project: ReturnType<typeof buildDetail>;
}

/**
 * Creates (or reuses) the payment intent for a deposit or balance. A deposit needs the customer's acceptance of the
 * current Refund and Cancellation Policy and Terms. The acceptance is stored with the payment it applies to.
 */
export async function startCheckout(
  db: Db,
  provider: PaymentProvider,
  user: UserRow,
  projectId: string,
  kind: 'deposit' | 'balance',
  acceptance: AcceptedVersions | null,
): Promise<CheckoutResult> {
  const project = requireProject(db, projectId);
  requireCustomer(user, project);
  const totals = acceptedQuoteTotals(db, projectId);
  if (!totals) throw conflict('The brief must be agreed before payment.', 'NOT_AGREED');
  const paid = paymentTotals(db, projectId);
  let amount: number;
  if (kind === 'deposit') {
    if (project.status !== 'agreed') throw conflict('The deposit is due once everyone has approved the brief.', 'BAD_STATUS');
    if (paid.depositPaid > 0) throw conflict('The deposit has already been paid.', 'ALREADY_PAID');
    if (!acceptance) throw new HttpError(400, 'Read and accept the Refund and Cancellation Policy and the Terms and Conditions to continue.', 'POLICY_REQUIRED');
    amount = totals.depositCents;
  } else {
    if (project.status !== 'completed') throw conflict('The balance is due after you confirm completion.', 'BAD_STATUS');
    if (paid.balancePaid > 0) throw conflict('The balance has already been paid.', 'ALREADY_PAID');
    amount = totals.totalCents - paid.depositPaid;
  }

  if (kind === 'deposit' && acceptance) {
    recordPolicyAcceptance(db, user.id, projectId, 'checkout', acceptance);
  }

  const existing = get<PaymentRow>(
    db,
    "SELECT * FROM payments WHERE project_id = ? AND kind = ? AND status IN ('requires_payment','processing') ORDER BY created_at DESC LIMIT 1",
    projectId,
    kind,
  );
  if (existing && existing.amount_cents === amount && existing.provider === provider.mode && existing.client_secret) {
    return {
      payment: paymentView(existing),
      clientSecret: existing.client_secret,
      mode: provider.mode,
      amountCents: amount,
      kind,
      project: buildDetail(db, requireProject(db, projectId), user.id),
    };
  }

  const id = newId();
  const now = nowIso();
  run(
    db,
    `INSERT INTO payments (id, project_id, kind, amount_cents, provider, provider_ref, client_secret, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, 'requires_payment', ?, ?, ?)`,
    id,
    projectId,
    kind,
    amount,
    provider.mode,
    user.id,
    now,
    now,
  );
  const description = `Photo Shoot ${kind} for "${project.title}"`;
  const intent = await provider.createIntent({ paymentId: id, projectId, amountCents: amount, description });
  run(db, 'UPDATE payments SET provider_ref = ?, client_secret = ?, updated_at = ? WHERE id = ?', intent.providerRef, intent.clientSecret, nowIso(), id);
  logEvent(db, projectId, user.id, `${kind === 'deposit' ? 'Deposit' : 'Balance'} payment started${provider.mode === 'demo' ? ' (demo: no money moves)' : ''}`);
  const row = paymentRow(db, id) as PaymentRow;
  return {
    payment: paymentView(row),
    clientSecret: row.client_secret,
    mode: provider.mode,
    amountCents: amount,
    kind,
    project: buildDetail(db, requireProject(db, projectId), user.id),
  };
}

function ownedPayment(db: Db, user: UserRow, paymentId: string): { payment: PaymentRow; project: ProjectRow } {
  const payment = paymentRow(db, paymentId);
  if (!payment) throw notFound('That payment could not be found.');
  const project = requireProject(db, payment.project_id);
  requireCustomer(user, project);
  return { payment, project };
}

/** Demo-only confirmation. The server records success; the browser never decides it. */
export function demoConfirm(db: Db, user: UserRow, paymentId: string): PaymentView {
  const { payment } = ownedPayment(db, user, paymentId);
  if (payment.provider !== 'demo') throw conflict('Demo confirmation is only available in demo mode.', 'NOT_DEMO');
  if (payment.status === 'succeeded') return paymentView(paymentRow(db, paymentId) as PaymentRow);
  if (!['requires_payment', 'processing'].includes(payment.status)) throw conflict('This payment can no longer be confirmed.', 'BAD_STATUS');
  applySucceeded(db, paymentId);
  return paymentView(paymentRow(db, paymentId) as PaymentRow);
}

/** Asks the payment provider for the status and applies it. Used after Stripe Elements confirms. */
export async function syncPayment(db: Db, provider: PaymentProvider, user: UserRow, paymentId: string): Promise<PaymentView> {
  const { payment } = ownedPayment(db, user, paymentId);
  if (payment.status === 'succeeded') return paymentView(paymentRow(db, paymentId) as PaymentRow);
  if (!payment.provider_ref) throw conflict('This payment has no provider reference.', 'NO_REFERENCE');
  if (payment.provider !== provider.mode) throw conflict('This payment was created in a different payment mode.', 'MODE_MISMATCH');
  const status = await provider.fetchStatus(payment.provider_ref);
  if (status === 'succeeded') {
    applySucceeded(db, paymentId);
  } else if (status === 'canceled') {
    setPaymentStatus(db, paymentId, 'canceled');
  } else if (status === 'processing') {
    setPaymentStatus(db, paymentId, 'processing');
  }
  return paymentView(paymentRow(db, paymentId) as PaymentRow);
}

/** Applies provider events (webhooks) by provider reference. Idempotent. */
export function applyProviderEvent(db: Db, providerRef: string, outcome: 'succeeded' | 'failed' | 'canceled'): void {
  const payment = get<PaymentRow>(db, 'SELECT * FROM payments WHERE provider_ref = ?', providerRef);
  if (!payment) return;
  if (outcome === 'succeeded') {
    applySucceeded(db, payment.id);
    return;
  }
  if (payment.status !== 'succeeded') setPaymentStatus(db, payment.id, outcome === 'failed' ? 'failed' : 'canceled');
}

/** Single place where a confirmed payment changes the project. */
export function applySucceeded(db: Db, paymentId: string): void {
  transaction(db, () => {
    const payment = paymentRow(db, paymentId);
    if (!payment || payment.status === 'succeeded') return;
    setPaymentStatus(db, paymentId, 'succeeded');
    const project = requireProject(db, payment.project_id);
    if (payment.kind === 'deposit') {
      if (project.status === 'agreed') {
        setProjectStatus(db, project.id, 'booked');
        // The booking-time record: policy versions, and what was being bought. Written once, when the booking is confirmed.
        createBookingRecord(db, project.id, nowIso());
      }
      logEvent(db, project.id, null, `Deposit received. The booking is confirmed${payment.provider === 'demo' ? ' (demo payment)' : ''}.`);
    } else if (payment.kind === 'balance') {
      if (project.status === 'completed') setProjectStatus(db, project.id, 'closed');
      const content = acceptedBrief(db, project.id);
      if (content) {
        const quote = quoteTeam(content.members.map((m) => ({ userId: m.userId, priceCents: m.priceCents })));
        const scheduledFor = addDaysIso(todayIso(), 3);
        for (const split of quote.members) {
          run(
            db,
            "INSERT INTO payouts (id, project_id, creator_id, amount_cents, commission_cents, status, scheduled_for, created_at) VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?)",
            newId(),
            project.id,
            split.userId,
            split.payoutCents,
            split.commissionCents,
            scheduledFor,
            nowIso(),
          );
        }
      }
      logEvent(db, project.id, null, `Balance received. Creator payouts are scheduled${payment.provider === 'demo' ? ' (demo)' : ''}.`);
    }
  });
}

export function handleProviderFailure(db: Db, paymentId: string): void {
  const payment = paymentRow(db, paymentId);
  if (payment && payment.status !== 'succeeded') setPaymentStatus(db, paymentId, 'failed');
}

export function paymentsFor(db: Db, projectId: string): PaymentView[] {
  return all<PaymentRow>(db, 'SELECT * FROM payments WHERE project_id = ? ORDER BY created_at', projectId).map(paymentView);
}

export function projectRowOrThrow(db: Db, id: string): ProjectRow {
  const row = getProjectRow(db, id);
  if (!row) throw notFound('That project could not be found.');
  return row;
}
