import type { ReactNode } from 'react';
import { AlertCircle, Loader2, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatUsdExact } from '../../../shared/money';
import { CUSTOMER_FEE_RATE, CREATOR_COMMISSION_RATE, DEPOSIT_RATE } from '../../../shared/pricing';
import { STATUS_META, statusTone } from '../../../shared/status';
import type { ProjectStatus, QuoteView } from '../../../shared/types';

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('eyebrow', className)}>{children}</p>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('border-b border-border pb-10 pt-12 md:pb-14 md:pt-20', className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <div className="mt-5 flex flex-col gap-6 md:flex-row md:flex-wrap md:items-end md:justify-between">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-4xl font-black uppercase leading-[0.95] tracking-tight md:text-6xl">{title}</h1>
          {description ? <div className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}

export function EmptyState({
  title,
  body,
  action,
  className,
  testId,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId ?? 'empty-state'}
      className={cn('flex flex-col items-start gap-4 rounded-lg border border-dashed border-border-strong bg-card/60 p-8 md:p-10', className)}
    >
      <p className="text-lg font-bold uppercase tracking-tight">{title}</p>
      {body ? <div className="max-w-xl text-sm leading-relaxed text-muted-foreground">{body}</div> : null}
      {action ? <div className="flex flex-wrap gap-3 pt-1">{action}</div> : null}
    </div>
  );
}

export function ErrorAlert({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col gap-3 rounded-lg border border-primary/60 bg-primary/10 p-5 text-sm sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-brand-red-text" aria-hidden />
        <p className="leading-relaxed">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-40 items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span>{label}…</span>
    </div>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      data-testid="demo-badge"
      className={cn('border-white/40 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground', className)}
    >
      Demonstration
    </Badge>
  );
}

export function StatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  const tone = statusTone(status);
  return (
    <Badge
      data-testid="status-badge"
      data-status={status}
      className={cn(
        'rounded-sm px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]',
        tone === 'red' && 'bg-primary text-primary-foreground',
        tone === 'solid' && 'bg-foreground text-background',
        tone === 'outline' && 'border border-white/40 bg-transparent text-foreground',
        tone === 'muted' && 'border border-border bg-transparent text-muted-foreground',
        className,
      )}
    >
      {STATUS_META[status].label}
    </Badge>
  );
}

export function RatingLine({ average, count, className }: { average: number | null; count: number; className?: string }) {
  if (average === null || count === 0) {
    return <p className={cn('text-sm text-muted-foreground', className)}>No reviews yet</p>;
  }
  return (
    <p className={cn('inline-flex items-center gap-1.5 text-sm', className)} aria-label={`Rated ${average.toFixed(1)} from ${count} completed bookings`}>
      <Star className="size-4 fill-current text-foreground" aria-hidden />
      <span className="font-semibold tabular-nums">{average.toFixed(1)}</span>
      <span className="text-muted-foreground">· {count} review{count === 1 ? '' : 's'}</span>
    </p>
  );
}

export function InitialsAvatar({ initials, size = 'md', className }: { initials: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-white/35 bg-surface-raised font-display font-black tracking-tight text-foreground',
        size === 'sm' && 'size-9 text-xs',
        size === 'md' && 'size-12 text-sm',
        size === 'lg' && 'size-20 text-xl',
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function FieldError({ message, id }: { message?: string | null; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm font-medium text-brand-red-text" aria-live="polite">
      {message}
    </p>
  );
}

export function SectionTitle({ eyebrow, title, description, className }: { eyebrow?: string; title: string; description?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="text-3xl font-black uppercase leading-none tracking-tight md:text-5xl">{title}</h2>
      {description ? <div className="max-w-2xl text-base leading-relaxed text-muted-foreground">{description}</div> : null}
    </div>
  );
}

/** Price summary for a team. Every figure the customer will pay or a creator will receive appears here. */
export function PriceBreakdown({ quote, perspective = 'customer', title = 'Price breakdown' }: { quote: QuoteView; perspective?: 'customer' | 'creator'; title?: string }) {
  if (quote.basis === 'none') {
    return <p className="text-sm text-muted-foreground">Add creators to the team to see the price.</p>;
  }
  const rows: Array<{ label: string; value: string; strong?: boolean; testId?: string }> = [
    { label: 'Creator packages (subtotal)', value: formatUsdExact(quote.subtotalCents), testId: 'quote-subtotal' },
    { label: `Customer service fee (${Math.round(CUSTOMER_FEE_RATE * 100)}%)`, value: formatUsdExact(quote.customerFeeCents), testId: 'quote-fee' },
    { label: 'Total', value: formatUsdExact(quote.totalCents), strong: true, testId: 'quote-total' },
    { label: `Deposit due to book (${Math.round(DEPOSIT_RATE * 100)}%)`, value: formatUsdExact(quote.depositCents), testId: 'quote-deposit' },
    { label: 'Balance due after you confirm completion', value: formatUsdExact(quote.balanceCents), testId: 'quote-balance' },
  ];
  if (perspective === 'creator') {
    rows.push({ label: `Platform commission (${Math.round(CREATOR_COMMISSION_RATE * 100)}% of packages)`, value: `-${formatUsdExact(quote.creatorCommissionCents)}`, testId: 'quote-commission' });
    rows.push({ label: 'Team payouts after commission', value: formatUsdExact(quote.creatorPayoutCents), strong: true, testId: 'quote-payout' });
  }
  return (
    <section aria-label={title} className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-lg font-black uppercase tracking-tight">{title}</h3>
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{quote.basis === 'accepted' ? 'Agreed terms' : 'Draft terms (not yet agreed)'}</span>
      </div>
      <dl className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-6 py-3">
            <dt className={cn('text-sm', row.strong ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{row.label}</dt>
            <dd data-testid={row.testId} className={cn('tabular-nums', row.strong ? 'text-lg font-black' : 'text-sm')}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {quote.lines.length > 0 ? (
        <ul className="mt-5 flex flex-col gap-2 border-t border-border pt-5 text-sm" aria-label="Per person">
          {quote.lines.map((line) => (
            <li key={line.userId} className="flex flex-wrap items-baseline justify-between gap-3" data-testid="quote-line">
              <span>
                <span className="font-semibold">{line.name}</span>
                <span className="text-muted-foreground"> · {line.roleLabel} · {line.packageName}</span>
              </span>
              <span className="tabular-nums">{formatUsdExact(line.priceCents)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function Stat({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p data-testid={testId} className="text-3xl font-black tabular-nums">{value}</p>
    </div>
  );
}
