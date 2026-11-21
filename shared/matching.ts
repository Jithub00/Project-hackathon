import { coverageIncludes } from './service-area';
import { formatUsd } from './money';
import type { CreatorPackage, FitInfo, ServiceKind, ServiceNeed } from './types';

/** The data the matcher needs for each creator. Built by the API from the database. */
export interface MatchableCreator {
  id: string;
  name: string;
  services: ServiceNeed;
  styles: string[];
  neighborhoods: string[];
  citywide: boolean;
  seekingClients: boolean;
  weekdays: number[];
  availableDates: string[];
  bookedDates: string[];
  packages: CreatorPackage[];
  ratingAverage: number | null;
  ratingCount: number;
}

export interface MatchCriteria {
  services: ServiceNeed | 'any';
  neighborhood: string | null;
  budgetCents: number | null;
  styles: string[];
  dates: string[];
  minRating: number | null;
}

export type ExclusionReason = 'service' | 'location' | 'budget' | 'availability' | 'notSeeking' | 'rating' | 'style';

export interface MatchOutcome {
  creatorId: string;
  included: boolean;
  excludedFor: ExclusionReason | null;
  excludedMessage: string | null;
  fit: FitInfo | null;
}

const ROLE_WORD: Record<ServiceKind, string> = {
  photography: 'photography',
  videography: 'video',
};

export function neededServices(services: ServiceNeed | 'any'): ServiceKind[] {
  if (services === 'photography') return ['photography'];
  if (services === 'videography') return ['videography'];
  if (services === 'both') return ['photography', 'videography'];
  return [];
}

export function offersService(creatorServices: ServiceNeed, service: ServiceKind): boolean {
  return creatorServices === 'both' || creatorServices === service;
}

export function cheapestPackage(packages: CreatorPackage[], service: ServiceKind): CreatorPackage | null {
  const options = packages.filter((p) => p.service === service);
  if (options.length === 0) return null;
  return options.reduce((best, p) => (p.priceCents < best.priceCents ? p : best));
}

/** Date-level availability: explicit available dates, or a usual working weekday that is not booked. */
export function availableOn(creator: Pick<MatchableCreator, 'availableDates' | 'weekdays' | 'bookedDates'>, date: string): boolean | null {
  if (creator.bookedDates.includes(date)) return false;
  if (creator.availableDates.includes(date)) return true;
  if (creator.weekdays.length === 0 && creator.availableDates.length === 0) return null; // unknown
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return creator.weekdays.includes(day);
}

