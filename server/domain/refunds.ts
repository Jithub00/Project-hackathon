import { all, get, newId, nowIso, run, transaction, type Db } from '../db';
import { conflict, forbidden, HttpError, notFound } from '../http';
import type { PaymentProvider, RefundOutcome } from '../payments/provider';
import { qualifiesForAdvanceCancellation, toIsoInstant } from '../../shared/cancellation';
import { formatUsdExact } from '../../shared/money';
import { CANCELLATION_GUARANTEE_HOURS, REFUND_POLICY_TITLE, REFUND_POLICY_VERSION } from '../../shared/policy';
import type { ProjectDetail, RefundRequestView } from '../../shared/types';
import type { UserRow } from './people';
import { isModerator } from './messaging';
import { buildDetail, logEvent, requireProject, type ProjectRow } from './projects';
import {
  bookedPortfolioIds,
  CONFIRMED_BOOKING_STATUSES,
  CUSTOMER_CANCELLABLE,
  NOT_DELIVERED_REQUEST_STATUSES,
  OPEN_REQUEST_STATUSES,
  QUALITY_REQUEST_STATUSES,
  acceptedBriefRow,
  refundRequestViews,
  refundableCents,
  requestRow,
  scheduledStartFor,
  type RequestRow,
} from './refund-core';

/**
 * Refunds, cancellations and refund requests.
 *
 * Rules enforced here (see shared/policy.ts for the published wording):
 * - A customer cancellation at least 72 elapsed hours before the scheduled start is approved for a full refund
 *   automatically. The cancellation time is recorded when the cancellation succeeds.
 * - A cancellation inside 72 hours is recorded and reviewed in writing by a Photo Shoot reviewer.
 * - A creator cancellation of a confirmed booking is never refunded automatically. The booking closes, payouts are held,
 *   and a Photo Shoot reviewer decides any refund in writing. The published policy does not yet set a rule for it.
 * - Delivery and quality requests are independent of the cancellation deadline. A reviewer who is part of the booking
 *   cannot decide them, and the creator's response is only one input.
 * - Every refund is sent with an idempotency key, so a repeated request cannot refund the same money twice.
 */

const REFUNDABLE_TRANSFER_STATES = ['pending', 'processing', 'succeeded'];

