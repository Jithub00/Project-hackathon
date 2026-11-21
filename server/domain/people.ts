import { all, bool, get, newId, nowIso, parseJsonArray, run, todayIso, addDaysIso, type Db } from '../db';
import { countWords } from '../../shared/biography';
import { CITYWIDE_LABEL } from '../../shared/service-area';
import { availableOn, type MatchableCreator } from '../../shared/matching';
import type {
  CreatorPackage,
  CreatorProfile,
  CustomerProfile,
  PortfolioItem,
  ReviewItem,
  ReviewSummary,
  ServiceNeed,
  UserSummary,
} from '../../shared/types';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: 'customer' | 'creator';
  name: string;
  bio: string;
  is_demo: number;
  created_at: string;
  updated_at: string;
}

interface CreatorRow {
  user_id: string;
  services: ServiceNeed;
  specialties: string;
  styles: string;
  neighborhoods: string;
  citywide: number;
  seeking_clients: number;
  years_experience: number;
  weekdays: string;
  typical_hours: string;
}

interface CustomerRow {
  user_id: string;
  customer_type: 'individual' | 'business';
  business_name: string;
  interests: string;
  neighborhood: string;
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return `${first}${last}`.toUpperCase();
}

export function toUserSummary(row: UserRow): UserSummary {
  return {
    id: row.id,
    name: row.name,
    initials: initialsFor(row.name),
    role: row.role,
    bio: row.bio,
    bioWords: countWords(row.bio),
    isDemo: row.is_demo === 1,
    createdAt: row.created_at,
  };
}

export function getUserRow(db: Db, id: string): UserRow | undefined {
  return get<UserRow>(db, 'SELECT * FROM users WHERE id = ?', id);
}

export function getCreatorRow(db: Db, id: string): CreatorRow | undefined {
  return get<CreatorRow>(db, 'SELECT * FROM creator_profiles WHERE user_id = ?', id);
}

export function getCustomerRow(db: Db, id: string): CustomerRow | undefined {
  return get<CustomerRow>(db, 'SELECT * FROM customer_profiles WHERE user_id = ?', id);
}

export function coverageLabel(citywide: boolean, neighborhoods: string[]): string {
  if (citywide) return CITYWIDE_LABEL;
  if (neighborhoods.length <= 3) return neighborhoods.join(', ');
  return `${neighborhoods.slice(0, 2).join(', ')} +${neighborhoods.length - 2} more`;
}

export function listPackages(db: Db, creatorId: string): CreatorPackage[] {
  return all<{
    id: string;
    service: 'photography' | 'videography';
    name: string;
    hours: number;
    price_cents: number;
    deliverables: string;
  }>(
    db,
    'SELECT id, service, name, hours, price_cents, deliverables FROM creator_packages WHERE creator_id = ? ORDER BY sort_order, price_cents',
    creatorId,
  ).map((p) => ({
    id: p.id,
    service: p.service,
    name: p.name,
    hours: p.hours,
    priceCents: p.price_cents,
    deliverables: p.deliverables,
  }));
}

export function listPortfolio(db: Db, creatorId: string): PortfolioItem[] {
  return all<{
    id: string;
    creator_id: string;
    kind: 'photo' | 'video';
    title: string;
    contribution: string;
    media_url: string;
    poster_url: string | null;
    project_label: string;
    is_demo: number;
    created_at: string;
  }>(
    db,
    'SELECT * FROM portfolio_items WHERE creator_id = ? ORDER BY sort_order, created_at',
    creatorId,
  ).map((p) => ({
    id: p.id,
    creatorId: p.creator_id,
    kind: p.kind,
    title: p.title,
    contribution: p.contribution,
    mediaUrl: p.media_url,
    posterUrl: p.poster_url,
    projectLabel: p.project_label,
    isDemo: p.is_demo === 1,
    createdAt: p.created_at,
  }));
}

