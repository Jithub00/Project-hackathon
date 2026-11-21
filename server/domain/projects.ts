import {
  addDaysIso,
  all,
  bool,
  daysBetween,
  get,
  newId,
  nowIso,
  parseJsonArray,
  run,
  todayIso,
  transaction,
  type Db,
} from '../db';
import { conflict, forbidden, HttpError, notFound } from '../http';
import { coverageIncludes, isLaNeighborhood } from '../../shared/service-area';
import { quoteTeam } from '../../shared/pricing';
import { requiredApproverIds, summarizeChanges } from '../../shared/brief';
import { STATUS_META } from '../../shared/status';
import { SERVICE_KIND_LABEL } from '../../shared/constants';
import { initialsFor, getCreatorRow, getUserRow, reviewsWhere, type UserRow } from './people';
import { SERVICE_AREA_NAME } from '../../shared/service-area';
import { REFUND_POLICY_VERSION, TERMS_VERSION } from '../../shared/policy';
import { bookingRecordFor, cancellationPreview, grossPaidCents, refundRequestViews } from './refund-core';
import { recordPolicyAcceptance, type AcceptedVersions } from './policy';
import type {
  BriefContent,
  BriefMember,
  BriefVersion,
  DeliveryView,
  EventView,
  MemberStatus,
  MessageView,
  NextStep,
  Permissions,
  ProjectDetail,
  ProjectMember,
  ProjectStatus,
  ProjectSummary,
  QuoteView,
  RevisionView,
  ReviewItem,
  Role,
  ServiceNeed,
  PaymentView,
  PayoutView,
} from '../../shared/types';
import type { BriefDraftInput, ProjectCreateInput, ReviewInput } from '../../shared/schemas';

export interface ProjectRow {
  id: string;
  customer_id: string;
  title: string;
  content_type: string;
  services: ServiceNeed;
  budget_cents: number;
  neighborhood: string;
  location_detail: string;
  style_tags: string;
  preferred_dates: string;
  description: string;
  visibility: 'invite' | 'open';
  status: ProjectStatus;
  shoot_date: string | null;
  delivery_deadline: string | null;
  dispute_reason: string | null;
  is_demo: number;
  created_at: string;
  updated_at: string;
}

interface BriefRow {
  id: string;
  project_id: string;
  version_no: number;
  status: BriefVersion['status'];
  content: string;
  required_approvers: string;
  created_by: string;
  created_at: string;
  accepted_at: string | null;
}

interface MemberRow {
  id: string;
  project_id: string;
  user_id: string;
  status: MemberStatus;
  message: string;
  name: string;
  is_demo: number;
}

const POST_AGREEMENT: ProjectStatus[] = ['agreed', 'booked', 'delivered', 'revision_requested', 'completed'];
const OPEN_FOR_EDITS: ProjectStatus[] = ['draft', 'recruiting'];
const CANCELLABLE: ProjectStatus[] = ['draft', 'recruiting', 'agreement_pending', 'agreed', 'booked', 'delivered', 'revision_requested'];
// Creators can only cancel once a booking is confirmed; before that they decline the invitation.
const POST_BOOKING: ProjectStatus[] = ['booked', 'delivered', 'revision_requested'];
const DISPUTABLE: ProjectStatus[] = ['booked', 'delivered', 'revision_requested', 'completed'];

const RESPONSIBILITY_DEFAULTS: Record<'photography' | 'videography', string> = {
  photography:
    'Plan the shot list with the client, shoot on location, cull the selects, and deliver retouched photos in the agreed quantity.',
  videography:
    'Plan the shot list, capture the footage on location, edit the cut(s) to the agreed length, and deliver the final files.',
};

export function getProjectRow(db: Db, id: string): ProjectRow | undefined {
  return get<ProjectRow>(db, 'SELECT * FROM projects WHERE id = ?', id);
}

export function requireProject(db: Db, id: string): ProjectRow {
  const row = getProjectRow(db, id);
  if (!row) throw notFound('That project could not be found.');
  return row;
}

export function logEvent(db: Db, projectId: string, actorId: string | null, message: string): void {
  run(db, 'INSERT INTO project_events (id, project_id, actor_id, message, created_at) VALUES (?, ?, ?, ?, ?)', newId(), projectId, actorId, message, nowIso());
}

function setStatus(db: Db, projectId: string, status: ProjectStatus): void {
  run(db, 'UPDATE projects SET status = ?, updated_at = ? WHERE id = ?', status, nowIso(), projectId);
}

function briefRows(db: Db, projectId: string): BriefRow[] {
  return all<BriefRow>(db, 'SELECT * FROM brief_versions WHERE project_id = ? ORDER BY version_no', projectId);
}

function findBrief(db: Db, projectId: string, status: BriefVersion['status']): BriefRow | undefined {
  return get<BriefRow>(
    db,
    'SELECT * FROM brief_versions WHERE project_id = ? AND status = ? ORDER BY version_no DESC LIMIT 1',
    projectId,
    status,
  );
}

function parseContent(raw: string): BriefContent {
  return JSON.parse(raw) as BriefContent;
}

function memberRows(db: Db, projectId: string): MemberRow[] {
  return all<MemberRow>(
    db,
    `SELECT m.id, m.project_id, m.user_id, m.status, m.message, u.name, u.is_demo
       FROM project_members m JOIN users u ON u.id = m.user_id
      WHERE m.project_id = ? ORDER BY u.name`,
    projectId,
  );
}

function approvalIds(db: Db, versionId: string): Set<string> {
  return new Set(all<{ user_id: string }>(db, 'SELECT user_id FROM brief_approvals WHERE version_id = ?', versionId).map((r) => r.user_id));
}

function approverNames(db: Db, ids: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const id of ids) {
    const user = getUserRow(db, id);
    map.set(id, user?.name ?? 'Unknown');
  }
  return map;
}

function briefView(db: Db, row: BriefRow, accepted: BriefRow | undefined): BriefVersion {
  const content = parseContent(row.content);
  const requiredIds = parseJsonArray<string>(row.required_approvers);
  const approved = approvalIds(db, row.id);
  const names = approverNames(db, requiredIds);
  const acceptedContent = accepted && accepted.id !== row.id ? parseContent(accepted.content) : null;
  return {
    id: row.id,
    versionNo: row.version_no,
    status: row.status,
    content,
    approvers: requiredIds.map((userId) => ({ userId, name: names.get(userId) ?? 'Unknown', approved: approved.has(userId) })),
    changeSummary: row.status === 'accepted' ? [] : summarizeChanges(acceptedContent, content),
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
  };
}

function customerLabel(db: Db, customerId: string): { id: string; name: string } {
  const user = getUserRow(db, customerId);
  return { id: customerId, name: user?.name ?? 'Customer' };
}

/** Builds a team member snapshot from a creator's package. Throws when the package does not belong to the creator. */
function snapshotMember(db: Db, creatorId: string, packageId: string, responsibilities: string): BriefMember {
  const creator = getUserRow(db, creatorId);
  if (!creator || creator.role !== 'creator' || !getCreatorRow(db, creatorId)) {
    throw new HttpError(400, 'That creator is not available on Photo Shoot.', 'INVALID_CREATOR');
  }
  const pkg = get<{ id: string; service: 'photography' | 'videography'; name: string; hours: number; price_cents: number }>(
    db,
    'SELECT id, service, name, hours, price_cents FROM creator_packages WHERE id = ? AND creator_id = ?',
    packageId,
    creatorId,
  );
  if (!pkg) throw new HttpError(400, 'Choose a package offered by this creator.', 'INVALID_PACKAGE');
  return {
    userId: creatorId,
    creatorName: creator.name,
    roleLabel: SERVICE_KIND_LABEL[pkg.service],
    service: pkg.service,
    packageId: pkg.id,
    packageName: pkg.name,
    hours: pkg.hours,
    priceCents: pkg.price_cents,
    responsibilities,
  };
}