interface TransferRow {
  id: string;
  request_id: string;
  payment_id: string;
  refund_payment_id: string | null;
  amount_cents: number;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  provider_ref: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface PaymentLite {
  id: string;
  project_id: string;
  kind: string;
  amount_cents: number;
  provider: 'demo' | 'stripe';
  provider_ref: string | null;
  status: string;
  created_at: string;
  created_by: string;
}

function paymentById(db: Db, id: string): PaymentLite | undefined {
  return get<PaymentLite>(db, 'SELECT * FROM payments WHERE id = ?', id);
}

function cancellationRow(db: Db, projectId: string): RequestRow | undefined {
  return get<RequestRow>(db, "SELECT * FROM refund_requests WHERE project_id = ? AND reason = 'cancellation'", projectId);
}

function openRequestFor(db: Db, projectId: string, reason: string): RequestRow | undefined {
  return get<RequestRow>(
    db,
    "SELECT * FROM refund_requests WHERE project_id = ? AND reason = ? AND status NOT IN ('declined','withdrawn')",
    projectId,
    reason,
  );
}

function holdPayouts(db: Db, projectId: string): void {
  run(db, "UPDATE payouts SET status = 'held' WHERE project_id = ? AND status = 'scheduled'", projectId);
}

/** Releases held payouts once nothing is open on the booking. A cancelled or disputed booking keeps them held. */
function releasePayoutsIfClear(db: Db, projectId: string): void {
  const project = get<{ status: string }>(db, 'SELECT status FROM projects WHERE id = ?', projectId);
  if (!project || project.status === 'cancelled' || project.status === 'disputed') return;
  const open = get<{ total: number }>(
    db,
    `SELECT COUNT(*) AS total FROM refund_requests WHERE project_id = ? AND status IN ('submitted','under_review','approved','refund_initiated','refund_failed')`,
    projectId,
  );
  if ((open?.total ?? 0) > 0) return;
  run(db, "UPDATE payouts SET status = 'scheduled' WHERE project_id = ? AND status = 'held'", projectId);
}

function refundedFromPayment(db: Db, paymentId: string): number {
  return (
    get<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM refund_transfers WHERE payment_id = ? AND status IN (${REFUNDABLE_TRANSFER_STATES.map(() => '?').join(',')})`,
      paymentId,
      ...REFUNDABLE_TRANSFER_STATES,
    )?.total ?? 0
  );
}

function transferCount(db: Db, requestId: string): number {
  return get<{ total: number }>(db, 'SELECT COUNT(*) AS total FROM refund_transfers WHERE request_id = ?', requestId)?.total ?? 0;
}

/** Splits an approved amount across the payments that paid for the booking, newest payment first. Runs once per request. */
function allocateTransfers(db: Db, request: RequestRow, amount: number, at: string): void {
  transaction(db, () => {
    const payments = all<PaymentLite>(
      db,
      "SELECT * FROM payments WHERE project_id = ? AND kind IN ('deposit','balance') AND status = 'succeeded' ORDER BY created_at DESC",
      request.project_id,
    );
    let remaining = amount;
    for (const payment of payments) {
      if (remaining <= 0) break;
      const available = payment.amount_cents - refundedFromPayment(db, payment.id);
      if (available <= 0) continue;
      const take = Math.min(available, remaining);
      run(
        db,
        `INSERT INTO refund_transfers (id, request_id, payment_id, refund_payment_id, amount_cents, status, provider_ref, error, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, 'pending', NULL, NULL, ?, ?)`,
        newId(),
        request.id,
        payment.id,
        take,
        at,
        at,
      );
      remaining -= take;
    }
    if (remaining > 0) {
      throw conflict('The approved amount is more than the amount paid that can still be refunded.', 'OVER_REFUND');
    }
  });
}

function ensureRefundPayment(db: Db, transfer: TransferRow, request: RequestRow, mode: 'demo' | 'stripe', at: string): string {
  if (transfer.refund_payment_id) return transfer.refund_payment_id;
  const id = newId();
  run(
    db,
    `INSERT INTO payments (id, project_id, kind, amount_cents, provider, provider_ref, client_secret, status, created_by, created_at, updated_at)
     VALUES (?, ?, 'refund', ?, ?, NULL, NULL, 'processing', ?, ?, ?)`,
    id,
    request.project_id,
    transfer.amount_cents,
    mode,
    request.requested_by,
    at,
    at,
  );
  run(db, 'UPDATE refund_transfers SET refund_payment_id = ? WHERE id = ?', id, transfer.id);
  return id;
}

/** Recomputes the request status from its transfers: refunded only when every transfer is confirmed. */
function recomputeRequestStatus(db: Db, requestId: string, at: string): void {
  const counts = get<{ total: number; ok: number | null; failed: number | null; open: number | null }>(
    db,
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS ok,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN status IN ('pending','processing') THEN 1 ELSE 0 END) AS open
       FROM refund_transfers WHERE request_id = ?`,
    requestId,
  );
  if (!counts || counts.total === 0) return;
  const ok = counts.ok ?? 0;
  const failed = counts.failed ?? 0;
  const open = counts.open ?? 0;
  const next = ok === counts.total ? 'refunded' : open === 0 && failed > 0 ? 'refund_failed' : 'refund_initiated';
  run(
    db,
    `UPDATE refund_requests SET status = ?, updated_at = ?
      WHERE id = ? AND status IN ('approved','refund_initiated','refund_failed','refunded')`,
    next,
    at,
    requestId,
  );
  const request = requestRow(db, requestId);
  if (request && next === 'refunded') {
    logEvent(db, request.project_id, null, `Refund confirmed by the payment provider${request.approved_cents ? ` (${formatUsdExact(request.approved_cents)})` : ''}.`);
  }
  if (request && next === 'refund_failed') {
    logEvent(db, request.project_id, null, 'The payment provider did not complete a refund. It can be tried again.');
  }
}

function applyTransferOutcome(db: Db, transferId: string, outcome: RefundOutcome, providerRef: string | null, error: string | null): void {
  const transfer = get<TransferRow>(db, 'SELECT * FROM refund_transfers WHERE id = ?', transferId);
  if (!transfer) return;
  // A confirmed refund never moves backwards, even if events arrive out of order.
  if (transfer.status === 'succeeded' && outcome !== 'succeeded') return;
  const transferStatus = outcome === 'succeeded' ? 'succeeded' : outcome === 'pending' ? 'processing' : 'failed';
  const paymentStatus = outcome === 'succeeded' ? 'refunded' : outcome === 'pending' ? 'processing' : 'failed';
  const at = nowIso();
  run(
    db,
    'UPDATE refund_transfers SET status = ?, provider_ref = COALESCE(?, provider_ref), error = ?, updated_at = ? WHERE id = ?',
    transferStatus,
    providerRef,
    error,
    at,
    transferId,
  );
  if (transfer.refund_payment_id) {
    run(
      db,
      'UPDATE payments SET status = ?, provider_ref = COALESCE(?, provider_ref), updated_at = ? WHERE id = ?',
      paymentStatus,
      providerRef,
      at,
      transfer.refund_payment_id,
    );
  }
  recomputeRequestStatus(db, transfer.request_id, at);
}

/**
 * Sends an approved refund to the payment provider. Only transfers that are not yet claimed are sent, and each is
 * claimed in the database before the call, so a repeated request sends nothing twice. Failed transfers can be retried.
 */
export async function issueRefund(db: Db, provider: PaymentProvider, requestId: string, now: Date = new Date()): Promise<void> {
  const request = requestRow(db, requestId);
  if (!request || !['approved', 'refund_initiated', 'refund_failed'].includes(request.status)) return;
  const amount = request.approved_cents ?? 0;
  if (amount <= 0) return;

  const at = now.toISOString();
  if (transferCount(db, requestId) === 0) allocateTransfers(db, request, amount, at);
  run(
    db,
    "UPDATE refund_requests SET status = 'refund_initiated', updated_at = ? WHERE id = ? AND status IN ('approved','refund_initiated','refund_failed')",
    at,
    requestId,
  );

  const pending = all<TransferRow>(
    db,
    "SELECT * FROM refund_transfers WHERE request_id = ? AND status IN ('pending','failed') ORDER BY created_at",
    requestId,
  );
  for (const transfer of pending) {
    const claim = db
      .prepare("UPDATE refund_transfers SET status = 'processing', error = NULL, updated_at = ? WHERE id = ? AND status IN ('pending','failed')")
      .run(nowIso(), transfer.id);
    if (Number(claim.changes) !== 1) continue;
    const original = paymentById(db, transfer.payment_id);
    ensureRefundPayment(db, transfer, request, provider.mode, at);
    try {
      const result = await provider.refund({
        refundId: transfer.id,
        providerRef: original?.provider_ref ?? '',
        amountCents: transfer.amount_cents,
      });
      applyTransferOutcome(
        db,
        transfer.id,
        result.status,
        result.providerRef,
        result.status === 'failed' ? 'The payment provider did not accept the refund.' : null,
      );
    } catch (error) {
      // Log the message only. It never contains message text or card details.
      console.error('[refunds] the payment provider did not complete a refund:', (error as Error).message);
      applyTransferOutcome(db, transfer.id, 'failed', null, 'The payment provider did not complete the refund. Try again.');
    }
  }
  recomputeRequestStatus(db, requestId, nowIso());
}

/** Applies a provider event (for example a Stripe refund webhook). Idempotent, and ignores refunds it does not know. */
export function applyRefundEvent(db: Db, providerRef: string, outcome: RefundOutcome): void {
  const transfer = get<{ id: string }>(db, 'SELECT id FROM refund_transfers WHERE provider_ref = ?', providerRef);
  if (!transfer) return;
  applyTransferOutcome(db, transfer.id, outcome, providerRef, outcome === 'failed' ? 'The payment provider reported that the refund failed.' : null);
}

function viewFor(db: Db, projectId: string, viewerId: string, requestId: string): RefundRequestView | null {
  return refundRequestViews(db, projectId, viewerId).find((view) => view.id === requestId) ?? null;
}

function detailFor(db: Db, projectId: string, viewerId: string): ProjectDetail {
  return buildDetail(db, requireProject(db, projectId), viewerId);
}

export interface CancelResult {
  project: ProjectDetail;
  refund: RefundRequestView | null;
  alreadyCancelled: boolean;
  message: string;
}

function refundMoney(cents: number, mode: 'demo' | 'stripe'): string {
  return `${formatUsdExact(cents)}${mode === 'demo' ? ' (demonstration: no money moves)' : ''}`;
}

function cancellationMessage(db: Db, projectId: string, requestId: string, cancelledBy: 'customer' | 'creator'): string {
  const request = requestRow(db, requestId);
  if (!request) return 'Project cancelled.';
  const mode = paymentModeFor(db, projectId);
  switch (request.status) {
    case 'not_required':
      return 'Project cancelled. Nothing was charged, so there is nothing to refund.';
    case 'under_review':
      if (cancelledBy === 'creator') {
        return 'Project cancelled. No refund has been sent. A Photo Shoot reviewer will decide the refund in writing, and payouts for this booking stay held while the review is open.';
      }
      return `Project cancelled. The ${CANCELLATION_GUARANTEE_HOURS}-hour cancellation guarantee does not apply to this cancellation, so a Photo Shoot reviewer will decide your refund request in writing.`;
    case 'approved':
    case 'refund_initiated':
      return `Project cancelled. Your refund of ${refundMoney(request.approved_cents ?? 0, mode)} has been sent to the payment provider. Photo Shoot is waiting for the provider to confirm it.`;
    case 'refunded':
      return `Project cancelled. The payment provider confirmed your refund of ${refundMoney(request.approved_cents ?? 0, mode)}. Your bank or card issuer controls when it appears in your account.`;
    case 'refund_failed':
      return `Project cancelled. The refund of ${formatUsdExact(request.approved_cents ?? 0)} could not be sent yet. Use "Try again" on the refund request.`;
    default:
      return 'Project cancelled.';
  }
}

function paymentModeFor(db: Db, projectId: string): 'demo' | 'stripe' {
  const row = get<{ provider: 'demo' | 'stripe' }>(db, 'SELECT provider FROM payments WHERE project_id = ? ORDER BY created_at DESC LIMIT 1', projectId);
  return row?.provider ?? 'demo';
}

/**
 * Cancels a booking and records the cancellation time. The first successful request does the work. A repeated request
 * (a double click, a retry) returns the recorded cancellation and sends no second refund.
 */
export async function cancelProject(
  db: Db,
  provider: PaymentProvider,
  user: UserRow,
  projectId: string,
  reason: string,
  now: Date = new Date(),
): Promise<CancelResult> {
  const project = requireProject(db, projectId);
  const isCustomer = project.customer_id === user.id;
  const member = get<{ status: string }>(
    db,
    "SELECT status FROM project_members WHERE project_id = ? AND user_id = ? AND status = 'accepted'",
    projectId,
    user.id,
  );
  if (!isCustomer && !member) throw forbidden('Only participants can cancel this project.');

  const existing = cancellationRow(db, projectId);
  if (existing && project.status === 'cancelled') {
    return {
      project: detailFor(db, projectId, user.id),
      refund: viewFor(db, projectId, user.id, existing.id),
      alreadyCancelled: true,
      message: 'This booking is already cancelled. Nothing else was changed.',
    };
  }
  if (!CUSTOMER_CANCELLABLE.includes(project.status)) {
    throw conflict('This project can no longer be cancelled here. Open a dispute instead.', 'NOT_CANCELLABLE');
  }
  if (!isCustomer && !CONFIRMED_BOOKING_STATUSES.includes(project.status)) {
    throw conflict('Decline the invitation instead. Creators can only cancel a confirmed booking.', 'DECLINE_INSTEAD');
  }

  const cancelledBy: 'customer' | 'creator' = isCustomer ? 'customer' : 'creator';
  const nowText = now.toISOString();
  const startMs = scheduledStartFor(db, projectId);
  const refundable = refundableCents(db, projectId);
  const qualifies = cancelledBy === 'customer' && startMs !== null && qualifiesForAdvanceCancellation(now.getTime(), startMs);
  // Only a customer cancellation that qualifies is approved automatically. Anything else, including every creator
  // cancellation, waits for a reviewer, because the published policy does not yet set a rule for it.
  const approvedNow = refundable > 0 && qualifies;
  const requestId = newId();
  const decisionNote = 'Cancelled at least 72 hours before the scheduled start: full refund under the 72-hour cancellation guarantee.';

  transaction(db, () => {
    const moved = db
      .prepare(
        `UPDATE projects SET status = 'cancelled', updated_at = ? WHERE id = ? AND status IN (${CUSTOMER_CANCELLABLE.map(() => '?').join(',')})`,
      )
      .run(nowText, projectId, ...CUSTOMER_CANCELLABLE);
    if (Number(moved.changes) !== 1) {
      throw conflict('This project was just changed. Refresh the page and try again.', 'CHANGED');
    }
    const status = refundable === 0 ? 'not_required' : approvedNow ? 'approved' : 'under_review';
    run(
      db,
      `INSERT INTO refund_requests (id, project_id, requested_by, reason, status, requested_cents, approved_cents, cancelled_at, scheduled_start, qualifies_72h,
                                    policy_version, description, evidence, decided_by, decided_at, decision_kind, decision_note, created_at, updated_at)
       VALUES (?, ?, ?, 'cancellation', ?, ?, ?, ?, ?, ?, ?, ?, '{}', NULL, ?, ?, ?, ?, ?)`,
      requestId,
      projectId,
      user.id,
      status,
      refundable,
      approvedNow ? refundable : null,
      nowText,
      startMs === null ? null : toIsoInstant(startMs),
      cancelledBy === 'customer' ? (qualifies ? 1 : 0) : null,
      REFUND_POLICY_VERSION,
      reason,
      approvedNow ? nowText : null,
      approvedNow ? 'policy' : null,
      approvedNow ? decisionNote : '',
      nowText,
      nowText,
    );
    holdPayouts(db, projectId);
    const outcome =
      refundable === 0
        ? 'Nothing was paid, so there is no refund'
        : approvedNow
          ? 'Full refund approved under the 72-hour cancellation guarantee'
          : cancelledBy === 'creator'
            ? 'Refund request under review (cancelled by the creator)'
            : 'Refund request under review (the 72-hour guarantee does not apply)';
    logEvent(db, projectId, user.id, `Cancelled by ${cancelledBy} at ${nowText}. ${outcome}. Reason: ${reason}`);
  });

  if (approvedNow) await issueRefund(db, provider, requestId, now);
  return {
    project: detailFor(db, projectId, user.id),
    refund: viewFor(db, projectId, user.id, requestId),
    alreadyCancelled: false,
    message: cancellationMessage(db, projectId, requestId, cancelledBy),
  };
}

export interface RefundRequestInput {
  reason: 'not_delivered' | 'quality';
  description: string;
  portfolioItemIds: string[];
  deliveryIds: string[];
  messageIds: string[];
}

function assertEvidence(db: Db, projectId: string, input: RefundRequestInput): void {
  const booked = bookedPortfolioIds(db, projectId);
  for (const id of input.portfolioItemIds) {
    const owned = get(
      db,
      "SELECT 1 FROM portfolio_items WHERE id = ? AND creator_id IN (SELECT user_id FROM project_members WHERE project_id = ? AND status IN ('invited','accepted'))",
      id,
      projectId,
    );
    if (!booked.has(id) && !owned) {
      throw new HttpError(400, 'One of the portfolio examples is not part of this booking.', 'INVALID_EVIDENCE', { portfolioItemIds: 'Choose examples from this booking.' });
    }
  }
  for (const id of input.deliveryIds) {
    if (!get(db, 'SELECT 1 FROM deliveries WHERE id = ? AND project_id = ?', id, projectId)) {
      throw new HttpError(400, 'One of the delivered files is not part of this project.', 'INVALID_EVIDENCE', { deliveryIds: 'Choose files from this project.' });
    }
  }
  for (const id of input.messageIds) {
    if (!get(db, 'SELECT 1 FROM messages WHERE id = ? AND project_id = ?', id, projectId)) {
      throw new HttpError(400, 'One of the messages is not part of this project.', 'INVALID_EVIDENCE', { messageIds: 'Choose messages from this project.' });
    }
  }
}

/**
 * A delivery or quality request. It is independent of the cancellation deadline and is only open for the stages
 * where the work is in question. Double submissions return the request that is already open.
 */
export function submitRefundRequest(db: Db, user: UserRow, projectId: string, input: RefundRequestInput, now: Date = new Date()): ProjectDetail {
  const project = requireProject(db, projectId);
  if (project.customer_id !== user.id) throw forbidden('Only the customer on this project can request a refund.');
  const allowed = input.reason === 'quality' ? QUALITY_REQUEST_STATUSES : NOT_DELIVERED_REQUEST_STATUSES;
  if (!allowed.includes(project.status)) {
    throw conflict(
      input.reason === 'quality'
        ? 'A quality request can be made once work has been delivered, and before the balance is paid.'
        : 'This request is not available at this stage of the project.',
      'REQUEST_NOT_AVAILABLE',
    );
  }
  const existing = openRequestFor(db, projectId, input.reason);
  if (existing) return detailFor(db, projectId, user.id);

  assertEvidence(db, projectId, input);
  const brief = acceptedBriefRow(db, projectId);
  const at = now.toISOString();
  const evidence = {
    agreementVersionId: brief?.id ?? null,
    portfolioItemIds: input.portfolioItemIds,
    deliveryIds: input.deliveryIds,
    messageIds: input.messageIds,
  };
  transaction(db, () => {
    run(
      db,
      `INSERT INTO refund_requests (id, project_id, requested_by, reason, status, requested_cents, approved_cents, cancelled_at, scheduled_start, qualifies_72h,
                                    policy_version, description, evidence, decided_by, decided_at, decision_kind, decision_note, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'submitted', ?, NULL, NULL, NULL, NULL, ?, ?, ?, NULL, NULL, NULL, '', ?, ?)`,
      newId(),
      projectId,
      user.id,
      input.reason,
      refundableCents(db, projectId),
      REFUND_POLICY_VERSION,
      input.description,
      JSON.stringify(evidence),
      at,
      at,
    );
    holdPayouts(db, projectId);
    const label = input.reason === 'quality' ? 'quality of delivered work' : 'agreed work not delivered';
    logEvent(db, projectId, user.id, `Refund request submitted (${label}). Payouts are held while it is reviewed.`);
  });
  return detailFor(db, projectId, user.id);
}

export function withdrawRefundRequest(db: Db, user: UserRow, requestId: string): ProjectDetail {
  const request = requestRow(db, requestId);
  if (!request) throw notFound('That refund request could not be found.');
  const project = requireProject(db, request.project_id);
  if (project.customer_id !== user.id) throw forbidden('Only the customer can withdraw this request.');
  if (request.reason === 'cancellation') throw conflict('A cancellation is recorded and cannot be withdrawn.', 'NOT_WITHDRAWABLE');
  if (!OPEN_REQUEST_STATUSES.includes(request.status)) throw conflict('This request has already been decided.', 'BAD_STATUS');
  transaction(db, () => {
    run(db, "UPDATE refund_requests SET status = 'withdrawn', updated_at = ? WHERE id = ? AND status IN ('submitted','under_review')", nowIso(), requestId);
    logEvent(db, project.id, user.id, 'Refund request withdrawn by the customer.');
    releasePayoutsIfClear(db, project.id);
  });
  return detailFor(db, project.id, user.id);
}

/** Adds a note to an open request. The customer and accepted team members can each add notes. */
export function addRefundNote(db: Db, user: UserRow, requestId: string, body: string): ProjectDetail {
  const request = requestRow(db, requestId);
  if (!request) throw notFound('That refund request could not be found.');
  const project = requireProject(db, request.project_id);
  const isCustomer = project.customer_id === user.id;
  const member = get<{ status: string }>(
    db,
    "SELECT status FROM project_members WHERE project_id = ? AND user_id = ? AND status IN ('invited','accepted')",
    project.id,
    user.id,
  );
  if (!isCustomer && !member) throw forbidden('Only the people on this booking can add a note.');
  if (!OPEN_REQUEST_STATUSES.includes(request.status)) throw conflict('Notes can be added while a request is open.', 'BAD_STATUS');
  run(
    db,
    'INSERT INTO refund_request_notes (id, request_id, author_id, author_role, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    newId(),
    requestId,
    user.id,
    isCustomer ? 'customer' : 'creator',
    body,
    nowIso(),
  );
  return detailFor(db, project.id, user.id);
}

/**
 * Photo Shoot reviewers decide requests. Someone who is part of the booking cannot decide it. Approvals are sent to the
 * payment provider straight away. A decline needs written reasons.
 */
export async function decideRefundRequest(
  db: Db,
  provider: PaymentProvider,
  reviewer: UserRow,
  requestId: string,
  input: { decision: 'approve' | 'decline'; amountCents?: number; note: string },
  now: Date = new Date(),
): Promise<ProjectDetail> {
  if (!isModerator(db, reviewer.id)) throw forbidden('Only Photo Shoot reviewers can decide refund requests.');
  const request = requestRow(db, requestId);
  if (!request) throw notFound('That refund request could not be found.');
  const project: ProjectRow = requireProject(db, request.project_id);
  const involved =
    project.customer_id === reviewer.id ||
    Boolean(get(db, 'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?', project.id, reviewer.id));
  if (involved) throw new HttpError(403, 'A reviewer cannot decide a request for a booking they are part of.', 'CONFLICT_OF_INTEREST');
  if (!OPEN_REQUEST_STATUSES.includes(request.status)) throw conflict('This request has already been decided.', 'BAD_STATUS');

  const at = now.toISOString();
  if (input.decision === 'approve') {
    const amount = input.amountCents ?? 0;
    if (amount < 1) {
      throw new HttpError(400, 'Enter the amount to approve.', 'AMOUNT_REQUIRED', { amountCents: 'Enter an amount in dollars.' });
    }
    if (amount > refundableCents(db, project.id)) {
      throw new HttpError(400, 'That amount is more than the amount paid that can still be refunded.', 'OVER_REFUND', {
        amountCents: 'The amount is more than the refundable balance.',
      });
    }
    const moved = db
      .prepare(
        "UPDATE refund_requests SET status = 'approved', approved_cents = ?, decided_by = ?, decided_at = ?, decision_kind = 'staff', decision_note = ?, updated_at = ? WHERE id = ? AND status IN ('submitted','under_review')",
      )
      .run(amount, reviewer.id, at, input.note, at, requestId);
    if (Number(moved.changes) !== 1) throw conflict('This request has already been decided.', 'BAD_STATUS');
    logEvent(db, project.id, reviewer.id, `Refund approved: ${formatUsdExact(amount)}. ${input.note}`);
    await issueRefund(db, provider, requestId, now);
  } else {
    const moved = db
      .prepare(
        "UPDATE refund_requests SET status = 'declined', decided_by = ?, decided_at = ?, decision_kind = 'staff', decision_note = ?, updated_at = ? WHERE id = ? AND status IN ('submitted','under_review')",
      )
      .run(reviewer.id, at, input.note, at, requestId);
    if (Number(moved.changes) !== 1) throw conflict('This request has already been decided.', 'BAD_STATUS');
    logEvent(db, project.id, reviewer.id, `Refund request declined. ${input.note}`);
    releasePayoutsIfClear(db, project.id);
  }
  return buildDetail(db, requireProject(db, project.id), reviewer.id);
}

/** The customer can ask for a failed refund to be sent again. Confirmed transfers are never sent twice. */
export async function retryRefund(db: Db, provider: PaymentProvider, user: UserRow, requestId: string, now: Date = new Date()): Promise<ProjectDetail> {
  const request = requestRow(db, requestId);
  if (!request) throw notFound('That refund request could not be found.');
  const project = requireProject(db, request.project_id);
  if (project.customer_id !== user.id) throw forbidden('Only the customer can ask for a refund to be tried again.');
  if (request.status !== 'refund_failed') throw conflict('Only a refund that failed can be tried again.', 'BAD_STATUS');
  await issueRefund(db, provider, requestId, now);
  return detailFor(db, project.id, user.id);
}

/** Open requests across all bookings, for reviewers. */
export function refundReviewQueue(db: Db, reviewer: UserRow) {
  if (!isModerator(db, reviewer.id)) throw forbidden('Only Photo Shoot reviewers can open the refund queue.');
  const projectIds = all<{ project_id: string }>(
    db,
    `SELECT DISTINCT project_id FROM refund_requests WHERE status IN ('submitted','under_review')`,
  ).map((row) => row.project_id);
  const items = [];
  for (const projectId of projectIds) {
    const project = get<{ title: string; customer_id: string }>(db, 'SELECT title, customer_id FROM projects WHERE id = ?', projectId);
    if (!project) continue;
    for (const request of refundRequestViews(db, projectId, null)) {
      if (!OPEN_REQUEST_STATUSES.includes(request.status)) continue;
      items.push({ projectId, projectTitle: project.title, policy: REFUND_POLICY_TITLE, request });
    }
  }
  return items;
}
