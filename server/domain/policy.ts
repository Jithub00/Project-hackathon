import { get, nowIso, run, type Db } from '../db';
import { HttpError, conflict } from '../http';
import { newId } from '../db';
import { REFUND_POLICY_VERSION, TERMS_VERSION } from '../../shared/policy';
import { formatBookingTime, scheduledStartMs, toIsoInstant } from '../../shared/cancellation';
import { quoteTeam } from '../../shared/pricing';
import type { BriefContent } from '../../shared/types';
import { buildCreatorProfile } from './people';
import { acceptedBriefContent, acceptedBriefRow } from './refund-core';

/**
 * Policy acceptance and the booking-time record. Every acceptance is stored with the exact version and where it
 * happened. A booking keeps a snapshot of what the customer was buying, so later profile changes cannot alter it.
 */

export type PolicyContext = 'checkout' | 'invite_accept' | 'signup_customer' | 'signup_creator';

export interface AcceptedVersions {
  refundPolicyVersion: string;
  termsVersion: string;
}

export function currentVersions(): AcceptedVersions {
  return { refundPolicyVersion: REFUND_POLICY_VERSION, termsVersion: TERMS_VERSION };
}

/** Checks the versions a client says it accepted. Anything other than the current versions is refused. */
export function requireCurrentPolicy(input: { acceptedRefundPolicyVersion?: string; acceptedTermsVersion?: string }): AcceptedVersions {
  if (!input.acceptedRefundPolicyVersion || !input.acceptedTermsVersion) {
    throw new HttpError(
      400,
      'Read and accept the Refund and Cancellation Policy and the Terms and Conditions to continue.',
      'POLICY_REQUIRED',
      { policy: 'Accept the Refund and Cancellation Policy and the Terms and Conditions.' },
    );
  }
  if (input.acceptedRefundPolicyVersion !== REFUND_POLICY_VERSION || input.acceptedTermsVersion !== TERMS_VERSION) {
    throw conflict(
      'The policy has changed since you opened this page. Review the current version and accept it again.',
      'POLICY_CHANGED',
    );
  }
  return currentVersions();
}

export function recordPolicyAcceptance(
  db: Db,
  userId: string,
  projectId: string | null,
  context: PolicyContext,
  versions: AcceptedVersions,
  now: string = nowIso(),
): void {
  const insert = 'INSERT INTO policy_acceptances (id, user_id, project_id, document, version, context, accepted_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
  run(db, insert, newId(), userId, projectId, 'refund_policy', versions.refundPolicyVersion, context, now);
  run(db, insert, newId(), userId, projectId, 'terms', versions.termsVersion, context, now);
}

interface AcceptanceRow {
  user_id: string;
  version: string;
  accepted_at: string;
}

/** The most recent checkout acceptance for a booking: who accepted, which versions, and when. */
export function latestCheckoutAcceptance(db: Db, projectId: string): { userId: string; refund: AcceptanceRow; terms: AcceptanceRow } | null {
  const refund = get<AcceptanceRow>(
    db,
    "SELECT user_id, version, accepted_at FROM policy_acceptances WHERE project_id = ? AND context = 'checkout' AND document = 'refund_policy' ORDER BY accepted_at DESC LIMIT 1",
    projectId,
  );
  const terms = get<AcceptanceRow>(
    db,
    "SELECT user_id, version, accepted_at FROM policy_acceptances WHERE project_id = ? AND context = 'checkout' AND document = 'terms' ORDER BY accepted_at DESC LIMIT 1",
    projectId,
  );
  if (!refund || !terms) return null;
  return { userId: refund.user_id, refund, terms };
}

interface BookingSnapshotMember {
  userId: string;
  name: string;
  packageId: string;
  packageName: string;
  service: string;
  priceCents: number;
  services: string[];
  coverage: string;
  specialties: string[];
  styles: string[];
  bioExcerpt: string;
  portfolio: Array<{ id: string; kind: 'photo' | 'video'; title: string; contribution: string; mediaUrl: string; projectLabel: string; createdAt: string }>;
}

interface BookingSnapshot {
  capturedAt: string;
  brief: BriefContent;
  quote: { subtotalCents: number; customerFeeCents: number; totalCents: number; depositCents: number; balanceCents: number };
  members: BookingSnapshotMember[];
}

const SERVICE_LABEL: Record<string, string> = {
  photography: 'Photography',
  videography: 'Videography',
  both: 'Photography and videography',
};

/**
 * Records what the customer was buying at the moment the deposit is confirmed. Needs a checkout acceptance; bookings
 * made without one (before this policy existed) get no record, and the project says so.
 */
export function createBookingRecord(db: Db, projectId: string, bookedAt: string = nowIso()): void {
  const acceptance = latestCheckoutAcceptance(db, projectId);
  const brief = acceptedBriefContent(db, projectId);
  if (!acceptance || !brief) return;
  const quote = quoteTeam(brief.members.map((m) => ({ userId: m.userId, priceCents: m.priceCents })));
  const members: BookingSnapshotMember[] = [];
  for (const member of brief.members) {
    const profile = buildCreatorProfile(db, member.userId);
    members.push({
      userId: member.userId,
      name: member.creatorName,
      packageId: member.packageId,
      packageName: member.packageName,
      service: member.service,
      priceCents: member.priceCents,
      services: profile ? [SERVICE_LABEL[profile.services] ?? profile.services] : [],
      coverage: profile?.coverageLabel ?? '',
      specialties: profile?.specialties ?? [],
      styles: profile?.styles ?? [],
      bioExcerpt: profile ? profile.user.bio.slice(0, 400) : '',
      portfolio: (profile?.portfolio ?? []).map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        contribution: item.contribution,
        mediaUrl: item.mediaUrl,
        projectLabel: item.projectLabel,
        createdAt: item.createdAt,
      })),
    });
  }
  const snapshot: BookingSnapshot = {
    capturedAt: bookedAt,
    brief,
    quote: {
      subtotalCents: quote.subtotalCents,
      customerFeeCents: quote.customerFeeCents,
      totalCents: quote.totalCents,
      depositCents: quote.depositCents,
      balanceCents: quote.balanceCents,
    },
    members,
  };
  const startMs = scheduledStartMs(brief.shootDate, brief.shootStartTime);
  run(
    db,
    `INSERT OR IGNORE INTO booking_records (project_id, policy_version, terms_version, accepted_by, accepted_at, booked_at, scheduled_start, snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    acceptance.refund.version,
    acceptance.terms.version,
    acceptance.userId,
    acceptance.refund.accepted_at,
    bookedAt,
    startMs === null ? null : toIsoInstant(startMs),
    JSON.stringify(snapshot),
  );
}

/** Human-readable scheduled start, for messages. Null when the brief has no usable start. */
export function scheduledStartLabel(db: Db, projectId: string): string | null {
  const row = acceptedBriefRow(db, projectId);
  if (!row) return null;
  const brief = JSON.parse(row.content) as BriefContent;
  const startMs = scheduledStartMs(brief.shootDate, brief.shootStartTime);
  return startMs === null ? null : formatBookingTime(startMs);
}