function baseContentFromProject(project: ProjectRow): BriefContent {
  const styles = parseJsonArray<string>(project.style_tags);
  const preferred = parseJsonArray<string>(project.preferred_dates);
  const shootDate = preferred[0] ?? addDaysIso(todayIso(), 21);
  return {
    title: project.title,
    goals: project.description.trim() || `Capture ${project.content_type.toLowerCase()} content in ${project.neighborhood}.`,
    creativeDirection: styles.length > 0 ? `Visual style: ${styles.join(', ')}.` : 'Visual style to be agreed with the team.',
    shootDate,
    shootStartTime: '09:00',
    durationHours: 4,
    neighborhood: project.neighborhood,
    locationDetail: project.location_detail,
    photoCount: project.services === 'videography' ? 0 : 40,
    video: { count: project.services === 'photography' ? 0 : 1, lengthSeconds: 60 },
    otherDeliverables: '',
    editingRequirements: 'Color-corrected selects and final edits. Basic retouching is included.',
    includedRevisions: 2,
    deliveryDeadline: addDaysIso(shootDate, 14),
    usageRights: 'social-web-12m',
    members: [],
  };
}

function ensureDraft(db: Db, project: ProjectRow, actorId: string): BriefRow {
  const existing = findBrief(db, project.id, 'draft');
  if (existing) return existing;
  const accepted = findBrief(db, project.id, 'accepted');
  const latest = briefRows(db, project.id).at(-1);
  const base = accepted ? parseContent(accepted.content) : latest ? parseContent(latest.content) : baseContentFromProject(project);
  const versionNo = (latest?.version_no ?? 0) + 1;
  const id = newId();
  run(
    db,
    `INSERT INTO brief_versions (id, project_id, version_no, status, content, required_approvers, created_by, created_at)
     VALUES (?, ?, ?, 'draft', ?, '[]', ?, ?)`,
    id,
    project.id,
    versionNo,
    JSON.stringify(base),
    actorId,
    nowIso(),
  );
  return get<BriefRow>(db, 'SELECT * FROM brief_versions WHERE id = ?', id) as BriefRow;
}

function writeDraftContent(db: Db, draftId: string, content: BriefContent): void {
  run(db, 'UPDATE brief_versions SET content = ? WHERE id = ?', JSON.stringify(content), draftId);
}

function paymentSums(db: Db, projectId: string): { depositPaid: number; balancePaid: number } {
  const rows = all<{ kind: string; total: number }>(
    db,
    `SELECT kind, SUM(amount_cents) AS total FROM payments WHERE project_id = ? AND status = 'succeeded' GROUP BY kind`,
    projectId,
  );
  return {
    depositPaid: rows.find((r) => r.kind === 'deposit')?.total ?? 0,
    balancePaid: rows.find((r) => r.kind === 'balance')?.total ?? 0,
  };
}

function quoteFor(db: Db, projectId: string): QuoteView {
  const accepted = findBrief(db, projectId, 'accepted');
  const draft = findBrief(db, projectId, 'draft') ?? findBrief(db, projectId, 'pending');
  const basisRow = accepted ?? draft;
  if (!basisRow) {
    return { basis: 'none', subtotalCents: 0, customerFeeCents: 0, totalCents: 0, depositCents: 0, balanceCents: 0, creatorCommissionCents: 0, creatorPayoutCents: 0, lines: [] };
  }
  const members = parseContent(basisRow.content).members;
  const quote = quoteTeam(members.map((m) => ({ userId: m.userId, priceCents: m.priceCents })));
  return {
    basis: accepted ? 'accepted' : 'draft',
    subtotalCents: quote.subtotalCents,
    customerFeeCents: quote.customerFeeCents,
    totalCents: quote.totalCents,
    depositCents: quote.depositCents,
    balanceCents: quote.balanceCents,
    creatorCommissionCents: quote.creatorCommissionCents,
    creatorPayoutCents: quote.creatorPayoutCents,
    lines: members.map((m) => {
      const split = quote.members.find((x) => x.userId === m.userId);
      return {
        userId: m.userId,
        name: m.creatorName,
        roleLabel: m.roleLabel,
        packageName: m.packageName,
        priceCents: m.priceCents,
        payoutCents: split?.payoutCents ?? m.priceCents,
        commissionCents: split?.commissionCents ?? 0,
      };
    }),
  };
}

function viewerRoleFor(project: ProjectRow, members: MemberRow[], viewerId: string | null): Role | null {
  if (!viewerId) return null;
  if (project.customer_id === viewerId) return 'customer';
  if (members.some((m) => m.user_id === viewerId)) return 'creator';
  return null;
}

interface NextStepContext {
  role: Role | null;
  viewerStatus: MemberStatus | null;
  pending: BriefRow | undefined;
  viewerMustApprove: boolean;
  depositPaid: boolean;
  balancePaid: boolean;
  acceptedCount: number;
  invitedCount: number;
  revisionsUsed: number;
  revisionsIncluded: number;
  reviewPending: boolean;
  hasAccepted: boolean;
  hasDraftChanges: boolean;
}

