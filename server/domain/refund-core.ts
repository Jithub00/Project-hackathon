import { all, get, parseJsonArray, type Db } from '../db';
import {
  cancellationDeadlineMs,
  hoursBeforeStart,
  qualifiesForAdvanceCancellation,
  scheduledStartMs,
  toIsoInstant,
} from '../../shared/cancellation';
import type {
  BookingRecordView,
  BriefContent,
  CancellationPreview,
  PolicyAuthorRole,
  RefundEvidenceView,
  RefundNoteView,
  RefundReason,
  RefundRequestStatus,
  RefundRequestView,
} from '../../shared/types';

/**
 * Read rules and read models for refunds. Nothing here changes data. Kept apart from projects.ts so the project
 * detail can include refund information without a circular import.
 */

/** Project statuses in which the customer can still cancel. Creators can only cancel a confirmed booking. */
export const CUSTOMER_CANCELLABLE: string[] = ['draft', 'recruiting', 'agreement_pending', 'agreed', 'booked', 'delivered', 'revision_requested'];
export const CONFIRMED_BOOKING_STATUSES: string[] = ['booked', 'delivered', 'revision_requested'];
export { NOT_DELIVERED_REQUEST_STATUSES, QUALITY_REQUEST_STATUSES } from '../../shared/refund-rules';

export const OPEN_REQUEST_STATUSES: string[] = ['submitted', 'under_review'];
/** Statuses in which an approved amount is reserved, so it cannot be approved twice. */
const RESERVED_STATUSES = ['approved', 'refund_initiated', 'refunded', 'refund_failed'];

export interface AcceptedBriefRow {
  id: string;
  content: string;
}

export function acceptedBriefRow(db: Db, projectId: string): AcceptedBriefRow | undefined {
  return get<AcceptedBriefRow>(
    db,
    "SELECT id, content FROM brief_versions WHERE project_id = ? AND status = 'accepted' ORDER BY version_no DESC LIMIT 1",
    projectId,
  );
}

export function acceptedBriefContent(db: Db, projectId: string): BriefContent | null {
  const row = acceptedBriefRow(db, projectId);
  return row ? (JSON.parse(row.content) as BriefContent) : null;
}

/** Amount the customer has paid toward the booking and that the payment provider confirmed (deposit and balance). */
export function grossPaidCents(db: Db, projectId: string): number {
  return (
    get<{ total: number }>(
      db,
      "SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments WHERE project_id = ? AND kind IN ('deposit','balance') AND status = 'succeeded'",
      projectId,
    )?.total ?? 0
  );
}

