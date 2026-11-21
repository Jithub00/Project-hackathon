import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BoardFilterBar } from '@/components/opportunities/BoardFilterBar';
import { DemonstrationProjectCard } from '@/components/opportunities/DemonstrationProjectCard';
import { EmptyState, ErrorAlert, FieldError, LoadingBlock, PageHeader } from '@/components/site/ui-bits';
import { api, errorMessage } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { formatDate } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { formatUsd as money } from '../../shared/money';
import { DEMONSTRATION_PROJECTS, demonstrationListing } from '../../shared/demonstration-projects';
import { DEFAULT_BOARD_FILTERS, filterBoardItems, isDefaultBoardFilters, rolesNeeded, type BoardFilters } from '../../shared/project-board';
import { SERVICE_AREA_NAME } from '../../shared/service-area';
import type { ProjectSummary } from '../../shared/types';

interface OpenCall extends ProjectSummary {
  description: string;
  styleTags: string[];
  interest: string | null;
}

function OpenCallCard({ call, onSent }: { call: OpenCall; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/projects/${call.id}/interest`, { message });
      setOpen(false);
      onSent();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="flex flex-col gap-5 rounded-lg border border-border bg-card p-6 md:p-7" data-testid="open-call" data-project-id={call.id}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{call.contentType} · {call.customer.name}</p>
          <h2 className="mt-2 text-2xl font-black uppercase leading-tight tracking-tight">{call.title}</h2>
        </div>
        <Badge variant="outline" className="border-white/40 text-[11px] uppercase tracking-[0.12em]">Live open call</Badge>
      </header>
      <p className="text-sm leading-relaxed text-muted-foreground">{call.description}</p>
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Location</dt>
          <dd className="mt-1 flex items-center gap-2"><MapPin className="size-4" aria-hidden />{call.neighborhood}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Budget</dt>
          <dd className="mt-1 font-semibold">Up to {money(call.budgetCents)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Needs</dt>
          <dd className="mt-1">{call.services === 'both' ? 'Photography and video' : call.services === 'photography' ? 'Photography' : 'Videography'}</dd>
        </div>
      </dl>
      {call.styleTags.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {call.styleTags.map((s) => <li key={s}><Badge variant="outline" className="rounded-sm font-normal">{s}</Badge></li>)}
        </ul>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-4 border-t border-border pt-5">
        {call.interest ? (
          <p className="text-sm font-semibold" data-testid="interest-status">
            {call.interest === 'interested' ? 'Interest sent. The customer will reply.' : call.interest === 'invited' ? 'You are invited. Review the invitation.' : `Status: ${call.interest}`}
          </p>
        ) : (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="express-interest">Express interest</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Express interest in {call.title}</DialogTitle>
                <DialogDescription>Introduce yourself and your relevant work. The customer sees this note when reviewing applicants.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`interest-${call.id}`}>Your note (optional)</Label>
                <Textarea id={`interest-${call.id}`} value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={500} data-testid="interest-message" />
                <p className="text-xs text-muted-foreground">{message.length} / 500 characters</p>
                <FieldError message={error} />
              </div>
              <DialogFooter>
                <Button onClick={submit} disabled={saving} data-testid="submit-interest">{saving ? 'Sending…' : 'Send interest'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        <Button asChild variant="ghost">
          <Link to={`/discover?neighborhood=${encodeURIComponent(call.neighborhood)}`}>See creators in {call.neighborhood}</Link>
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">Shoot {formatDate(call.shootDate)}</span>
      </div>
    </article>
  );
}

/** Loads the live open calls. Only mounted for creators, so nobody else calls the protected API. */
function LiveOpenCalls({ filters, onReset }: { filters: BoardFilters; onReset: () => void }) {
  const { user } = useApp();
  const list = useApi(() => api.get<{ projects: OpenCall[] }>('/api/opportunities').then((d) => d.projects), []);
  const matches = list.data
    ? filterBoardItems(list.data, filters, (call) => ({ neighborhood: call.neighborhood, needs: rolesNeeded(call.services), budgetCents: call.budgetCents }))
    : [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground" data-testid="open-calls-count">
          {list.data ? `${matches.length} live open call${matches.length === 1 ? '' : 's'}` : 'Loading open calls'}
        </h3>
        {user?.role === 'creator' && user.seekingClients === false ? <Badge variant="outline">Not taking new clients</Badge> : null}
      </div>
      {list.loading ? <LoadingBlock label="Loading open calls" /> : null}
      {list.error ? <ErrorAlert message={list.error} onRetry={list.reload} /> : null}
      {list.data && matches.length === 0 ? (
        <EmptyState
          testId="no-open-calls"
          title={list.data.length === 0 ? 'No live open calls right now' : 'No live open calls match these filters'}
          body="New briefs appear here as clients publish them."
          action={list.data.length > 0 && !isDefaultBoardFilters(filters) ? <Button variant="outline" onClick={onReset}>Reset filters</Button> : undefined}
        />
      ) : null}
      {matches.map((call) => (
        <OpenCallCard key={call.id} call={call} onSent={list.reload} />
      ))}
    </>
  );
}

/** Chooses what the live section shows for the current visitor. Nothing is requested unless the visitor is a creator. */
function LiveOpenCallsSection({ filters, onReset }: { filters: BoardFilters; onReset: () => void }) {
  const { user, ready } = useApp();
  if (!ready) return <LoadingBlock label="Checking your account" />;
  if (!user) {
    return (
      <EmptyState
        testId="live-calls-signed-out"
        title="Log in to see live open calls"
        body="Live briefs from clients are shared with signed-in creators. Log in to see them and express interest."
        action={(
          <div className="flex flex-wrap gap-3">
            <Button asChild><Link to="/login?next=%2Fopportunities">Log in</Link></Button>
            <Button asChild variant="outline"><Link to="/signup/creator?next=%2Fopportunities">Create a creator account</Link></Button>
          </div>
        )}
      />
    );
  }
  if (user.role !== 'creator') {
    return (
      <EmptyState
        testId="live-calls-customer"
        title="Live open calls are for creators"
        body="Customers post briefs from the project form. Creators express interest in open briefs here."
        action={<Button asChild><Link to="/projects/new">Post a creative project</Link></Button>}
      />
    );
  }
  return <LiveOpenCalls filters={filters} onReset={onReset} />;
}

export function Opportunities() {
  const [filters, setFilters] = useState<BoardFilters>(DEFAULT_BOARD_FILTERS);
  const demonstrations = useMemo(() => filterBoardItems(DEMONSTRATION_PROJECTS, filters, demonstrationListing), [filters]);
  const reset = () => setFilters(DEFAULT_BOARD_FILTERS);

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-5 md:px-8">
        <PageHeader
          eyebrow={`${SERVICE_AREA_NAME} only`}
          title="Find creative projects in Los Angeles"
          description="Sample briefs show the kinds of projects clients post here. Live open calls from real clients appear further down for signed-in creators."
        />
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-14 px-5 py-12 md:px-8">
        <BoardFilterBar value={filters} onChange={setFilters} />

        <div className="flex min-w-0 flex-col gap-16">
          <section aria-labelledby="demonstration-projects-title" className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <h2 id="demonstration-projects-title" className="text-2xl font-black uppercase tracking-tight" data-testid="demonstration-count">
                {demonstrations.length} demonstration project{demonstrations.length === 1 ? '' : 's'}
              </h2>
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Every card is a Demonstration Project: a sample brief that cannot be booked and takes no payment. Open a card for the full
                proposed brief. Usage, scope and payment are proposals to be agreed before any booking.
              </p>
            </div>
            {demonstrations.length === 0 ? (
              <EmptyState
                testId="no-demonstration-projects"
                title="No demonstration projects match these filters"
                body="Try another neighbourhood, role or budget band."
                action={<Button variant="outline" onClick={reset}>Reset filters</Button>}
              />
            ) : (
              <div className="grid gap-6 md:grid-cols-2" data-testid="demonstration-grid">
                {demonstrations.map((project) => (
                  <DemonstrationProjectCard key={project.slug} project={project} />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="live-open-calls-title" className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <h2 id="live-open-calls-title" className="text-2xl font-black uppercase tracking-tight">Live open calls</h2>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Real briefs from clients. Creators can express interest here, and the client decides who joins the team.
              </p>
            </div>
            <LiveOpenCallsSection filters={filters} onReset={reset} />
          </section>
        </div>
      </div>
    </>
  );
}
