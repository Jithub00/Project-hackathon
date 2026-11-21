import { formatUsd } from './money';
import type { BriefContent } from './types';

/** Brief fields that affect the whole team (scope, dates, deliverables, usage). */
const PROJECT_LEVEL_KEYS = [
  'title',
  'goals',
  'creativeDirection',
  'shootDate',
  'shootStartTime',
  'durationHours',
  'neighborhood',
  'locationDetail',
  'photoCount',
  'video',
  'otherDeliverables',
  'editingRequirements',
  'includedRevisions',
  'deliveryDeadline',
  'usageRights',
] as const satisfies ReadonlyArray<keyof BriefContent>;

export const BRIEF_FIELD_LABELS: Record<(typeof PROJECT_LEVEL_KEYS)[number], string> = {
  title: 'Project title',
  goals: 'Goals',
  creativeDirection: 'Creative direction',
  shootDate: 'Shoot date',
  shootStartTime: 'Start time',
  durationHours: 'Shoot duration',
  neighborhood: 'Location',
  locationDetail: 'Location details',
  photoCount: 'Photo quantity',
  video: 'Video deliverables',
  otherDeliverables: 'Other deliverables',
  editingRequirements: 'Editing requirements',
  includedRevisions: 'Included revisions',
  deliveryDeadline: 'Delivery deadline',
  usageRights: 'Usage rights',
};

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Human-readable list of what changed between the accepted brief and a proposed one. */
export function summarizeChanges(prev: BriefContent | null, next: BriefContent): string[] {
  if (!prev) return ['Initial brief for approval'];
  const changes: string[] = [];
  for (const key of PROJECT_LEVEL_KEYS) {
    if (!same(prev[key], next[key])) changes.push(`${BRIEF_FIELD_LABELS[key]} changed`);
  }
  const prevById = new Map(prev.members.map((m) => [m.userId, m]));
  const nextIds = new Set(next.members.map((m) => m.userId));
  for (const member of next.members) {
    const before = prevById.get(member.userId);
    if (!before) {
      changes.push(`${member.creatorName} added to the team at ${formatUsd(member.priceCents)}`);
      continue;
    }
    if (before.priceCents !== member.priceCents || before.packageId !== member.packageId) {
      changes.push(
        `${member.roleLabel} price changed from ${formatUsd(before.priceCents)} to ${formatUsd(member.priceCents)}`,
      );
    }
    if (before.responsibilities !== member.responsibilities) {
      changes.push(`${member.creatorName}'s responsibilities changed`);
    }
  }
  for (const before of prev.members) {
    if (!nextIds.has(before.userId)) changes.push(`${before.creatorName} removed from the team`);
  }
  return changes;
}

/**
 * Who must approve a proposed brief before it takes effect.
 * - The customer always approves.
 * - Team-wide changes (scope, dates, deadlines, usage) affect every creator.
 * - Otherwise only creators whose own role, package, price or responsibilities changed,
 *   and creators who were removed, must approve.
 */
export function requiredApproverIds(
  prev: BriefContent | null,
  next: BriefContent,
  customerId: string,
  teamUserIds: string[],
): string[] {
  const required = new Set<string>([customerId]);
  if (!prev) {
    teamUserIds.forEach((id) => required.add(id));
    return [...required];
  }
  const teamWide = PROJECT_LEVEL_KEYS.some((key) => !same(prev[key], next[key]));
  if (teamWide) {
    teamUserIds.forEach((id) => required.add(id));
  }
  const prevById = new Map(prev.members.map((m) => [m.userId, m]));
  for (const member of next.members) {
    const before = prevById.get(member.userId);
    const memberChanged =
      !before ||
      before.priceCents !== member.priceCents ||
      before.packageId !== member.packageId ||
      before.responsibilities !== member.responsibilities ||
      before.roleLabel !== member.roleLabel;
    if (memberChanged) required.add(member.userId);
  }
  const nextIds = new Set(next.members.map((m) => m.userId));
  for (const before of prev.members) {
    if (!nextIds.has(before.userId)) required.add(before.userId);
  }
  return [...required];
}

export function teamTotalCents(members: Array<{ priceCents: number }>): number {
  return members.reduce((sum, m) => sum + m.priceCents, 0);
}