export function computeNextStep(project: ProjectRow, ctx: NextStepContext): NextStep {
  const shoot = project.shoot_date ? new Date(`${project.shoot_date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }) : null;
  const deadline = project.delivery_deadline
    ? new Date(`${project.delivery_deadline}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
    : null;
  const s = project.status;
  if (s === 'cancelled') return { forRole: 'none', title: 'Project cancelled', body: 'No further action is needed. Any refund is shown in the Payments section.', action: 'none' };
  if (s === 'disputed') return { forRole: 'both', title: 'Dispute open', body: 'Payouts are held while the Photo Shoot team reviews the dispute. We do not yet publish a reply time.', action: 'none' };

  if (ctx.role === 'creator') {
    if (ctx.viewerStatus === 'interested') return { forRole: 'creator', title: 'Interest sent', body: 'The customer will review your note and may invite you to the team.', action: 'none' };
    if (ctx.viewerStatus === 'declined') return { forRole: 'creator', title: 'Invitation declined', body: 'You are no longer on this team.', action: 'none' };
    if (ctx.viewerStatus === 'invited') return { forRole: 'creator', title: 'You are invited', body: 'Accept to join the team, or decline. Accepting does not book the shoot yet.', action: 'accept' };
    if (s === 'draft' || s === 'recruiting') return { forRole: 'creator', title: 'Waiting for the agreement', body: 'The customer will send the brief for approval once the whole team has accepted.', action: 'none' };
    if (s === 'agreement_pending') {
      if (ctx.viewerMustApprove) return { forRole: 'creator', title: 'Approve the brief', body: 'Read the brief, the responsibilities and the price. Approve it if you agree.', action: 'approve' };
      return { forRole: 'creator', title: 'Waiting for approvals', body: 'Everyone on the team must approve before the booking can be paid.', action: 'none' };
    }
    if (s === 'agreed') return { forRole: 'creator', title: 'Waiting for the deposit', body: 'The customer pays the deposit to confirm the booking.', action: 'none' };
    if (s === 'booked') return { forRole: 'creator', title: 'Shoot is booked', body: shoot ? `Prepare for the shoot on ${shoot}. Upload files by ${deadline ?? 'the delivery deadline'}.` : 'Prepare for the shoot.', action: 'none' };
    if (s === 'revision_requested') return { forRole: 'creator', title: 'Revision requested', body: `Upload the revised files. ${ctx.revisionsUsed} of ${ctx.revisionsIncluded} included revisions used.`, action: 'upload' };
    if (s === 'delivered') return { forRole: 'creator', title: 'Waiting for the customer', body: 'The customer reviews the files and can request an included revision or confirm completion.', action: 'none' };
    if (s === 'completed') return { forRole: 'creator', title: 'Awaiting final payment', body: 'The customer is paying the balance. Payouts are scheduled after it clears.', action: 'none' };
    if (s === 'closed') {
      return ctx.reviewPending
        ? { forRole: 'creator', title: 'Leave a review', body: 'Share how the customer communicated and whether the brief was clear.', action: 'review' }
        : { forRole: 'creator', title: 'Project closed', body: 'Payouts are scheduled. Thanks for delivering.', action: 'none' };
    }
  }

  if (ctx.role === 'customer') {
    if (s === 'draft') {
      return ctx.invitedCount + ctx.acceptedCount === 0
        ? { forRole: 'customer', title: 'Invite your team', body: 'Choose creators to invite. Their prices and availability appear before anything is committed.', action: 'invite' }
        : { forRole: 'customer', title: 'Invite your team', body: 'Add the roles you still need, then send the agreement when everyone has accepted.', action: 'invite' };
    }
    if (s === 'recruiting') {
      if (ctx.invitedCount > 0) return { forRole: 'customer', title: 'Waiting for creators to respond', body: `${ctx.invitedCount} invitation${ctx.invitedCount === 1 ? '' : 's'} still open. Accepted creators can already be part of the agreement.`, action: 'none' };
      if (ctx.hasAccepted) return { forRole: 'customer', title: 'Send the agreement', body: 'Everyone on the team has accepted. Send the brief so each person can approve the same terms.', action: 'send_agreement' };
      return { forRole: 'customer', title: 'Invite creators', body: 'Invite a creator, or publish this brief as an open call for Los Angeles creators.', action: 'invite' };
    }
    if (s === 'agreement_pending') return { forRole: 'customer', title: 'Waiting for approvals', body: 'Approvals are in progress. The deposit unlocks when every required person has approved.', action: ctx.viewerMustApprove ? 'approve' : 'none' };
    if (s === 'agreed') return { forRole: 'customer', title: 'Pay the deposit', body: 'The brief is approved. Pay the deposit to confirm the booking.', action: 'pay_deposit' };
    if (s === 'booked') {
      if (ctx.hasDraftChanges) return { forRole: 'customer', title: 'Change request ready', body: 'You have unsent changes. Send them for approval if the team needs to agree.', action: 'send_agreement' };
      return { forRole: 'customer', title: 'Shoot is booked', body: shoot ? `The shoot is on ${shoot}. The creators upload files by ${deadline ?? 'the delivery deadline'}.` : 'The shoot is booked.', action: 'none' };
    }
    if (s === 'delivered') return { forRole: 'customer', title: 'Review the files', body: `Download the files. Request one of the ${ctx.revisionsIncluded} included revisions, or confirm completion when you are satisfied.`, action: 'confirm_completion' };
    if (s === 'revision_requested') return { forRole: 'customer', title: 'Revision in progress', body: 'Your revision request was sent. The creators upload the updated files next.', action: 'none' };
    if (s === 'completed') return { forRole: 'customer', title: 'Pay the balance', body: 'You confirmed completion. Pay the remaining balance to close the project and release payouts.', action: 'pay_balance' };
    if (s === 'closed') {
      return ctx.reviewPending
        ? { forRole: 'customer', title: 'Leave reviews', body: 'Review each creator on communication, reliability, professionalism and quality.', action: 'review' }
        : { forRole: 'customer', title: 'Project closed', body: 'Everything is delivered and paid. Thank you for working with Photo Shoot.', action: 'none' };
    }
  }

  return { forRole: 'none', title: STATUS_META[s].label, body: STATUS_META[s].description, action: 'none' };
}

function nextStepContext(db: Db, project: ProjectRow, members: MemberRow[], viewerId: string | null): NextStepContext {
  const role = viewerRoleFor(project, members, viewerId);
  const pending = findBrief(db, project.id, 'pending');
  const accepted = findBrief(db, project.id, 'accepted');
  const draft = findBrief(db, project.id, 'draft');
  const payments = paymentSums(db, project.id);
  const revisionsUsed = (get<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM revision_requests WHERE project_id = ?', project.id)?.count ?? 0);
  const acceptedContent = accepted ? parseContent(accepted.content) : null;
  const draftContent = draft ? parseContent(draft.content) : null;
  const reviewCount = viewerId
    ? (get<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM reviews WHERE project_id = ? AND reviewer_id = ?', project.id, viewerId)?.count ?? 0)
    : 0;
  const expectedReviews = role === 'customer' ? members.filter((m) => m.status === 'accepted').length : role === 'creator' ? 1 : 0;
  const viewerMember = viewerId ? members.find((m) => m.user_id === viewerId) : undefined;
  const pendingApprovers = pending ? parseJsonArray<string>(pending.required_approvers) : [];
  const viewerApproved = pending && viewerId ? approvalIds(db, pending.id).has(viewerId) : false;
  return {
    role,
    viewerStatus: viewerMember?.status ?? null,
    pending,
    viewerMustApprove: Boolean(pending && viewerId && pendingApprovers.includes(viewerId) && !viewerApproved),
    depositPaid: payments.depositPaid > 0,
    balancePaid: payments.balancePaid > 0,
    acceptedCount: members.filter((m) => m.status === 'accepted').length,
    invitedCount: members.filter((m) => m.status === 'invited').length,
    revisionsUsed,
    revisionsIncluded: acceptedContent?.includedRevisions ?? 0,
    reviewPending: expectedReviews > 0 && reviewCount < expectedReviews,
    hasAccepted: members.some((m) => m.status === 'accepted'),
    hasDraftChanges: Boolean(acceptedContent && draftContent && summarizeChanges(acceptedContent, draftContent).length > 0),
  };
}

export function buildSummary(db: Db, project: ProjectRow, viewerId: string | null): ProjectSummary {
  const members = memberRows(db, project.id);
  const ctx = nextStepContext(db, project, members, viewerId);
  const accepted = findBrief(db, project.id, 'accepted');
  const content = accepted ? parseContent(accepted.content) : null;
  return {
    id: project.id,
    title: project.title,
    contentType: project.content_type,
    services: project.services,
    status: project.status,
    statusLabel: STATUS_META[project.status].label,
    visibility: project.visibility,
    neighborhood: project.neighborhood,
    budgetCents: project.budget_cents,
    shootDate: content?.shootDate ?? project.shoot_date,
    deliveryDeadline: content?.deliveryDeadline ?? project.delivery_deadline,
    customer: customerLabel(db, project.customer_id),
    nextStep: computeNextStep(project, ctx),
    updatedAt: project.updated_at,
    memberCount: members.filter((m) => m.status === 'accepted' || m.status === 'invited').length,
  };
}

function permissionsFor(db: Db, project: ProjectRow, members: MemberRow[], viewerId: string | null): Permissions {
  const role = viewerRoleFor(project, members, viewerId);
  const isCustomer = role === 'customer';
  const isMember = role === 'creator';
  const accepted = findBrief(db, project.id, 'accepted');
  const pending = findBrief(db, project.id, 'pending');
  const draft = findBrief(db, project.id, 'draft');
  const payments = paymentSums(db, project.id);
  const revisionsUsed = get<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM revision_requests WHERE project_id = ?', project.id)?.count ?? 0;
  const included = accepted ? parseContent(accepted.content).includedRevisions : 0;
  const viewerMember = viewerId ? members.find((m) => m.user_id === viewerId) : undefined;
  const approvedByViewer = pending && viewerId ? approvalIds(db, pending.id).has(viewerId) : false;
  const mustApprove = Boolean(pending && viewerId && parseJsonArray<string>(pending.required_approvers).includes(viewerId) && !approvedByViewer);
  const acceptedMembers = members.filter((m) => m.status === 'accepted');
  const draftHasChanges = accepted && draft ? summarizeChanges(parseContent(accepted.content), parseContent(draft.content)).length > 0 : Boolean(draft && !accepted);
  const canEditBase = isCustomer && !pending && (OPEN_FOR_EDITS.includes(project.status) || (Boolean(accepted) && POST_AGREEMENT.includes(project.status) && project.status !== 'completed'));
  const isParticipant = isCustomer || (isMember && viewerMember !== undefined && ['accepted', 'invited'].includes(viewerMember.status));
  return {
    viewerRole: role,
    viewerIsCustomer: isCustomer,
    viewerIsMember: isMember,
    canEditDraft: canEditBase,
    canInvite: isCustomer && OPEN_FOR_EDITS.includes(project.status) && !pending,
    canSendAgreement:
      isCustomer &&
      !pending &&
      Boolean(draft) &&
      (accepted ? POST_AGREEMENT.includes(project.status) && project.status !== 'completed' && draftHasChanges : OPEN_FOR_EDITS.includes(project.status)) &&
      acceptedMembers.length > 0 &&
      members.filter((m) => m.status === 'invited').length === 0 &&
      parseContent(draft!.content).members.length > 0,
    canApprove: mustApprove,
    canProposeChange: isCustomer && Boolean(accepted) && !pending && POST_AGREEMENT.includes(project.status) && project.status !== 'completed',
    canAcceptInvite: isMember && viewerMember?.status === 'invited' && OPEN_FOR_EDITS.includes(project.status),
    canDeliver: isMember && viewerMember?.status === 'accepted' && ['booked', 'delivered', 'revision_requested'].includes(project.status),
    canRequestRevision: isCustomer && project.status === 'delivered' && revisionsUsed < included,
    canConfirmCompletion: isCustomer && project.status === 'delivered',
    canPayDeposit: isCustomer && project.status === 'agreed' && payments.depositPaid === 0 && Boolean(accepted),
    canPayBalance: isCustomer && project.status === 'completed' && payments.balancePaid === 0,
    canCancel: CANCELLABLE.includes(project.status) && (isCustomer || (isParticipant && POST_BOOKING.includes(project.status))),
    canDispute: isParticipant && DISPUTABLE.includes(project.status),
    canMessage: isCustomer || (isMember && viewerMember !== undefined && ['accepted', 'invited'].includes(viewerMember.status)),
    canExpressInterest: Boolean(viewerId) && !isCustomer && !viewerMember && project.visibility === 'open' && project.status === 'recruiting',
  };
}

export function buildDetail(db: Db, project: ProjectRow, viewerId: string | null): ProjectDetail {
  const members = memberRows(db, project.id);
  const summary = buildSummary(db, project, viewerId);
  const accepted = findBrief(db, project.id, 'accepted');
  const pending = findBrief(db, project.id, 'pending');
  const draft = findBrief(db, project.id, 'draft');
  const included = accepted ? parseContent(accepted.content).includedRevisions : 0;
  const revisionRows = all<{ id: string; notes: string; status: 'open' | 'completed'; requested_by: string; created_at: string; completed_at: string | null }>(
    db,
    'SELECT * FROM revision_requests WHERE project_id = ? ORDER BY created_at',
    project.id,
  );
  const deliveries = all<{ id: string; round: number; file_name: string; file_url: string; kind: 'photo' | 'video' | 'other'; size_bytes: number; note: string; uploaded_by: string; created_at: string }>(
    db,
    'SELECT * FROM deliveries WHERE project_id = ? ORDER BY created_at',
    project.id,
  );
  const messages = all<{ id: string; author_id: string; body: string; created_at: string; name: string; role: Role }>(
    db,
    `SELECT m.id, m.author_id, m.body, m.created_at, u.name, u.role FROM messages m JOIN users u ON u.id = m.author_id
      WHERE m.project_id = ? ORDER BY m.created_at`,
    project.id,
  );
  const events = all<{ id: string; message: string; created_at: string }>(
    db,
    'SELECT id, message, created_at FROM project_events WHERE project_id = ? ORDER BY created_at DESC LIMIT 40',
    project.id,
  );
  const paymentRows = all<{ id: string; kind: PaymentView['kind']; amount_cents: number; status: PaymentView['status']; provider: PaymentView['provider']; created_at: string; updated_at: string }>(
    db,
    'SELECT id, kind, amount_cents, status, provider, created_at, updated_at FROM payments WHERE project_id = ? ORDER BY created_at',
    project.id,
  );
  const payoutRows = all<{ amount_cents: number; commission_cents: number; status: PayoutView['status']; scheduled_for: string; name: string }>(
    db,
    `SELECT p.amount_cents, p.commission_cents, p.status, p.scheduled_for, u.name FROM payouts p JOIN users u ON u.id = p.creator_id WHERE p.project_id = ? ORDER BY u.name`,
    project.id,
  );
  const reviews: ReviewItem[] = reviewsForProject(db, project.id);
  const viewerRole = viewerRoleFor(project, members, viewerId);
  const viewerMember = viewerId ? members.find((m) => m.user_id === viewerId) : undefined;
  const reviewTargets: ProjectDetail['reviewTargets'] = [];
  if (viewerRole === 'customer') {
    for (const m of members.filter((x) => x.status === 'accepted')) {
      reviewTargets.push({
        userId: m.user_id,
        name: m.name,
        alreadyReviewed: Boolean(get(db, 'SELECT 1 FROM reviews WHERE project_id = ? AND reviewer_id = ? AND reviewee_id = ?', project.id, viewerId, m.user_id)),
      });
    }
  } else if (viewerRole === 'creator' && viewerMember?.status === 'accepted') {
    reviewTargets.push({
      userId: project.customer_id,
      name: customerLabel(db, project.customer_id).name,
      alreadyReviewed: Boolean(get(db, 'SELECT 1 FROM reviews WHERE project_id = ? AND reviewer_id = ? AND reviewee_id = ?', project.id, viewerId, project.customer_id)),
    });
  }
  const interest = viewerId && viewerRole === 'creator' && viewerMember ? { status: viewerMember.status, message: viewerMember.message } : null;
  const quote = quoteFor(db, project.id);
  const projectMembers: ProjectMember[] = members.map((m) => ({
    userId: m.user_id,
    name: m.name,
    initials: initialsFor(m.name),
    status: m.status,
    message: m.message,
    isDemo: m.is_demo === 1,
  }));
  return {
    ...summary,
    description: project.description,
    locationDetail: project.location_detail,
    styleTags: parseJsonArray<string>(project.style_tags),
    preferredDates: parseJsonArray<string>(project.preferred_dates),
    members: viewerRole ? projectMembers : [],
    accepted: accepted ? briefView(db, accepted, accepted) : null,
    draft: draft ? briefView(db, draft, accepted) : null,
    pending: pending ? briefView(db, pending, accepted) : null,
    quote,
    payments: paymentRows.map((p) => ({ id: p.id, kind: p.kind, amountCents: p.amount_cents, status: p.status, provider: p.provider, createdAt: p.created_at, updatedAt: p.updated_at })),
    payouts: payoutRows.map((p) => ({ creatorName: p.name, amountCents: p.amount_cents, commissionCents: p.commission_cents, status: p.status, scheduledFor: p.scheduled_for })),
    deliveries: deliveries.map((d): DeliveryView => ({
      id: d.id,
      round: d.round,
      fileName: d.file_name,
      fileUrl: d.file_url,
      kind: d.kind,
      sizeBytes: d.size_bytes,
      note: d.note,
      uploadedBy: d.uploaded_by,
      createdAt: d.created_at,
    })),
    revisions: revisionRows.map((r): RevisionView => ({
      id: r.id,
      notes: r.notes,
      status: r.status,
      requestedBy: r.requested_by,
      createdAt: r.created_at,
      completedAt: r.completed_at,
    })),
    revisionsIncluded: included,
    revisionsUsed: revisionRows.length,
    messages: permissionsFor(db, project, members, viewerId).canMessage ? messages.map((m): MessageView => ({ id: m.id, authorId: m.author_id, authorName: m.name, authorRole: m.role, body: m.body, createdAt: m.created_at })) : [],
    events: events.map((e): EventView => ({ id: e.id, message: e.message, createdAt: e.created_at })),
    reviews,
    reviewTargets,
    disputeReason: project.dispute_reason,
    permissions: permissionsFor(db, project, members, viewerId),
    viewerUserId: viewerId,
    interest,
    paidCents: grossPaidCents(db, project.id),
    refundRequests: refundRequestViews(db, project.id, viewerId),
    booking: viewerRole ? bookingRecordFor(db, project.id) : null,
    cancellation: cancellationPreview(db, project, new Date()),
    policy: { refundVersion: REFUND_POLICY_VERSION, termsVersion: TERMS_VERSION },
  };
}

function reviewsForProject(db: Db, projectId: string): ReviewItem[] {
  return reviewsWhere(db, 'r.project_id = ?', [projectId], 200);
}

/* ------------------------------------------------------------------ */
/* Commands                                                             */
/* ------------------------------------------------------------------ */

function assertCustomerOwner(user: UserRow, project: ProjectRow): void {
  if (user.role !== 'customer' || project.customer_id !== user.id) {
    throw forbidden('Only the customer who created this project can change it.');
  }
}

function assertParticipant(db: Db, user: UserRow, project: ProjectRow): MemberRow | null {
  if (project.customer_id === user.id) return null;
  const member = memberRows(db, project.id).find((m) => m.user_id === user.id);
  if (!member) throw forbidden('You are not part of this project.');
  return member;
}

export function createProject(db: Db, customer: UserRow, input: ProjectCreateInput): ProjectDetail {
  if (customer.role !== 'customer') throw forbidden('Only customer accounts can create projects.');
  if (!isLaNeighborhood(input.neighborhood)) {
    throw new HttpError(400, `Photo Shoot only serves ${SERVICE_AREA_NAME} neighbourhoods.`, 'OUTSIDE_SERVICE_AREA', { neighborhood: 'Choose a Los Angeles neighbourhood.' });
  }
  return transaction(db, () => {
    const id = newId();
    const now = nowIso();
    const status: ProjectStatus = input.invites.length > 0 || input.visibility === 'open' ? 'recruiting' : 'draft';
    run(
      db,
      `INSERT INTO projects (id, customer_id, title, content_type, services, budget_cents, neighborhood, location_detail,
        style_tags, preferred_dates, description, visibility, status, shoot_date, delivery_deadline, dispute_reason, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, ?, ?)`,
      id,
      customer.id,
      input.title,
      input.contentType,
      input.services,
      input.budgetCents,
      input.neighborhood,
      input.locationDetail,
      JSON.stringify(input.styleTags),
      JSON.stringify(input.preferredDates),
      input.description,
      input.visibility,
      status,
      now,
      now,
    );
    const project = requireProject(db, id);
    const content = baseContentFromProject(project);
    content.photoCount = input.photoCount;
    content.video = { count: input.videoCount, lengthSeconds: input.videoLengthSeconds };
    content.includedRevisions = input.includedRevisions;
    content.usageRights = input.usageRights;
    if (input.deliveryDeadline) content.deliveryDeadline = input.deliveryDeadline;
    const members: BriefMember[] = [];
    const roles = new Set<string>();
    for (const invite of input.invites) {
      const creator = getCreatorRow(db, invite.creatorId);
      if (!creator) throw new HttpError(400, 'That creator is not available on Photo Shoot.', 'INVALID_CREATOR');
      if (!coverageIncludes({ citywide: creator.citywide === 1, neighborhoods: parseJsonArray<string>(creator.neighborhoods) }, input.neighborhood)) {
        throw new HttpError(400, `This creator does not cover ${input.neighborhood}.`, 'OUTSIDE_COVERAGE');
      }
      const member = snapshotMember(db, invite.creatorId, invite.packageId, RESPONSIBILITY_DEFAULTS[snapshotService(db, invite.packageId)]);
      if (input.services !== 'both' && member.service !== input.services) {
        throw new HttpError(400, `This project needs ${input.services === 'photography' ? 'photography' : 'videography'}. Choose a package for that service.`, 'SERVICE_MISMATCH');
      }
      if (roles.has(member.service)) throw new HttpError(400, 'Each role can only be filled once per team.', 'DUPLICATE_ROLE');
      roles.add(member.service);
      members.push(member);
      run(
        db,
        'INSERT INTO project_members (id, project_id, user_id, status, message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        newId(),
        id,
        invite.creatorId,
        'invited',
        '',
        now,
        now,
      );
      logEvent(db, id, customer.id, `Invited ${member.creatorName} as ${member.roleLabel.toLowerCase()}`);
    }
    content.members = members;
    run(
      db,
      `INSERT INTO brief_versions (id, project_id, version_no, status, content, required_approvers, created_by, created_at)
       VALUES (?, ?, 1, 'draft', ?, '[]', ?, ?)`,
      newId(),
      id,
      JSON.stringify(content),
      customer.id,
      now,
    );
    logEvent(db, id, customer.id, 'Project brief created');
    return buildDetail(db, requireProject(db, id), customer.id);
  });
}

function snapshotService(db: Db, packageId: string): 'photography' | 'videography' {
  const row = get<{ service: 'photography' | 'videography' }>(db, 'SELECT service FROM creator_packages WHERE id = ?', packageId);
  if (!row) throw new HttpError(400, 'Choose a package offered by this creator.', 'INVALID_PACKAGE');
  return row.service;
}

export function inviteMember(db: Db, customer: UserRow, projectId: string, creatorId: string, packageId: string): ProjectDetail {
  const project = requireProject(db, projectId);
  assertCustomerOwner(customer, project);
  if (!OPEN_FOR_EDITS.includes(project.status) || findBrief(db, projectId, 'pending')) {
    throw conflict('Team changes are locked while an agreement is pending. Withdraw it first.', 'TEAM_LOCKED');
  }
  return transaction(db, () => {
    const creator = getCreatorRow(db, creatorId);
    if (!creator) throw new HttpError(400, 'That creator is not available on Photo Shoot.', 'INVALID_CREATOR');
    const creatorUser = getUserRow(db, creatorId) as UserRow;
    if (creator.seeking_clients !== 1) throw conflict(`${creatorUser.name} is not taking new clients right now.`, 'NOT_SEEKING');
    if (!coverageIncludes({ citywide: creator.citywide === 1, neighborhoods: parseJsonArray<string>(creator.neighborhoods) }, project.neighborhood)) {
      throw new HttpError(400, `${creatorUser.name} does not cover ${project.neighborhood}.`, 'OUTSIDE_COVERAGE');
    }
    const service = snapshotService(db, packageId);
    if (project.services !== 'both' && service !== project.services) {
      throw new HttpError(400, 'Choose a package for the service this project needs.', 'SERVICE_MISMATCH');
    }
    const draft = ensureDraft(db, project, customer.id);
    const content = parseContent(draft.content);
    const others = content.members.filter((m) => m.userId !== creatorId);
    if (others.some((m) => m.service === service)) {
      throw new HttpError(400, `The team already has a ${SERVICE_KIND_LABEL[service].toLowerCase()}. Remove them first.`, 'DUPLICATE_ROLE');
    }
    const member = snapshotMember(db, creatorId, packageId, RESPONSIBILITY_DEFAULTS[service]);
    content.members = [...others, member];
    writeDraftContent(db, draft.id, content);
    const now = nowIso();
    const existing = get<{ id: string; status: MemberStatus }>(db, 'SELECT id, status FROM project_members WHERE project_id = ? AND user_id = ?', projectId, creatorId);
    if (existing) {
      if (existing.status === 'accepted') throw conflict(`${creatorUser.name} has already joined the team.`, 'ALREADY_MEMBER');
      run(db, "UPDATE project_members SET status = 'invited', updated_at = ? WHERE id = ?", now, existing.id);
    } else {
      run(db, 'INSERT INTO project_members (id, project_id, user_id, status, message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', newId(), projectId, creatorId, 'invited', '', now, now);
    }
    if (project.status === 'draft') setStatus(db, projectId, 'recruiting');
    logEvent(db, projectId, customer.id, `Invited ${creatorUser.name} as ${member.roleLabel.toLowerCase()}`);
    return buildDetail(db, requireProject(db, projectId), customer.id);
  });
}

export function removeMember(db: Db, customer: UserRow, projectId: string, creatorId: string): ProjectDetail {
  const project = requireProject(db, projectId);
  assertCustomerOwner(customer, project);
  if (!OPEN_FOR_EDITS.includes(project.status) || findBrief(db, projectId, 'pending') || findBrief(db, projectId, 'accepted')) {
    throw conflict('Team members can only be removed before the agreement is accepted.', 'TEAM_LOCKED');
  }
  return transaction(db, () => {
    run(db, 'DELETE FROM project_members WHERE project_id = ? AND user_id = ?', projectId, creatorId);
    const draft = findBrief(db, projectId, 'draft');
    if (draft) {
      const content = parseContent(draft.content);
      content.members = content.members.filter((m) => m.userId !== creatorId);
      writeDraftContent(db, draft.id, content);
    }
    const name = getUserRow(db, creatorId)?.name ?? 'A creator';
    logEvent(db, projectId, customer.id, `${name} removed from the team`);
    return buildDetail(db, requireProject(db, projectId), customer.id);
  });
}

export function updateDraft(db: Db, customer: UserRow, projectId: string, input: BriefDraftInput): ProjectDetail {
  const project = requireProject(db, projectId);
  assertCustomerOwner(customer, project);
  if (findBrief(db, projectId, 'pending')) {
    throw conflict('An agreement is waiting for approval. Withdraw it before editing the brief.', 'AGREEMENT_PENDING');
  }
  const accepted = findBrief(db, projectId, 'accepted');
  const editable = OPEN_FOR_EDITS.includes(project.status) || (Boolean(accepted) && POST_AGREEMENT.includes(project.status) && project.status !== 'completed');
  if (!editable) throw conflict('This brief is locked for this stage of the project.', 'BRIEF_LOCKED');
  if (!isLaNeighborhood(input.neighborhood)) {
    throw new HttpError(400, `Photo Shoot only serves ${SERVICE_AREA_NAME} neighbourhoods.`, 'OUTSIDE_SERVICE_AREA', { neighborhood: 'Choose a Los Angeles neighbourhood.' });
  }
  return transaction(db, () => {
    const draft = ensureDraft(db, project, customer.id);
    const current = parseContent(draft.content);
    const teamIds = new Set(current.members.map((m) => m.userId));
    const submitted = new Set(input.members.map((m) => m.userId));
    if (teamIds.size !== submitted.size || [...teamIds].some((id) => !submitted.has(id))) {
      throw new HttpError(400, 'The team on the brief does not match the invited team. Refresh and try again.', 'TEAM_MISMATCH');
    }
    const members: BriefMember[] = input.members.map((m) => {
      const existing = current.members.find((x) => x.userId === m.userId) as BriefMember;
      const service = snapshotService(db, m.packageId);
      if (project.services !== 'both' && service !== project.services) {
        throw new HttpError(400, 'Choose packages for the service this project needs.', 'SERVICE_MISMATCH');
      }
      return snapshotMember(db, existing.userId, m.packageId, m.responsibilities);
    });
    const content: BriefContent = {
      title: input.title,
      goals: input.goals,
      creativeDirection: input.creativeDirection,
      shootDate: input.shootDate,
      shootStartTime: input.shootStartTime,
      durationHours: input.durationHours,
      neighborhood: input.neighborhood,
      locationDetail: input.locationDetail,
      photoCount: input.photoCount,
      video: { count: input.video.count, lengthSeconds: input.video.lengthSeconds },
      otherDeliverables: input.otherDeliverables,
      editingRequirements: input.editingRequirements,
      includedRevisions: input.includedRevisions,
      deliveryDeadline: input.deliveryDeadline,
      usageRights: input.usageRights,
      members,
    };
    writeDraftContent(db, draft.id, content);
    run(db, 'UPDATE projects SET title = ?, neighborhood = ?, updated_at = ? WHERE id = ? AND status IN (\'draft\', \'recruiting\')', input.title, input.neighborhood, nowIso(), projectId);
    logEvent(db, projectId, customer.id, accepted ? 'Change proposal drafted' : 'Brief updated');
    return buildDetail(db, requireProject(db, projectId), customer.id);
  });
}

export function sendAgreement(db: Db, customer: UserRow, projectId: string): ProjectDetail {
  const project = requireProject(db, projectId);
  assertCustomerOwner(customer, project);
  return transaction(db, () => {
    const accepted = findBrief(db, projectId, 'accepted');
    if (findBrief(db, projectId, 'pending')) throw conflict('An agreement is already waiting for approval.', 'AGREEMENT_PENDING');
    const draft = findBrief(db, projectId, 'draft');
    if (!draft) throw conflict('There is no brief to send. Edit the brief first.', 'NO_DRAFT');
    const content = parseContent(draft.content);
    if (content.members.length === 0) throw conflict('Invite at least one creator before sending the agreement.', 'NO_TEAM');
    const members = memberRows(db, projectId);
    const notAccepted = content.members.filter((m) => members.find((x) => x.user_id === m.userId)?.status !== 'accepted');
    if (notAccepted.length > 0) {
      throw conflict(`${notAccepted[0].creatorName} has not accepted the invitation yet.`, 'MEMBER_NOT_ACCEPTED');
    }
    const acceptedContent = accepted ? parseContent(accepted.content) : null;
    if (accepted && summarizeChanges(acceptedContent, content).length === 0) {
      throw conflict('There are no changes to send for approval.', 'NO_CHANGES');
    }
    if (!accepted && !OPEN_FOR_EDITS.includes(project.status)) throw conflict('The agreement cannot be sent at this stage.', 'BAD_STATUS');
    const required = requiredApproverIds(acceptedContent, content, customer.id, content.members.map((m) => m.userId));
    run(db, "UPDATE brief_versions SET status = 'pending', required_approvers = ? WHERE id = ?", JSON.stringify(required), draft.id);
    if (!accepted) setStatus(db, projectId, 'agreement_pending');
    logEvent(db, projectId, customer.id, accepted ? `Change proposal sent. ${required.length} approval${required.length === 1 ? '' : 's'} needed.` : `Agreement sent for approval. ${required.length} approval${required.length === 1 ? '' : 's'} needed.`);
    return buildDetail(db, requireProject(db, projectId), customer.id);
  });
}

export function withdrawAgreement(db: Db, customer: UserRow, projectId: string, versionId: string): ProjectDetail {
  const project = requireProject(db, projectId);
  assertCustomerOwner(customer, project);
  return transaction(db, () => {
    const pending = get<BriefRow>(db, "SELECT * FROM brief_versions WHERE id = ? AND project_id = ? AND status = 'pending'", versionId, projectId);
    if (!pending) throw conflict('That agreement is no longer waiting for approval.', 'NOT_PENDING');
    run(db, 'DELETE FROM brief_approvals WHERE version_id = ?', versionId);
    run(db, "UPDATE brief_versions SET status = 'draft', required_approvers = '[]' WHERE id = ?", versionId);
    if (!findBrief(db, projectId, 'accepted')) {
      const hasMembers = memberRows(db, projectId).some((m) => m.status !== 'declined');
      setStatus(db, projectId, hasMembers ? 'recruiting' : 'draft');
    }
    logEvent(db, projectId, customer.id, 'Agreement withdrawn for editing');
    return buildDetail(db, requireProject(db, projectId), customer.id);
  });
}

export function approveVersion(db: Db, user: UserRow, projectId: string, versionId: string): ProjectDetail {
  const project = requireProject(db, projectId);
  return transaction(db, () => {
    const version = get<BriefRow>(db, 'SELECT * FROM brief_versions WHERE id = ? AND project_id = ?', versionId, projectId);
    if (!version || version.status !== 'pending') throw conflict('This version is no longer open for approval.', 'NOT_PENDING');
    const required = parseJsonArray<string>(version.required_approvers);
    if (!required.includes(user.id)) throw forbidden('You do not need to approve this version.');
    run(db, 'INSERT OR IGNORE INTO brief_approvals (version_id, user_id, approved_at) VALUES (?, ?, ?)', versionId, user.id, nowIso());
    logEvent(db, projectId, user.id, `${user.name} approved the brief`);
    const approved = approvalIds(db, versionId);
    if (required.every((id) => approved.has(id))) {
      acceptVersion(db, project, version);
    }
    return buildDetail(db, requireProject(db, projectId), user.id);
  });
}

function acceptVersion(db: Db, project: ProjectRow, version: BriefRow): void {
  const previous = findBrief(db, project.id, 'accepted');
  if (previous) run(db, "UPDATE brief_versions SET status = 'superseded' WHERE id = ?", previous.id);
  const now = nowIso();
  run(db, "UPDATE brief_versions SET status = 'accepted', accepted_at = ? WHERE id = ?", now, version.id);
  const content = parseContent(version.content);
  run(
    db,
    'UPDATE projects SET shoot_date = ?, delivery_deadline = ?, title = ?, neighborhood = ?, updated_at = ? WHERE id = ?',
    content.shootDate,
    content.deliveryDeadline,
    content.title,
    content.neighborhood,
    now,
    project.id,
  );
  if (['draft', 'recruiting', 'agreement_pending'].includes(project.status)) {
    setStatus(db, project.id, 'agreed');
    logEvent(db, project.id, null, 'Everyone approved the brief. The deposit is due to confirm the booking.');
  } else {
    logEvent(db, project.id, null, 'Change approved by everyone on the agreement.');
  }
}

export function setMemberResponse(db: Db, user: UserRow, projectId: string, action: 'accept' | 'decline', acceptance?: AcceptedVersions): ProjectDetail {
  const project = requireProject(db, projectId);
  const member = get<{ id: string; status: MemberStatus }>(db, 'SELECT id, status FROM project_members WHERE project_id = ? AND user_id = ?', projectId, user.id);
  if (!member || member.status !== 'invited') throw conflict('You do not have a pending invitation for this project.', 'NO_INVITE');
  return transaction(db, () => {
    const now = nowIso();
    if (action === 'accept') {
      run(db, "UPDATE project_members SET status = 'accepted', updated_at = ? WHERE id = ?", now, member.id);
      // The creator accepts the current policy and terms with the invitation. The acceptance is kept with the booking.
      if (acceptance) recordPolicyAcceptance(db, user.id, projectId, 'invite_accept', acceptance, now);
      logEvent(db, projectId, user.id, `${user.name} accepted the invitation`);
    } else {
      run(db, "UPDATE project_members SET status = 'declined', updated_at = ? WHERE id = ?", now, member.id);
      const draft = findBrief(db, projectId, 'draft');
      if (draft) {
        const content = parseContent(draft.content);
        content.members = content.members.filter((m) => m.userId !== user.id);
        writeDraftContent(db, draft.id, content);
      }
      logEvent(db, projectId, user.id, `${user.name} declined the invitation`);
    }
    return buildDetail(db, requireProject(db, project.id), user.id);
  });
}

export function expressInterest(db: Db, creator: UserRow, projectId: string, message: string): ProjectDetail {
  const project = requireProject(db, projectId);
  if (creator.role !== 'creator') throw forbidden('Only creator accounts can express interest.');
  if (project.visibility !== 'open' || project.status !== 'recruiting') throw conflict('This project is not accepting interest right now.', 'NOT_OPEN');
  const profile = getCreatorRow(db, creator.id);
  if (!profile) throw conflict('Complete your creator profile before expressing interest.', 'PROFILE_INCOMPLETE');
  if (profile.seeking_clients !== 1) throw conflict('Turn on "Seeking clients" in your profile to express interest.', 'NOT_SEEKING');
  if (project.services !== 'both' && profile.services !== 'both' && profile.services !== project.services) {
    throw conflict(`This project needs ${project.services}. Your services do not match.`, 'SERVICE_MISMATCH');
  }
  if (!coverageIncludes({ citywide: profile.citywide === 1, neighborhoods: parseJsonArray<string>(profile.neighborhoods) }, project.neighborhood)) {
    throw conflict(`You do not cover ${project.neighborhood}. Add it to your service area to apply.`, 'OUTSIDE_COVERAGE');
  }
  if (get(db, 'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?', projectId, creator.id)) {
    throw conflict('You have already responded to this project.', 'ALREADY_RESPONDED');
  }
  return transaction(db, () => {
    const now = nowIso();
    run(db, "INSERT INTO project_members (id, project_id, user_id, status, message, created_at, updated_at) VALUES (?, ?, ?, 'interested', ?, ?, ?)", newId(), projectId, creator.id, message, now, now);
    logEvent(db, projectId, creator.id, `${creator.name} expressed interest`);
    return buildDetail(db, requireProject(db, projectId), creator.id);
  });
}

export function postMessage(db: Db, user: UserRow, projectId: string, body: string): ProjectDetail {
  const project = requireProject(db, projectId);
  const member = assertParticipant(db, user, project);
  if (member && !['accepted', 'invited'].includes(member.status)) throw forbidden('Only team members can message on this project.');
  run(db, 'INSERT INTO messages (id, project_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)', newId(), projectId, user.id, body, nowIso());
  return buildDetail(db, requireProject(db, projectId), user.id);
}

export function addDelivery(
  db: Db,
  user: UserRow,
  projectId: string,
  input: { fileName: string; fileUrl: string; kind: 'photo' | 'video' | 'other'; sizeBytes: number; note: string },
): ProjectDetail {
  const project = requireProject(db, projectId);
  const member = assertParticipant(db, user, project);
  if (!member || member.status !== 'accepted') throw forbidden('Only accepted team members can upload deliveries.');
  if (!['booked', 'delivered', 'revision_requested'].includes(project.status)) {
    throw conflict('Deliveries open once the booking is confirmed.', 'BAD_STATUS');
  }
  return transaction(db, () => {
    const round = (get<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM revision_requests WHERE project_id = ?', projectId)?.count ?? 0) + 1;
    run(
      db,
      'INSERT INTO deliveries (id, project_id, uploaded_by, round, file_name, file_url, kind, size_bytes, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      newId(),
      projectId,
      user.id,
      round,
      input.fileName,
      input.fileUrl,
      input.kind,
      input.sizeBytes,
      input.note,
      nowIso(),
    );
    if (project.status === 'revision_requested') {
      run(db, "UPDATE revision_requests SET status = 'completed', completed_at = ? WHERE project_id = ? AND status = 'open'", nowIso(), projectId);
    }
    if (project.status !== 'delivered') setStatus(db, projectId, 'delivered');
    logEvent(db, projectId, user.id, `${user.name} uploaded ${input.fileName}`);
    return buildDetail(db, requireProject(db, projectId), user.id);
  });
}

export function requestRevision(db: Db, customer: UserRow, projectId: string, notes: string): ProjectDetail {
  const project = requireProject(db, projectId);
  assertCustomerOwner(customer, project);
  if (project.status !== 'delivered') throw conflict('Revisions can be requested after files are delivered.', 'BAD_STATUS');
  const accepted = findBrief(db, projectId, 'accepted');
  const included = accepted ? parseContent(accepted.content).includedRevisions : 0;
  const used = get<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM revision_requests WHERE project_id = ?', projectId)?.count ?? 0;
  if (used >= included) {
    throw conflict('All included revisions are used. Propose a change to the brief to request more work.', 'REVISIONS_EXHAUSTED');
  }
  return transaction(db, () => {
    run(db, "INSERT INTO revision_requests (id, project_id, requested_by, notes, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)", newId(), projectId, customer.id, notes, nowIso());
    setStatus(db, projectId, 'revision_requested');
    logEvent(db, projectId, customer.id, `Revision requested (${used + 1} of ${included} included)`);
    return buildDetail(db, requireProject(db, projectId), customer.id);
  });
}

export function confirmCompletion(db: Db, customer: UserRow, projectId: string): ProjectDetail {
  const project = requireProject(db, projectId);
  assertCustomerOwner(customer, project);
  if (project.status !== 'delivered') throw conflict('Completion can be confirmed once files are delivered.', 'BAD_STATUS');
  return transaction(db, () => {
    setStatus(db, projectId, 'completed');
    logEvent(db, projectId, customer.id, 'Completion confirmed. The balance is due.');
    return buildDetail(db, requireProject(db, projectId), customer.id);
  });
}

export function openDispute(db: Db, user: UserRow, projectId: string, reason: string): ProjectDetail {
  const project = requireProject(db, projectId);
  const member = assertParticipant(db, user, project);
  if (member && member.status !== 'accepted') throw forbidden('Only accepted team members can open a dispute.');
  if (!DISPUTABLE.includes(project.status)) throw conflict('Disputes can be opened after the booking is confirmed.', 'BAD_STATUS');
  return transaction(db, () => {
    run(db, "UPDATE projects SET status = 'disputed', dispute_reason = ?, updated_at = ? WHERE id = ?", reason, nowIso(), projectId);
    run(db, "UPDATE payouts SET status = 'held' WHERE project_id = ? AND status = 'scheduled'", projectId);
    logEvent(db, projectId, user.id, `${user.name} opened a dispute. Payouts are held.`);
    return buildDetail(db, requireProject(db, projectId), user.id);
  });
}

export function createReview(db: Db, user: UserRow, projectId: string, input: ReviewInput): ProjectDetail {
  const project = requireProject(db, projectId);
  const member = assertParticipant(db, user, project);
  if (!['completed', 'closed'].includes(project.status)) {
    throw conflict('Reviews open once the project is completed.', 'REVIEW_NOT_ELIGIBLE');
  }
  const isCustomer = project.customer_id === user.id;
  if (!isCustomer && (!member || member.status !== 'accepted')) throw forbidden('Only accepted team members can review this project.');
  const revieweeId = input.revieweeId;
  if (isCustomer) {
    const target = memberRows(db, projectId).find((m) => m.user_id === revieweeId && m.status === 'accepted');
    if (!target) throw conflict('You can only review creators who worked on this project.', 'REVIEW_NOT_ELIGIBLE');
  } else if (revieweeId !== project.customer_id) {
    throw conflict('Creators review the customer on this project.', 'REVIEW_NOT_ELIGIBLE');
  }
  if (get(db, 'SELECT 1 FROM reviews WHERE project_id = ? AND reviewer_id = ? AND reviewee_id = ?', projectId, user.id, revieweeId)) {
    throw conflict('You have already reviewed this person for this project.', 'ALREADY_REVIEWED');
  }
  return transaction(db, () => {
    run(
      db,
      `INSERT INTO reviews (id, project_id, reviewer_id, reviewee_id, reviewer_role, communication, reliability, professionalism, quality, expectations_met, body, is_demo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      newId(),
      projectId,
      user.id,
      revieweeId,
      isCustomer ? 'customer' : 'creator',
      input.communication,
      input.reliability,
      input.professionalism,
      input.quality,
      bool(input.expectationsMet),
      input.body,
      nowIso(),
    );
    logEvent(db, projectId, user.id, `${user.name} left a review`);
    return buildDetail(db, requireProject(db, projectId), user.id);
  });
}

export function listProjectsFor(db: Db, user: UserRow): ProjectSummary[] {
  const rows = user.role === 'customer'
    ? all<ProjectRow>(db, 'SELECT * FROM projects WHERE customer_id = ? ORDER BY updated_at DESC', user.id)
    : all<ProjectRow>(
        db,
        `SELECT p.* FROM projects p JOIN project_members m ON m.project_id = p.id
          WHERE m.user_id = ? AND m.status IN ('invited','accepted') ORDER BY p.updated_at DESC`,
        user.id,
      );
  return rows.map((row) => buildSummary(db, row, user.id));
}

export function listOpenCalls(db: Db, viewerId: string | null, filters: { services?: ServiceNeed | 'any'; neighborhood?: string | null; budgetCents?: number | null }): Array<ProjectSummary & { description: string; interest: MemberStatus | null; styleTags: string[] }> {
  const rows = all<ProjectRow>(db, "SELECT * FROM projects WHERE visibility = 'open' AND status = 'recruiting' ORDER BY updated_at DESC");
  return rows
    .filter((row) => !filters.services || filters.services === 'any' || row.services === filters.services || row.services === 'both')
    .filter((row) => !filters.neighborhood || row.neighborhood === filters.neighborhood)
    .filter((row) => filters.budgetCents == null || row.budget_cents <= filters.budgetCents)
    .map((row) => {
      const mine = viewerId ? get<{ status: MemberStatus }>(db, 'SELECT status FROM project_members WHERE project_id = ? AND user_id = ?', row.id, viewerId) : undefined;
      return {
        ...buildSummary(db, row, viewerId),
        description: row.description,
        styleTags: parseJsonArray<string>(row.style_tags),
        interest: mine?.status ?? null,
      };
    });
}

export function latestRevisionOverview(db: Db, projectId: string): { used: number; included: number } {
  const accepted = findBrief(db, projectId, 'accepted');
  const included = accepted ? parseContent(accepted.content).includedRevisions : 0;
  const used = get<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM revision_requests WHERE project_id = ?', projectId)?.count ?? 0;
  return { used, included };
}

export function acceptedBrief(db: Db, projectId: string): BriefContent | null {
  const accepted = findBrief(db, projectId, 'accepted');
  return accepted ? parseContent(accepted.content) : null;
}

export function acceptedQuoteTotals(db: Db, projectId: string): { totalCents: number; customerFeeCents: number; depositCents: number; balanceCents: number; members: Array<{ userId: string; priceCents: number }> } | null {
  const content = acceptedBrief(db, projectId);
  if (!content) return null;
  const members = content.members.map((m) => ({ userId: m.userId, priceCents: m.priceCents }));
  const quote = quoteTeam(members);
  return { totalCents: quote.totalCents, customerFeeCents: quote.customerFeeCents, depositCents: quote.depositCents, balanceCents: quote.balanceCents, members };
}

export function paymentTotals(db: Db, projectId: string) {
  return paymentSums(db, projectId);
}

export function daysUntilShoot(project: ProjectRow): number {
  const shoot = project.shoot_date;
  if (!shoot) return 0;
  return daysBetween(todayIso(), shoot);
}