export function ratingFor(db: Db, userId: string): ReviewSummary {
  const row = get<{ count: number; avg: number | null }>(
    db,
    'SELECT COUNT(*) AS count, AVG((communication + reliability + professionalism + quality) / 4.0) AS avg FROM reviews WHERE reviewee_id = ?',
    userId,
  );
  const count = row?.count ?? 0;
  return {
    count,
    average: count > 0 && row?.avg != null ? Math.round(row.avg * 10) / 10 : null,
  };
}

export function completedProjectCount(db: Db, userId: string): number {
  const row = get<{ count: number }>(
    db,
    `SELECT COUNT(DISTINCT p.id) AS count FROM projects p
       LEFT JOIN project_members m ON m.project_id = p.id AND m.status = 'accepted'
      WHERE p.status IN ('completed','closed') AND (p.customer_id = ? OR m.user_id = ?)`,
    userId,
    userId,
  );
  return row?.count ?? 0;
}

export function bookedDatesFor(db: Db, creatorId: string): string[] {
  return all<{ shoot_date: string }>(
    db,
    `SELECT DISTINCT p.shoot_date FROM projects p
       JOIN project_members m ON m.project_id = p.id AND m.status = 'accepted'
      WHERE m.user_id = ? AND p.shoot_date IS NOT NULL
        AND p.status IN ('booked','delivered','revision_requested','completed')
        AND p.shoot_date >= ?
      ORDER BY p.shoot_date`,
    creatorId,
    todayIso(),
  ).map((r) => r.shoot_date);
}

export function explicitAvailableDates(db: Db, creatorId: string): string[] {
  return all<{ date: string }>(
    db,
    'SELECT date FROM availability_dates WHERE creator_id = ? AND date >= ? ORDER BY date',
    creatorId,
    todayIso(),
  ).map((r) => r.date);
}

export function nextAvailableDate(creator: Pick<MatchableCreator, 'availableDates' | 'weekdays' | 'bookedDates'>): string | null {
  const start = todayIso();
  for (let i = 1; i <= 60; i += 1) {
    const date = addDaysIso(start, i);
    if (availableOn(creator, date) === true) return date;
  }
  return null;
}

/** Loads everything the matcher needs for every creator in one pass. */
export function loadMatchableCreators(db: Db): MatchableCreator[] {
  const rows = all<CreatorRow & { name: string }>(
    db,
    `SELECT cp.*, u.name FROM creator_profiles cp JOIN users u ON u.id = cp.user_id ORDER BY u.name`,
  );
  return rows.map((row) => {
    const packages = listPackages(db, row.user_id);
    const rating = ratingFor(db, row.user_id);
    return {
      id: row.user_id,
      name: row.name,
      services: row.services,
      styles: parseJsonArray<string>(row.styles),
      neighborhoods: parseJsonArray<string>(row.neighborhoods),
      citywide: row.citywide === 1,
      seekingClients: row.seeking_clients === 1,
      weekdays: parseJsonArray<number>(row.weekdays),
      availableDates: explicitAvailableDates(db, row.user_id),
      bookedDates: bookedDatesFor(db, row.user_id),
      packages,
      ratingAverage: rating.average,
      ratingCount: rating.count,
    };
  });
}

export function reviewsWhere(db: Db, where: string, params: unknown[], limit = 200): ReviewItem[] {
  return all<{
    id: string;
    project_id: string;
    project_title: string;
    reviewer_id: string;
    reviewer_name: string;
    reviewer_role: 'customer' | 'creator';
    reviewee_id: string;
    communication: number;
    reliability: number;
    professionalism: number;
    quality: number;
    expectations_met: number;
    body: string;
    is_demo: number;
    created_at: string;
  }>(
    db,
    `SELECT r.id, r.project_id, p.title AS project_title, r.reviewer_id, u.name AS reviewer_name,
            r.reviewer_role, r.reviewee_id, r.communication, r.reliability, r.professionalism,
            r.quality, r.expectations_met, r.body, r.is_demo, r.created_at
       FROM reviews r
       JOIN projects p ON p.id = r.project_id
       JOIN users u ON u.id = r.reviewer_id
      WHERE ${where}
      ORDER BY r.created_at DESC
      LIMIT ?`,
    ...(params as never[]),
    limit,
  ).map((r) => ({
    id: r.id,
    projectId: r.project_id,
    projectTitle: r.project_title,
    reviewerId: r.reviewer_id,
    reviewerName: r.reviewer_name,
    reviewerRole: r.reviewer_role,
    revieweeId: r.reviewee_id,
    communication: r.communication,
    reliability: r.reliability,
    professionalism: r.professionalism,
    quality: r.quality,
    expectationsMet: r.expectations_met === 1,
    average: Math.round(((r.communication + r.reliability + r.professionalism + r.quality) / 4) * 10) / 10,
    body: r.body,
    isDemo: r.is_demo === 1,
    createdAt: r.created_at,
  }));
}

