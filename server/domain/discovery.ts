import { all, parseJsonArray, type Db } from '../db';
import { evaluateCreator, type MatchableCreator, type MatchCriteria } from '../../shared/matching';
import type { CreatorCard, DiscoveryCriteria, DiscoveryResponse, ServiceNeed } from '../../shared/types';
import { initialsFor } from './people';
import {
  bookedDatesFor,
  completedProjectCount,
  coverageLabel,
  explicitAvailableDates,
  listPackages,
  nextAvailableDate,
  ratingFor,
} from './people';

interface JoinedCreator {
  user_id: string;
  name: string;
  bio: string;
  is_demo: number;
  services: ServiceNeed;
  specialties: string;
  styles: string;
  neighborhoods: string;
  citywide: number;
  seeking_clients: number;
  weekdays: string;
}

function excerpt(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max)}…`;
}

const EXCLUSION_KEY: Record<string, keyof DiscoveryResponse['excluded']> = {
  service: 'service',
  location: 'location',
  budget: 'budget',
  availability: 'availability',
  notSeeking: 'notSeeking',
  rating: 'rating',
  style: 'style',
};

export function emptyExclusions(): DiscoveryResponse['excluded'] {
  return { service: 0, location: 0, budget: 0, availability: 0, notSeeking: 0, rating: 0, style: 0 };
}

export function discover(db: Db, criteria: DiscoveryCriteria): DiscoveryResponse {
  const rows = all<JoinedCreator>(
    db,
    `SELECT cp.user_id, u.name, u.bio, u.is_demo, cp.services, cp.specialties, cp.styles, cp.neighborhoods,
            cp.citywide, cp.seeking_clients, cp.weekdays
       FROM creator_profiles cp JOIN users u ON u.id = cp.user_id ORDER BY u.name`,
  );
  const matchCriteria: MatchCriteria = {
    services: criteria.services,
    neighborhood: criteria.neighborhood,
    budgetCents: criteria.budgetCents,
    styles: criteria.styles,
    dates: criteria.date ? [criteria.date] : [],
    minRating: criteria.minRating,
  };
  const filtersActive =
    criteria.services !== 'any' ||
    criteria.neighborhood !== null ||
    criteria.budgetCents !== null ||
    criteria.styles.length > 0 ||
    criteria.date !== null ||
    criteria.minRating !== null;

  const excluded = emptyExclusions();
  const results: Array<{ card: CreatorCard; score: number; rating: number | null; price: number | null }> = [];

  for (const row of rows) {
    const packages = listPackages(db, row.user_id);
    const rating = ratingFor(db, row.user_id);
    const neighborhoods = parseJsonArray<string>(row.neighborhoods);
    const weekdays = parseJsonArray<number>(row.weekdays);
    const availableDates = explicitAvailableDates(db, row.user_id);
    const bookedDates = bookedDatesFor(db, row.user_id);
    const matchable: MatchableCreator = {
      id: row.user_id,
      name: row.name,
      services: row.services,
      styles: parseJsonArray<string>(row.styles),
      neighborhoods,
      citywide: row.citywide === 1,
      seekingClients: row.seeking_clients === 1,
      weekdays,
      availableDates,
      bookedDates,
      packages,
      ratingAverage: rating.average,
      ratingCount: rating.count,
    };
    const outcome = evaluateCreator(matchable, matchCriteria);
    if (!outcome.included) {
      if (outcome.excludedFor) excluded[EXCLUSION_KEY[outcome.excludedFor]] += 1;
      continue;
    }
    const priceFrom = packages.length > 0 ? Math.min(...packages.map((p) => p.priceCents)) : null;
    const portfolioPreview = all<{ id: string; media_url: string; title: string; is_demo: number }>(
      db,
      "SELECT id, media_url, title, is_demo FROM portfolio_items WHERE creator_id = ? AND kind = 'photo' ORDER BY sort_order, created_at LIMIT 3",
      row.user_id,
    ).map((p) => ({ id: p.id, mediaUrl: p.media_url, title: p.title, isDemo: p.is_demo === 1 }));
    const card: CreatorCard = {
      id: row.user_id,
      name: row.name,
      initials: initialsFor(row.name),
      services: row.services,
      specialties: parseJsonArray<string>(row.specialties),
      styles: matchable.styles,
      neighborhoods,
      citywide: matchable.citywide,
      coverageLabel: coverageLabel(matchable.citywide, neighborhoods),
      seekingClients: matchable.seekingClients,
      bioExcerpt: excerpt(row.bio),
      portfolioPreview,
      packages,
      priceFromCents: priceFrom,
      nextAvailableDate: nextAvailableDate(matchable),
      rating,
      completedProjects: completedProjectCount(db, row.user_id),
      isDemo: row.is_demo === 1,
      fit: filtersActive ? outcome.fit : null,
    };
    results.push({ card, score: outcome.fit?.score ?? 0, rating: rating.average, price: priceFrom });
  }

  results.sort((a, b) => {
    if (criteria.sort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0) || a.card.name.localeCompare(b.card.name);
    if (criteria.sort === 'price') return (a.price ?? Infinity) - (b.price ?? Infinity) || a.card.name.localeCompare(b.card.name);
    return b.score - a.score || (b.rating ?? 0) - (a.rating ?? 0) || a.card.name.localeCompare(b.card.name);
  });

  return {
    creators: results.map((r) => r.card),
    criteria,
    excluded,
    totalCreators: rows.length,
  };
}
