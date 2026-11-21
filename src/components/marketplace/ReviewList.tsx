import { Star } from 'lucide-react';
import { DemoBadge, EmptyState } from '@/components/site/ui-bits';
import { formatDate } from '@/lib/format';
import type { ReviewItem } from '../../../shared/types';

const CRITERIA: Array<{ key: 'communication' | 'reliability' | 'professionalism' | 'quality'; label: string }> = [
  { key: 'communication', label: 'Communication' },
  { key: 'reliability', label: 'Reliability' },
  { key: 'professionalism', label: 'Professionalism' },
  { key: 'quality', label: 'Quality' },
];

export function ReviewList({ reviews, title = 'Reviews', emptyText }: { reviews: ReviewItem[]; title?: string; emptyText?: string }) {
  return (
    <section aria-labelledby="reviews-heading" className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="reviews-heading" className="text-2xl font-black uppercase tracking-tight md:text-3xl">{title}</h2>
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">From completed bookings only</p>
      </div>
      {reviews.length === 0 ? (
        <EmptyState testId="reviews-empty" title="No reviews yet" body={emptyText ?? 'Reviews appear here after a project is completed and both sides have reviewed each other.'} />
      ) : (
        <ul className="flex flex-col divide-y divide-border border-y border-border" data-testid="review-list">
          {reviews.map((review) => (
            <li key={review.id} data-testid="review-item" className="grid gap-4 py-7 md:grid-cols-[220px_1fr]">
              <div className="flex flex-col gap-3">
                <p className="inline-flex items-center gap-2 text-lg font-black">
                  <Star className="size-5 fill-current" aria-hidden />
                  <span className="tabular-nums" data-testid="review-average">{review.average.toFixed(1)}</span>
                </p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {CRITERIA.map((c) => (
                    <div key={c.key} className="contents">
                      <dt>{c.label}</dt>
                      <dd className="text-right font-semibold tabular-nums text-foreground">{review[c.key]}/5</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs font-semibold uppercase tracking-[0.12em]" data-testid="review-expectations">
                  {review.expectationsMet ? 'Agreed expectations met' : 'Expectations only partly met'}
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <p className="text-base leading-relaxed">{review.body}</p>
                <p className="text-sm text-muted-foreground">
                  {review.reviewerName} ({review.reviewerRole === 'customer' ? 'customer' : 'creator'}) · {formatDate(review.createdAt)} · Booking: {review.projectTitle}
                </p>
                {review.isDemo ? <div><DemoBadge /></div> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