/** Amounts already approved for refund, whether issued, pending or failed. These cannot be approved again. */
export function reservedRefundCents(db: Db, projectId: string): number {
  return (
    get<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(approved_cents), 0) AS total FROM refund_requests WHERE project_id = ? AND status IN (${RESERVED_STATUSES.map(() => '?').join(',')})`,
      projectId,
      ...RESERVED_STATUSES,
    )?.total ?? 0
  );
}

/** The most that can still be refunded for this booking. */
export function refundableCents(db: Db, projectId: string): number {
  return Math.max(0, grossPaidCents(db, projectId) - reservedRefundCents(db, projectId));
}

/** Scheduled start of the agreed shoot, as a UTC instant. Null when the agreed brief has no usable date and time. */
export function scheduledStartFor(db: Db, projectId: string): number | null {
  const brief = acceptedBriefContent(db, projectId);
  return brief ? scheduledStartMs(brief.shootDate, brief.shootStartTime) : null;
}

export function cancellationPreview(db: Db, project: { id: string; status: string }, now: Date): CancellationPreview {
  const paidCents = refundableCents(db, project.id);
  const startMs = scheduledStartFor(db, project.id);
  const nowMs = now.getTime();
  const hours = startMs === null ? null : hoursBeforeStart(nowMs, startMs);
  const qualifies = startMs === null ? null : qualifiesForAdvanceCancellation(nowMs, startMs);
  const outcome: CancellationPreview['outcome'] =
    paidCents === 0 ? 'no_payment' : startMs === null ? 'unknown_start' : qualifies ? 'full_refund_guarantee' : 'under_review';
  return {
    canCancel: CUSTOMER_CANCELLABLE.includes(project.status),
    paidCents,
    scheduledStart: startMs === null ? null : toIsoInstant(startMs),
    deadline: startMs === null ? null : toIsoInstant(cancellationDeadlineMs(startMs)),
    hoursBeforeStart: hours,
    qualifiesNow: qualifies,
    outcome,
  };
}

export const REFUND_STATUS_COPY: Record<RefundRequestStatus, { label: string; explanation: string }> = {
  submitted: {
    label: 'Submitted',
    explanation: 'We received your request. A Photo Shoot reviewer will look at the evidence from both sides.',
  },
  under_review: {
    label: 'Under review',
    explanation: 'A Photo Shoot reviewer is looking at the evidence from both sides. The creator can respond below.',
  },
  approved: {
    label: 'Approved',
    explanation: 'The refund is decided. The amount is shown above. It is sent to the payment provider next.',
  },
  declined: {
    label: 'Declined',
    explanation: 'The request was reviewed and not approved. The reasons are shown below.',
  },
  withdrawn: {
    label: 'Withdrawn',
    explanation: 'You withdrew this request before a decision was made.',
  },
  refund_initiated: {
    label: 'Refund sent to the payment provider',
    explanation: 'The provider has accepted the refund. Photo Shoot is waiting for the provider to confirm it.',
  },
  refunded: {
    label: 'Refunded',
    explanation:
      'The provider has confirmed the refund. Your bank or card issuer controls when the funds appear in your account, and Photo Shoot cannot promise a timescale.',
  },
  refund_failed: {
    label: 'Refund failed',
    explanation: 'The provider did not complete the refund. You can ask us to try again. A refund is never issued twice.',
  },
  not_required: {
    label: 'Nothing to refund',
    explanation: 'Nothing was paid toward this booking, so no refund is due.',
  },
};

export interface RequestRow {
  id: string;
  project_id: string;
  requested_by: string;
  reason: RefundReason;
  status: RefundRequestStatus;
  requested_cents: number | null;
  approved_cents: number | null;
  cancelled_at: string | null;
  scheduled_start: string | null;
  qualifies_72h: number | null;
  policy_version: string;
  description: string;
  evidence: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_kind: 'staff' | 'policy' | null;
  decision_note: string;
  created_at: string;
  updated_at: string;
}

export function requestRow(db: Db, requestId: string): RequestRow | undefined {
  return get<RequestRow>(db, 'SELECT * FROM refund_requests WHERE id = ?', requestId);
}

export function requestsForProject(db: Db, projectId: string): RequestRow[] {
  return all<RequestRow>(db, 'SELECT * FROM refund_requests WHERE project_id = ? ORDER BY created_at', projectId);
}

interface EvidenceIds {
  agreementVersionId: string | null;
  portfolioItemIds: string[];
  deliveryIds: string[];
  messageIds: string[];
}

export function parseEvidenceIds(raw: string): EvidenceIds {
  const parsed = JSON.parse(raw || '{}') as Partial<EvidenceIds>;
  return {
    agreementVersionId: parsed.agreementVersionId ?? null,
    portfolioItemIds: Array.isArray(parsed.portfolioItemIds) ? parsed.portfolioItemIds : [],
    deliveryIds: Array.isArray(parsed.deliveryIds) ? parsed.deliveryIds : [],
    messageIds: Array.isArray(parsed.messageIds) ? parsed.messageIds : [],
  };
}

function evidenceView(db: Db, projectId: string, raw: string): RefundEvidenceView {
  const ids = parseEvidenceIds(raw);
  const portfolio = ids.portfolioItemIds.length
    ? all<{ id: string; title: string }>(db, `SELECT id, title FROM portfolio_items WHERE id IN (${ids.portfolioItemIds.map(() => '?').join(',')})`, ...ids.portfolioItemIds)
    : [];
  const deliveries = ids.deliveryIds.length
    ? all<{ id: string; file_name: string }>(db, `SELECT id, file_name FROM deliveries WHERE project_id = ? AND id IN (${ids.deliveryIds.map(() => '?').join(',')})`, projectId, ...ids.deliveryIds)
    : [];
  const messages = ids.messageIds.length
    ? all<{ id: string; body: string; created_at: string; name: string }>(
        db,
        `SELECT m.id, m.body, m.created_at, u.name FROM messages m JOIN users u ON u.id = m.author_id
          WHERE m.project_id = ? AND m.id IN (${ids.messageIds.map(() => '?').join(',')}) ORDER BY m.created_at`,
        projectId,
        ...ids.messageIds,
      )
    : [];
  return {
    agreementVersionId: ids.agreementVersionId,
    portfolio,
    deliveries: deliveries.map((d) => ({ id: d.id, fileName: d.file_name })),
    messages: messages.map((m) => ({ id: m.id, authorName: m.name, body: m.body, createdAt: m.created_at })),
  };
}

function notesView(db: Db, requestId: string): RefundNoteView[] {
  return all<{ id: string; author_role: PolicyAuthorRole; body: string; created_at: string; name: string }>(
    db,
    `SELECT n.id, n.author_role, n.body, n.created_at, u.name FROM refund_request_notes n JOIN users u ON u.id = n.author_id
      WHERE n.request_id = ? ORDER BY n.created_at`,
    requestId,
  ).map((n) => ({ id: n.id, authorRole: n.author_role, authorName: n.name, body: n.body, createdAt: n.created_at }));
}

/** Requests for one project, as one participant sees them. */
export function refundRequestViews(db: Db, projectId: string, viewerId: string | null): RefundRequestView[] {
  const project = get<{ customer_id: string; status: string }>(db, 'SELECT customer_id, status FROM projects WHERE id = ?', projectId);
  if (!project) return [];
  const viewerIsCustomer = viewerId !== null && viewerId === project.customer_id;
  const viewerIsMember =
    viewerId !== null &&
    Boolean(get(db, "SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ? AND status IN ('invited','accepted')", projectId, viewerId));
  return requestsForProject(db, projectId).map((row) => {
    const copy = REFUND_STATUS_COPY[row.status];
    const refundedCents =
      get<{ total: number }>(
        db,
        "SELECT COALESCE(SUM(amount_cents), 0) AS total FROM refund_transfers WHERE request_id = ? AND status = 'succeeded'",
        row.id,
      )?.total ?? 0;
    const isOpen = OPEN_REQUEST_STATUSES.includes(row.status);
    const decision =
      row.decided_at && row.decision_kind
        ? { note: row.decision_note, decidedAt: row.decided_at, decidedBy: row.decision_kind === 'policy' ? ('policy' as const) : ('platform' as const) }
        : null;
    return {
      id: row.id,
      reason: row.reason,
      status: row.status,
      statusLabel: copy.label,
      statusExplanation: copy.explanation,
      requestedCents: row.requested_cents,
      approvedCents: row.approved_cents,
      refundedCents,
      qualifies72h: row.reason === 'cancellation' && row.qualifies_72h !== null ? row.qualifies_72h === 1 : null,
      cancelledAt: row.cancelled_at,
      scheduledStart: row.scheduled_start,
      policyVersion: row.policy_version,
      description: row.description,
      evidence: evidenceView(db, projectId, row.evidence),
      decision,
      notes: notesView(db, row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      viewer: {
        canWithdraw: viewerIsCustomer && row.reason !== 'cancellation' && isOpen,
        canAddNote: (viewerIsCustomer || viewerIsMember) && isOpen,
        canRetry: viewerIsCustomer && row.status === 'refund_failed',
      },
    } satisfies RefundRequestView;
  });
}

interface BookingRow {
  policy_version: string;
  terms_version: string;
  accepted_at: string | null;
  booked_at: string;
  scheduled_start: string | null;
  snapshot: string;
}

interface BookingSnapshot {
  members: Array<{
    userId: string;
    name: string;
    packageName: string;
    priceCents: number;
    services: string[];
    portfolio: Array<{ id: string; title: string; kind: 'photo' | 'video' }>;
  }>;
}

/** What the customer was buying when the deposit was confirmed, and the policy versions they accepted. */
export function bookingRecordFor(db: Db, projectId: string): BookingRecordView | null {
  const row = get<BookingRow>(db, 'SELECT * FROM booking_records WHERE project_id = ?', projectId);
  if (!row) return null;
  const snapshot = JSON.parse(row.snapshot) as BookingSnapshot;
  return {
    policyVersion: row.policy_version,
    termsVersion: row.terms_version,
    acceptedAt: row.accepted_at,
    bookedAt: row.booked_at,
    scheduledStart: row.scheduled_start,
    paidCents: grossPaidCents(db, projectId),
    members: snapshot.members.map((m) => ({
      userId: m.userId,
      name: m.name,
      packageName: m.packageName,
      priceCents: m.priceCents,
      services: m.services,
      portfolio: m.portfolio.map((p) => ({ id: p.id, title: p.title, kind: p.kind })),
    })),
  };
}

/** Ids of portfolio items that were part of the booking. Evidence may only cite these, or the creator's current items. */
export function bookedPortfolioIds(db: Db, projectId: string): Set<string> {
  const row = get<{ snapshot: string }>(db, 'SELECT snapshot FROM booking_records WHERE project_id = ?', projectId);
  const ids = new Set<string>();
  if (!row) return ids;
  const snapshot = JSON.parse(row.snapshot) as BookingSnapshot;
  for (const member of snapshot.members) for (const item of member.portfolio) ids.add(item.id);
  return ids;
}

export function creatorTermsOrder(raw: string | null | undefined): string[] {
  return parseJsonArray<string>(raw ?? '[]');
}
