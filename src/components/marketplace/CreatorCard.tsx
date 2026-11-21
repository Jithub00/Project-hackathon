import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Check, MapPin, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemoBadge, InitialsAvatar, RatingLine } from '@/components/site/ui-bits';
import { PortfolioPreviewCarousel } from '@/components/marketplace/PortfolioPreviewCarousel';
import { formatDate } from '@/lib/format';
import { formatUsd } from '../../../shared/money';
import type { CreatorCard as CreatorCardData } from '../../../shared/types';
import { cn } from '@/lib/utils';

const SERVICE_LABEL: Record<CreatorCardData['services'], string> = {
  photography: 'Photographer',
  videography: 'Videographer',
  both: 'Photographer & videographer',
};

export function CreatorCard({
  creator,
  actions,
  showFit = true,
  className,
}: {
  creator: CreatorCardData;
  actions?: ReactNode;
  showFit?: boolean;
  className?: string;
}) {
  const fit = showFit ? creator.fit : null;
  return (
    <article
      data-testid="creator-card"
      data-creator-id={creator.id}
      className={cn('group flex h-full flex-col gap-5 rounded-lg border border-border bg-card p-6 transition-colors duration-300 hover:border-border-strong', className)}
    >
      <PortfolioPreviewCarousel creatorName={creator.name} photos={creator.portfolioPreview ?? []} />

      <header className="flex items-start gap-4">
        <InitialsAvatar initials={creator.initials} />
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-black uppercase leading-tight tracking-tight">
            <Link to={`/creators/${creator.id}`} className="rounded-sm hover:text-brand-red-text focus-visible:outline-2">
              {creator.name}
            </Link>
          </h3>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{SERVICE_LABEL[creator.services]}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {creator.isDemo ? <DemoBadge /> : null}
            {!creator.seekingClients ? (
              <Badge variant="outline" className="border-border text-muted-foreground">Not taking new clients</Badge>
            ) : null}
          </div>
        </div>
      </header>

      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{creator.coverageLabel}</span>
      </p>

      <ul className="flex flex-wrap gap-2" aria-label="Specialties">
        {creator.specialties.slice(0, 4).map((s) => (
          <li key={s}>
            <Badge variant="outline" className="rounded-sm border-white/25 font-normal text-foreground">{s}</Badge>
          </li>
        ))}
      </ul>

      <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{creator.bioExcerpt}</p>

      <dl className="grid grid-cols-2 gap-4 border-y border-border py-4 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Packages from</dt>
          <dd data-testid="price-from" className="mt-1 text-lg font-black tabular-nums">
            {creator.priceFromCents !== null ? formatUsd(creator.priceFromCents) : 'On request'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Next available</dt>
          <dd data-testid="next-available" className="mt-1 font-semibold">
            {creator.nextAvailableDate ? formatDate(creator.nextAvailableDate, { month: 'short', day: 'numeric' }) : 'Ask about dates'}
          </dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-3">
        <RatingLine average={creator.rating.average} count={creator.rating.count} />
        <span className="text-xs text-muted-foreground">{creator.completedProjects} completed</span>
      </div>

      {fit ? (
        <div data-testid="fit-reasons" className="rounded-md border border-white/15 bg-surface-raised p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-red-text">Why this creator fits</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {fit.reasons.map((reason) => (
              <li key={reason} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
                <span>{reason}</span>
              </li>
            ))}
            {fit.cautions.map((caution) => (
              <li key={caution} className="flex items-start gap-2 text-muted-foreground">
                <Minus className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{caution}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-3 pt-1">
        {actions ?? (
          <Button asChild variant="outline" size="sm">
            <Link to={`/creators/${creator.id}`} aria-label={`View profile of ${creator.name}`}>View profile</Link>
          </Button>
        )}
      </div>
    </article>
  );
}

