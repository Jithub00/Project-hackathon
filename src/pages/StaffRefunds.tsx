import { useState } from 'react';
import { EmptyState, ErrorAlert, LoadingBlock, PageHeader } from '@/components/site/ui-bits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { formatUsdExact } from '../../shared/money';
import { REFUND_POLICY_TITLE } from '../../shared/policy';
import type { RefundRequestView } from '../../shared/types';

interface QueueItem {
  projectId: string;
  projectTitle: string;
  policy: string;
  request: RefundRequestView;
}

const REASON: Record<RefundRequestView['reason'], string> = {
  cancellation: 'Cancellation (not covered by an automatic refund; a reviewer decides)',
  quality: 'Quality of delivered work',
  not_delivered: 'Agreed work not delivered',
};

/**
 * Photo Shoot reviewers' queue. Reviewers decide from the evidence on both sides. They cannot decide a booking they are
 * part of, and the server enforces that. Everyone else sees the refusal shown on the page.
 */
export function StaffRefunds() {
  const state = useApi(() => api.get<{ items: QueueItem[] }>('/api/refund-requests/review').then((d) => d.items), []);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 md:px-8 md:py-16">
      <PageHeader
        eyebrow="Platform review"
        title="Refund review"
        description={`Decide refund requests from the evidence on both sides, under the ${REFUND_POLICY_TITLE}. Give the reasons for every decision. Creators cannot decide a complaint about their own work.`}
      />
      <div className="mt-10 flex flex-col gap-6">
        {state.loading ? <LoadingBlock label="Loading the review queue" /> : null}
        {state.error ? <ErrorAlert message={state.error} onRetry={state.reload} /> : null}
        {state.data && state.data.length === 0 ? (
          <EmptyState testId="review-empty" title="Nothing waiting for review" body="Refund requests appear here once they are submitted, or when a cancellation is not covered by an automatic refund." />
        ) : null}
        {(state.data ?? []).map((item) => (
          <ReviewCard key={item.request.id} item={item} onDecided={state.reload} />
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ item, onDecided }: { item: QueueItem; onDecided: () => void }) {
  const { request } = item;
  const [decision, setDecision] = useState<'approve' | 'decline' | ''>('');
  const [dollars, setDollars] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = Math.round(Number(dollars) * 100);
  const valid = decision === 'decline' ? note.trim().length >= 10 : decision === 'approve' ? Number.isFinite(amountCents) && amountCents >= 1 && note.trim().length >= 10 : false;

  const submit = async () => {
    if (!valid || busy || decision === '') return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/refund-requests/${request.id}/decision`, {
        decision,
        ...(decision === 'approve' ? { amountCents } : {}),
        note: note.trim(),
      });
      onDecided();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="flex flex-col gap-5 rounded-lg border border-border bg-card p-6 text-sm" data-testid="review-item" data-request-id={request.id}>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="font-semibold">{item.projectTitle}</p>
          <p className="text-muted-foreground">{REASON[request.reason]}</p>
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-red-text">{request.statusLabel}</p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Paid toward the booking</dt><dd className="mt-1 font-semibold tabular-nums">{request.requestedCents !== null ? formatUsdExact(request.requestedCents) : 'Not recorded'}</dd></div>
        <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Submitted</dt><dd className="mt-1">{new Date(request.createdAt).toLocaleString('en-US')}</dd></div>
        {request.qualifies72h !== null ? (
          <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">72-hour guarantee applied</dt><dd className="mt-1">{request.qualifies72h ? 'Yes' : 'No'}</dd></div>
        ) : null}
      </dl>

      {request.description ? (
        <section aria-label="Customer's account" className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em]">Customer&apos;s account</h3>
          <p className="whitespace-pre-line leading-relaxed">{request.description}</p>
        </section>
      ) : null}

      {request.evidence.portfolio.length + request.evidence.deliveries.length + request.evidence.messages.length > 0 ? (
        <section aria-label="Evidence" className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em]">Evidence cited</h3>
          <ul className="flex flex-col gap-1 text-muted-foreground">
            {request.evidence.portfolio.map((p) => <li key={p.id}>Portfolio: {p.title}</li>)}
            {request.evidence.deliveries.map((d) => <li key={d.id}>Delivered file: {d.fileName}</li>)}
            {request.evidence.messages.map((m) => <li key={m.id}>{m.authorName}: “{m.body}”</li>)}
          </ul>
        </section>
      ) : null}

      {request.notes.length > 0 ? (
        <section aria-label="Responses" className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em]">Responses</h3>
          <ul className="flex flex-col gap-2">
            {request.notes.map((n) => <li key={n.id}><span className="font-semibold">{n.authorName}</span> ({n.authorRole}): {n.body}</li>)}
          </ul>
        </section>
      ) : null}

      <section aria-label="Decision" className="flex flex-col gap-4 border-t border-border pt-5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em]">Decision</h3>
        <RadioGroup value={decision} onValueChange={(value) => setDecision(value as 'approve' | 'decline')} aria-label="Decision">
          <div className="flex items-center gap-3">
            <RadioGroupItem value="approve" id={`approve-${request.id}`} />
            <Label htmlFor={`approve-${request.id}`} className="font-normal">Approve a refund</Label>
          </div>
          <div className="flex items-center gap-3">
            <RadioGroupItem value="decline" id={`decline-${request.id}`} />
            <Label htmlFor={`decline-${request.id}`} className="font-normal">Decline</Label>
          </div>
        </RadioGroup>
        {decision === 'approve' ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`amount-${request.id}`}>Refund amount (US dollars)</Label>
            <Input id={`amount-${request.id}`} type="number" min="0.01" step="0.01" value={dollars} onChange={(e) => setDollars(e.target.value)} className="max-w-48 bg-background" data-testid="decision-amount" />
            <p className="text-xs text-muted-foreground">The amount must not be more than the refundable amount paid toward this booking. The reasons below explain how it was set.</p>
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor={`note-${request.id}`}>Reasons for the decision</Label>
          <Textarea id={`note-${request.id}`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="bg-background" maxLength={2000} data-testid="decision-note" />
        </div>
        {error ? <ErrorAlert message={error} /> : null}
        <div>
          <Button onClick={() => void submit()} disabled={!valid || busy} data-testid="record-decision">
            {busy ? 'Recording…' : 'Record decision'}
          </Button>
        </div>
      </section>
    </article>
  );
}