export function reviewsFor(db: Db, userId: string, limit = 20): ReviewItem[] {
  return reviewsWhere(db, 'r.reviewee_id = ?', [userId], limit);
}

export function buildCreatorProfile(db: Db, creatorId: string): CreatorProfile | null {
  const user = getUserRow(db, creatorId);
  const row = getCreatorRow(db, creatorId);
  if (!user || !row || user.role !== 'creator') return null;
  const packages = listPackages(db, creatorId);
  const priceFrom = packages.length > 0 ? Math.min(...packages.map((p) => p.priceCents)) : null;
  const available = explicitAvailableDates(db, creatorId);
  const booked = bookedDatesFor(db, creatorId);
  const weekdays = parseJsonArray<number>(row.weekdays);
  const neighborhoods = parseJsonArray<string>(row.neighborhoods);
  const citywide = row.citywide === 1;
  const next = nextAvailableDate({ availableDates: available, weekdays, bookedDates: booked });
  return {
    user: toUserSummary(user),
    services: row.services,
    specialties: parseJsonArray<string>(row.specialties),
    styles: parseJsonArray<string>(row.styles),
    neighborhoods,
    citywide,
    coverageLabel: coverageLabel(citywide, neighborhoods),
    seekingClients: row.seeking_clients === 1,
    yearsExperience: row.years_experience,
    weekdays,
    typicalHours: row.typical_hours,
    packages,
    portfolio: listPortfolio(db, creatorId),
    rating: ratingFor(db, creatorId),
    completedProjects: completedProjectCount(db, creatorId),
    availableDates: available,
    bookedDates: booked,
    nextAvailableDate: next,
    priceFromCents: priceFrom,
    reviews: reviewsFor(db, creatorId),
  };
}

export function buildCustomerProfile(db: Db, customerId: string): CustomerProfile | null {
  const user = getUserRow(db, customerId);
  const row = getCustomerRow(db, customerId);
  if (!user || !row || user.role !== 'customer') return null;
  return {
    user: toUserSummary(user),
    customerType: row.customer_type,
    businessName: row.business_name,
    interests: parseJsonArray<string>(row.interests),
    neighborhood: row.neighborhood,
    completedProjects: completedProjectCount(db, customerId),
    reviews: reviewsFor(db, customerId),
  };
}

export function insertUser(
  db: Db,
  input: { email: string; passwordHash: string; role: 'customer' | 'creator'; name: string; bio: string; isDemo?: boolean; id?: string },
): string {
  const id = input.id ?? newId();
  const now = nowIso();
  run(
    db,
    'INSERT INTO users (id, email, password_hash, role, name, bio, is_demo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    input.email,
    input.passwordHash,
    input.role,
    input.name,
    input.bio,
    bool(Boolean(input.isDemo)),
    now,
    now,
  );
  return id;
}

export function touchUser(db: Db, userId: string, patch: { name?: string; bio?: string }): void {
  const current = getUserRow(db, userId);
  if (!current) return;
  run(
    db,
    'UPDATE users SET name = ?, bio = ?, updated_at = ? WHERE id = ?',
    patch.name ?? current.name,
    patch.bio ?? current.bio,
    nowIso(),
    userId,
  );
}
