import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DemoBadge, EmptyState } from '@/components/site/ui-bits';
import type { PortfolioItem } from '../../../shared/types';

function isVideoFile(url: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(url);
}

/** Photography or videography portfolio. Uploaded videos play; sample videos show a labelled preview frame. */
export function PortfolioGrid({
  items,
  kind,
  emptyTitle,
  emptyBody,
  emptyAction,
  onRemove,
}: {
  items: PortfolioItem[];
  kind: 'photo' | 'video';
  emptyTitle: string;
  emptyBody: string;
  emptyAction?: React.ReactNode;
  onRemove?: (item: PortfolioItem) => void;
}) {
  if (items.length === 0) {
    return <EmptyState testId={`${kind}-empty`} title={emptyTitle} body={emptyBody} action={emptyAction} />;
  }
  return (
    <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3" data-testid={`${kind}-grid`}>
      {items.map((item) => (
        <li key={item.id} data-testid="portfolio-item" className="group flex flex-col gap-4">
          <figure className="flex flex-col gap-4">
            <div className="photo-frame aspect-[4/3]">
              {item.kind === 'video' && isVideoFile(item.mediaUrl) ? (
                <video controls preload="metadata" poster={item.posterUrl ?? undefined} src={item.mediaUrl} className="h-full w-full object-cover" aria-label={`${item.title} video`}>
                  <track kind="captions" />
                </video>
              ) : (
                <img src={item.posterUrl ?? item.mediaUrl} alt={item.title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              )}
              {item.kind === 'video' && !isVideoFile(item.mediaUrl) ? (
                <span className="absolute bottom-3 left-3 rounded-sm bg-black/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
                  Video preview (poster frame)
                </span>
              ) : null}
            </div>
            <figcaption className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <h4 className="text-lg font-bold leading-snug">{item.title}</h4>
                {item.isDemo ? <DemoBadge /> : null}
              </div>
              {item.contribution ? <p className="text-sm leading-relaxed text-muted-foreground">{item.contribution}</p> : null}
              {item.projectLabel ? <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-red-text">{item.projectLabel}</p> : null}
              {onRemove && !item.isDemo ? (
                <div>
                  <Button variant="ghost" size="sm" onClick={() => onRemove(item)} aria-label={`Remove ${item.title}`}>
                    <Trash2 aria-hidden /> Remove
                  </Button>
                </div>
              ) : null}
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}
