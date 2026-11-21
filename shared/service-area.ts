/**
 * Photo Shoot is a Los Angeles-only service. Discovery, matching, creator
 * coverage and shoot locations are all limited to the City of Los Angeles
 * neighbourhoods below. Anything outside this list is rejected by the API and
 * cannot be selected in the interface.
 */

export const SERVICE_AREA_NAME = 'Los Angeles';

export const SERVICE_AREA_STATEMENT =
  'Photo Shoot serves the City of Los Angeles only. Discovery, matching, creator coverage and shoot locations are limited to the neighbourhoods listed here.';

export const LA_REGIONS = [
  'Downtown & Central',
  'Hollywood & Eastside',
  'Westside',
  'San Fernando Valley',
  'South & Harbor',
] as const;

export type LaRegion = (typeof LA_REGIONS)[number];

export interface LaNeighborhood {
  name: string;
  region: LaRegion;
}

export const LA_NEIGHBORHOODS: readonly LaNeighborhood[] = [
  { name: 'Downtown LA', region: 'Downtown & Central' },
  { name: 'Arts District', region: 'Downtown & Central' },
  { name: 'Chinatown', region: 'Downtown & Central' },
  { name: 'Little Tokyo', region: 'Downtown & Central' },
  { name: 'Westlake', region: 'Downtown & Central' },
  { name: 'Koreatown', region: 'Downtown & Central' },
  { name: 'Mid-City', region: 'Downtown & Central' },
  { name: 'Miracle Mile', region: 'Downtown & Central' },
  { name: 'Fairfax', region: 'Downtown & Central' },
  { name: 'Hancock Park', region: 'Downtown & Central' },
  { name: 'Hollywood', region: 'Hollywood & Eastside' },
  { name: 'Hollywood Hills', region: 'Hollywood & Eastside' },
  { name: 'Los Feliz', region: 'Hollywood & Eastside' },
  { name: 'Silver Lake', region: 'Hollywood & Eastside' },
  { name: 'Echo Park', region: 'Hollywood & Eastside' },
  { name: 'Griffith Park', region: 'Hollywood & Eastside' },
  { name: 'Eagle Rock', region: 'Hollywood & Eastside' },
  { name: 'Highland Park', region: 'Hollywood & Eastside' },
  { name: 'Atwater Village', region: 'Hollywood & Eastside' },
  { name: 'Boyle Heights', region: 'Hollywood & Eastside' },
  { name: 'Westwood', region: 'Westside' },
  { name: 'Brentwood', region: 'Westside' },
  { name: 'Bel Air', region: 'Westside' },
  { name: 'Pacific Palisades', region: 'Westside' },
  { name: 'Venice', region: 'Westside' },
  { name: 'Mar Vista', region: 'Westside' },
  { name: 'Playa Vista', region: 'Westside' },
  { name: 'Playa del Rey', region: 'Westside' },
  { name: 'Palms', region: 'Westside' },
  { name: 'Sawtelle', region: 'Westside' },
  { name: 'Studio City', region: 'San Fernando Valley' },
  { name: 'Sherman Oaks', region: 'San Fernando Valley' },
  { name: 'Encino', region: 'San Fernando Valley' },
  { name: 'Tarzana', region: 'San Fernando Valley' },
  { name: 'Woodland Hills', region: 'San Fernando Valley' },
  { name: 'Van Nuys', region: 'San Fernando Valley' },
  { name: 'North Hollywood', region: 'San Fernando Valley' },
  { name: 'Valley Village', region: 'San Fernando Valley' },
  { name: 'Reseda', region: 'San Fernando Valley' },
  { name: 'Granada Hills', region: 'San Fernando Valley' },
  { name: 'Sylmar', region: 'San Fernando Valley' },
  { name: 'Chatsworth', region: 'San Fernando Valley' },
  { name: 'San Pedro', region: 'South & Harbor' },
  { name: 'Wilmington', region: 'South & Harbor' },
  { name: 'Harbor Gateway', region: 'South & Harbor' },
  { name: 'Exposition Park', region: 'South & Harbor' },
  { name: 'Leimert Park', region: 'South & Harbor' },
];

export const LA_NEIGHBORHOOD_NAMES: readonly string[] = LA_NEIGHBORHOODS.map((n) => n.name);

/** Creators can choose "All of Los Angeles" instead of listing neighbourhoods one by one. */
export const CITYWIDE_LABEL = 'All of Los Angeles';

export function isLaNeighborhood(value: unknown): value is string {
  return typeof value === 'string' && LA_NEIGHBORHOOD_NAMES.includes(value);
}

export function regionOf(neighborhood: string): LaRegion | null {
  return LA_NEIGHBORHOODS.find((n) => n.name === neighborhood)?.region ?? null;
}

export function neighborhoodsByRegion(): Array<{ region: LaRegion; names: string[] }> {
  return LA_REGIONS.map((region) => ({
    region,
    names: LA_NEIGHBORHOODS.filter((n) => n.region === region).map((n) => n.name),
  }));
}

/** True when a creator's coverage includes the given neighbourhood. */
export function coverageIncludes(
  coverage: { citywide: boolean; neighborhoods: readonly string[] },
  neighborhood: string,
): boolean {
  return coverage.citywide || coverage.neighborhoods.includes(neighborhood);
}