export function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function evaluateCreator(creator: MatchableCreator, criteria: MatchCriteria): MatchOutcome {
  const reject = (excludedFor: ExclusionReason, excludedMessage: string): MatchOutcome => ({
    creatorId: creator.id,
    included: false,
    excludedFor,
    excludedMessage,
    fit: null,
  });

  const needs = neededServices(criteria.services);
  if (needs.length > 0 && !needs.some((s) => offersService(creator.services, s))) {
    return reject('service', `Does not offer ${needs.map((s) => ROLE_WORD[s]).join(' or ')}.`);
  }
  if (!creator.seekingClients) {
    return reject('notSeeking', 'Not taking new clients right now.');
  }
  if (criteria.neighborhood && !coverageIncludes(creator, criteria.neighborhood)) {
    return reject('location', `Does not cover ${criteria.neighborhood}.`);
  }
  if (criteria.styles.length > 0 && !creator.styles.some((s) => criteria.styles.includes(s))) {
    return reject('style', 'Does not work in any of the visual styles you chose.');
  }
  if (criteria.minRating !== null) {
    if (creator.ratingAverage === null || creator.ratingAverage < criteria.minRating) {
      return reject('rating', `Rated below ${criteria.minRating} stars.`);
    }
  }

  const coversAllServices = needs.length === 0 || needs.every((s) => offersService(creator.services, s));
  const recommended: FitInfo['recommended'] = [];
  for (const service of needs) {
    if (!offersService(creator.services, service)) continue;
    const pkg = cheapestPackage(creator.packages, service);
    if (pkg) recommended.push({ service, packageId: pkg.id, packageName: pkg.name, priceCents: pkg.priceCents });
  }
  // A creator who can only cover part of the request is still useful as a team member.
  const recommendedTotal = recommended.reduce((sum, r) => sum + r.priceCents, 0);

  if (criteria.budgetCents !== null) {
    // Without a requested service, the cheapest package the creator offers decides whether they fit.
    const pool = needs.length > 0 ? recommended.map((r) => r.priceCents) : creator.packages.map((p) => p.priceCents);
    const cheapestSingle = pool.length > 0 ? Math.min(...pool) : null;
    if (cheapestSingle !== null && cheapestSingle > criteria.budgetCents) {
      return reject('budget', `Cheapest package ${formatUsd(cheapestSingle)} is above your ${formatUsd(criteria.budgetCents)} budget.`);
    }
  }

  let availabilityNote: string | null = null;
  if (criteria.dates.length > 0) {
    const results = criteria.dates.map((d) => ({ date: d, state: availableOn(creator, d) }));
    const open = results.filter((r) => r.state === true);
    const unknown = results.every((r) => r.state === null);
    if (open.length === 0 && !unknown) {
      return reject('availability', 'Not available on your preferred dates.');
    }
    if (open.length > 0) {
      availabilityNote = `Available ${open.map((r) => formatShortDate(r.date)).join(', ')}`;
    }
  }

  const reasons: string[] = [];
  const cautions: string[] = [];
  let score = 50;

  if (needs.length === 0) {
    reasons.push(creator.services === 'both' ? 'Offers photography and video' : `Offers ${ROLE_WORD[creator.services as ServiceKind]}`);
  } else if (coversAllServices) {
    score += 15;
    reasons.push(needs.length === 2 ? 'Covers both photography and video' : `Offers ${ROLE_WORD[needs[0]]}`);
  } else {
    score += 8;
    const offered = needs.find((s) => offersService(creator.services, s));
    reasons.push(`Team member for ${offered ? ROLE_WORD[offered] : 'your project'}`);
    cautions.push(`Needs another creator for ${needs.filter((s) => s !== offered).map((s) => ROLE_WORD[s]).join(' and ')}`);
  }

  if (criteria.neighborhood) {
    if (creator.citywide) {
      score += 6;
      reasons.push('Covers all of Los Angeles');
    } else {
      score += 10;
      reasons.push(`Covers ${criteria.neighborhood}`);
    }
  }

  if (criteria.budgetCents !== null && recommendedTotal > 0) {
    const ratio = Math.min(1, recommendedTotal / criteria.budgetCents);
    score += Math.round(10 * (1 - ratio));
    const first = recommended[0];
    reasons.push(`${first.packageName} from ${formatUsd(first.priceCents)} fits your budget`);
  }

  if (criteria.styles.length > 0) {
    const overlap = creator.styles.filter((s) => criteria.styles.includes(s));
    if (overlap.length > 0) {
      score += Math.round((overlap.length / criteria.styles.length) * 15);
      reasons.push(`Shares your style: ${overlap.join(', ')}`);
    } else {
      cautions.push('Different style focus. Ask for a portfolio review.');
    }
  }

  if (availabilityNote) {
    score += 10;
    reasons.push(availabilityNote);
  } else if (criteria.dates.length > 0) {
    cautions.push('Ask about availability for your dates.');
  } else if (creator.weekdays.length > 0) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    reasons.push(`Usually available ${creator.weekdays.map((d) => names[d]).join(', ')}`);
  }

  if (creator.ratingAverage !== null && creator.ratingCount > 0) {
    score += Math.max(0, Math.min(5, Math.round((creator.ratingAverage - 4) * 5)));
    reasons.push(`Rated ${creator.ratingAverage.toFixed(1)} from ${creator.ratingCount} completed ${creator.ratingCount === 1 ? 'booking' : 'bookings'}`);
  }

  const fit: FitInfo = {
    score,
    reasons,
    cautions,
    recommended,
    coversAllServices,
  };
  return { creatorId: creator.id, included: true, excludedFor: null, excludedMessage: null, fit };
}

export interface TeamSuggestion {
  members: Array<{ creatorId: string; service: ServiceKind; packageId: string; packageName: string; priceCents: number }>;
  subtotalCents: number;
  withinBudget: boolean;
  message: string;
}

/**
 * Suggests the best-scoring photographer and videographer when a project needs both.
 * Returns the cheapest combination if nothing fits the budget, and explains why.
 */
export function suggestTeam(outcomes: MatchOutcome[], creators: MatchableCreator[], criteria: MatchCriteria): TeamSuggestion | null {
  if (criteria.services !== 'both') return null;
  const byId = new Map(creators.map((c) => [c.id, c]));
  const included = outcomes.filter((o) => o.included && o.fit).sort((a, b) => b.fit!.score - a.fit!.score);
  const pick = (service: ServiceKind) => {
    for (const outcome of included) {
      const creator = byId.get(outcome.creatorId);
      if (!creator || !offersService(creator.services, service)) continue;
      const pkg = cheapestPackage(creator.packages, service);
      if (!pkg) continue;
      return { creatorId: creator.id, service, packageId: pkg.id, packageName: pkg.name, priceCents: pkg.priceCents };
    }
    return null;
  };
  const photo = pick('photography');
  const video = pick('videography');
  if (!photo || !video) {
    return {
      members: [],
      subtotalCents: 0,
      withinBudget: false,
      message: !photo
        ? 'No photographer in this area matches your requirements yet.'
        : 'No videographer in this area matches your requirements yet.',
    };
  }
  const subtotalCents = photo.priceCents + video.priceCents;
  const withinBudget = criteria.budgetCents === null || subtotalCents <= criteria.budgetCents;
  return {
    members: [photo, video],
    subtotalCents,
    withinBudget,
    message: withinBudget
      ? 'Suggested team: the best-matched photographer and videographer for this brief.'
      : `The best-matched team totals ${formatUsd(subtotalCents)}, above your ${formatUsd(criteria.budgetCents ?? 0)} budget. Raise the budget or choose lower packages.`,
  };
}
