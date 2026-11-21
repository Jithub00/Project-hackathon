import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreatorCard } from '@/components/marketplace/CreatorCard';
import { ANY_NEIGHBORHOOD, NeighborhoodSelect } from '@/components/marketplace/NeighborhoodSelect';
import { EmptyState, ErrorAlert, LoadingBlock, PageHeader } from '@/components/site/ui-bits';
import { api } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { formatUsd } from '../../shared/money';
import { BUDGET_OPTIONS_DOLLARS, STYLE_OPTIONS } from '../../shared/constants';
import { SERVICE_AREA_NAME } from '../../shared/service-area';
import type { DiscoveryResponse } from '../../shared/types';
import { todayString } from '@/lib/format';

const SERVICE_FILTERS = [
  { value: 'any', label: 'Any service' },
  { value: 'photography', label: 'Photography' },
  { value: 'videography', label: 'Videography' },
  { value: 'both', label: 'Photography and video' },
];

const RATING_FILTERS = [
  { value: 'any', label: 'Any rating' },
  { value: '4.5', label: '4.5 stars and up' },
  { value: '4.8', label: '4.8 stars and up' },
];

const SORT_OPTIONS = [
  { value: 'best', label: 'Best match' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'price', label: 'Lowest starting price' },
];

function reasonsFor(excluded: DiscoveryResponse['excluded'], params: URLSearchParams): string[] {
  const reasons: string[] = [];
  if (excluded.service) reasons.push(`${excluded.service} do not offer the service you need`);
  if (excluded.location) reasons.push(`${excluded.location} do not cover ${params.get('neighborhood') ?? 'that neighbourhood'}`);
  if (excluded.budget) reasons.push(`${excluded.budget} have no package within your budget`);
  if (excluded.availability) reasons.push(`${excluded.availability} are not free on your date`);
  if (excluded.rating) reasons.push(`${excluded.rating} are below your rating threshold`);
  if (excluded.style) reasons.push(`${excluded.style} do not work in the visual styles you chose`);
  if (excluded.notSeeking) reasons.push(`${excluded.notSeeking} are not taking new clients right now`);
  return reasons;
}

