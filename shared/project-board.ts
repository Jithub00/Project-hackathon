/**
 * Filter rules for the project board. Demonstration projects and live open calls both pass through these
 * functions, so "Photographer", a neighbourhood or a budget band means the same thing in both sections.
 */

export type CreativeRole = 'photographer' | 'videographer';

export type RoleFilter = 'any' | 'photographer' | 'videographer' | 'both';
export type BudgetFilter = 'any' | 'under-1000' | '1000-1500' | 'over-1500';

export interface BoardFilters {
  role: RoleFilter;
  /** 'any' or one of the Los Angeles neighbourhood names from shared/service-area. */
  neighborhood: string;
  budget: BudgetFilter;
}

export interface BoardListing {
  neighborhood: string;
  /** Roles the project needs. A project that needs both lists both. */
  needs: readonly CreativeRole[];
  /** Total project budget in cents. */
  budgetCents: number;
}

export const DEFAULT_BOARD_FILTERS: BoardFilters = { role: 'any', neighborhood: 'any', budget: 'any' };

export const ROLE_FILTER_OPTIONS: ReadonlyArray<{ value: RoleFilter; label: string }> = [
  { value: 'any', label: 'Any role' },
  { value: 'photographer', label: 'Photographer' },
  { value: 'videographer', label: 'Videographer' },
  { value: 'both', label: 'Photographer and videographer' },
];

export const BUDGET_FILTER_OPTIONS: ReadonlyArray<{ value: BudgetFilter; label: string }> = [
  { value: 'any', label: 'Any budget' },
  { value: 'under-1000', label: 'Under $1,000' },
  { value: '1000-1500', label: '$1,000 to $1,500' },
  { value: 'over-1500', label: 'Over $1,500' },
];

/** Inclusive cent bounds for each band. $1,500 itself belongs to the middle band. */
const BUDGET_BOUNDS: Record<Exclude<BudgetFilter, 'any'>, { min: number; max: number }> = {
  'under-1000': { min: 0, max: 99_999 },
  '1000-1500': { min: 100_000, max: 150_000 },
  'over-1500': { min: 150_001, max: Number.POSITIVE_INFINITY },
};

/** Maps a live project's service need (photography, videography or both) to the roles it needs. */
export function rolesNeeded(services: string): CreativeRole[] {
  if (services === 'photography') return ['photographer'];
  if (services === 'videography') return ['videographer'];
  if (services === 'both') return ['photographer', 'videographer'];
  return [];
}

export function matchesRole(needs: readonly CreativeRole[], role: RoleFilter): boolean {
  if (role === 'any') return true;
  if (role === 'both') return needs.includes('photographer') && needs.includes('videographer');
  return needs.includes(role);
}

export function matchesBudget(budgetCents: number, band: BudgetFilter): boolean {
  if (band === 'any') return true;
  const { min, max } = BUDGET_BOUNDS[band];
  return budgetCents >= min && budgetCents <= max;
}

export function matchesBoardFilters(listing: BoardListing, filters: BoardFilters): boolean {
  if (filters.neighborhood !== 'any' && listing.neighborhood !== filters.neighborhood) return false;
  return matchesRole(listing.needs, filters.role) && matchesBudget(listing.budgetCents, filters.budget);
}

export function filterBoardItems<T>(items: readonly T[], filters: BoardFilters, toListing: (item: T) => BoardListing): T[] {
  return items.filter((item) => matchesBoardFilters(toListing(item), filters));
}

export function isDefaultBoardFilters(filters: BoardFilters): boolean {
  return filters.role === 'any' && filters.neighborhood === 'any' && filters.budget === 'any';
}