export function Discover() {
  const [params, setParams] = useSearchParams();
  const services = params.get('services') ?? 'any';
  const neighborhood = params.get('neighborhood') ?? ANY_NEIGHBORHOOD;
  const budget = params.get('budget') ?? 'any';
  const date = params.get('date') ?? '';
  const minRating = params.get('minRating') ?? 'any';
  const sort = params.get('sort') ?? 'best';
  const styles = useMemo(() => (params.get('styles') ? params.get('styles')!.split(',') : []), [params]);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (services !== 'any') q.set('services', services);
    if (neighborhood !== ANY_NEIGHBORHOOD) q.set('neighborhood', neighborhood);
    if (budget !== 'any') q.set('budget', budget);
    if (styles.length) q.set('styles', styles.join(','));
    if (date) q.set('date', date);
    if (minRating !== 'any') q.set('minRating', minRating);
    if (sort !== 'best') q.set('sort', sort);
    return q.toString();
  }, [services, neighborhood, budget, styles, date, minRating, sort]);

  const results = useApi(() => api.get<DiscoveryResponse>(`/api/creators${query ? `?${query}` : ''}`), [query]);

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === '' || value === 'any') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const toggleStyle = (style: string, checked: boolean) => {
    const next = checked ? [...styles, style] : styles.filter((s) => s !== style);
    update('styles', next.join(',') || null);
  };

  const filtersActive = query.length > 0;
  const data = results.data;
  const excludedReasons = data ? reasonsFor(data.excluded, params) : [];

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-5 md:px-8">
        <PageHeader
          eyebrow={`${SERVICE_AREA_NAME} only`}
          title="Find Los Angeles photographers & videographers"
          description={`Filter by service, neighbourhood, budget, style and date. Every creator here covers the City of ${SERVICE_AREA_NAME}, and each result shows why it fits your criteria.`}
          actions={
            <Button asChild variant="outline">
              <Link to="/match">Match me with a creative team</Link>
            </Button>
          }
        />
      </div>

      <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-12 md:px-8 lg:grid-cols-[300px_1fr] lg:gap-14">
        <form
          aria-label="Filter creators"
          data-testid="discover-filters"
          className="flex flex-col gap-7 lg:sticky lg:top-24 lg:self-start"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="filter-services" className="font-semibold">Service</Label>
            <Select value={services} onValueChange={(v) => update('services', v)}>
              <SelectTrigger id="filter-services" className="w-full bg-card" data-testid="filter-services">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_FILTERS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <NeighborhoodSelect
            id="filter-neighborhood"
            label="Los Angeles neighbourhood"
            value={neighborhood}
            includeAny
            onValueChange={(v) => update('neighborhood', v)}
            testId="filter-neighborhood"
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="filter-budget" className="font-semibold">Total budget</Label>
            <Select value={budget} onValueChange={(v) => update('budget', v)}>
              <SelectTrigger id="filter-budget" className="w-full bg-card" data-testid="filter-budget">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any budget</SelectItem>
                {BUDGET_OPTIONS_DOLLARS.map((d) => (
                  <SelectItem key={d} value={String(d)}>Up to {formatUsd(d * 100)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="filter-date" className="font-semibold">Preferred shoot date</Label>
            <Input
              id="filter-date"
              type="date"
              min={todayString()}
              value={date}
              onChange={(e) => update('date', e.target.value || null)}
              className="bg-card"
              data-testid="filter-date"
            />
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 font-semibold">Visual style</legend>
            {STYLE_OPTIONS.map((style) => (
              <label key={style} className="flex cursor-pointer items-center gap-2.5 text-sm">
                <Checkbox
                  checked={styles.includes(style)}
                  onCheckedChange={(checked) => toggleStyle(style, checked === true)}
                  aria-label={style}
                  data-testid={`style-${style.replace(/[^a-z]+/gi, '-').toLowerCase()}`}
                />
                <span>{style}</span>
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="filter-rating" className="font-semibold">Rating</Label>
            <Select value={minRating} onValueChange={(v) => update('minRating', v)}>
              <SelectTrigger id="filter-rating" className="w-full bg-card" data-testid="filter-rating">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATING_FILTERS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sort" className="font-semibold">Sort by</Label>
            <Select value={sort} onValueChange={(v) => update('sort', v)}>
              <SelectTrigger id="sort" className="w-full bg-card" data-testid="sort-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="button" variant="ghost" className="justify-start px-0 text-muted-foreground hover:text-foreground" onClick={() => setParams(new URLSearchParams(), { replace: true })} disabled={!filtersActive}>
            Reset filters
          </Button>
        </form>

        <section aria-labelledby="results-title" className="flex min-w-0 flex-col gap-8">
          <div className="flex flex-col gap-2 border-b border-border pb-6">
            <h2 id="results-title" className="text-2xl font-black uppercase tracking-tight" data-testid="results-count">
              {data ? `${data.creators.length} Los Angeles creator${data.creators.length === 1 ? '' : 's'}` : 'Loading creators'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {filtersActive
                ? 'Each card explains why this creator fits your filters. Matching uses only the information on their profile.'
                : 'Browse every creator who is taking new clients. Add filters to see why each creator fits your project.'}
            </p>
          </div>

          {results.loading ? <LoadingBlock label="Matching creators" /> : null}
          {results.error ? <ErrorAlert message={results.error} onRetry={results.reload} /> : null}

          {data && data.creators.length === 0 ? (
            <EmptyState
              testId="no-matches"
              title="No creators match these filters yet"
              body={
                <div className="flex flex-col gap-3">
                  {excludedReasons.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-5">
                      {excludedReasons.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  ) : (
                    <p>No creator has a profile that matches these filters.</p>
                  )}
                  <p>Try a higher budget, another neighbourhood, or a wider date range.</p>
                </div>
              }
              action={
                <>
                  <Button variant="outline" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Reset filters</Button>
                  <Button asChild><Link to="/match">Let us build a team</Link></Button>
                </>
              }
            />
          ) : null}

          {data && data.creators.length > 0 ? (
            <ul className="grid gap-6 md:grid-cols-2 2xl:grid-cols-3" data-testid="creator-results">
              {data.creators.map((creator) => (
                <li key={creator.id} className="flex">
                  <CreatorCard creator={creator} className="w-full" />
                </li>
              ))}
            </ul>
          ) : null}

          {data && data.excluded && (data.excluded.notSeeking > 0) ? (
            <p className="text-sm text-muted-foreground">
              {data.excluded.notSeeking} creator{data.excluded.notSeeking === 1 ? ' is' : 's are'} not taking new clients right now and {data.excluded.notSeeking === 1 ? 'is' : 'are'} hidden from results.
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}
