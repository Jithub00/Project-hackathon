import { Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ReviewList } from '@/components/marketplace/ReviewList';
import { MessageButton } from '@/components/messages/MessageButton';
import { DemoBadge, ErrorAlert, InitialsAvatar, LoadingBlock } from '@/components/site/ui-bits';
import { BiographyEditor } from '@/components/marketplace/BiographyEditor';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useApi } from '@/lib/use-api';
import type { CustomerProfile as CustomerProfileData } from '../../shared/types';

export function CustomerProfile() {
  const { id = '' } = useParams();
  const { user } = useApp();
  const state = useApi(() => api.get<{ profile: CustomerProfileData }>(`/api/customers/${id}`).then((d) => d.profile), [id]);

  if (state.loading) return <LoadingBlock label="Loading profile" />;
  if (state.error || !state.data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-24 md:px-8">
        <ErrorAlert message={state.error ?? 'We could not find that customer.'} onRetry={state.reload} />
      </div>
    );
  }
  const p = state.data;
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-14 md:flex-row md:items-center md:px-8 md:py-20">
          <InitialsAvatar initials={p.user.initials} size="lg" />
          <div className="flex flex-col gap-3">
            <p className="eyebrow">{p.customerType === 'business' ? 'Business client' : 'Individual client'}</p>
            <h1 className="text-5xl font-black uppercase leading-[0.9] tracking-tight md:text-6xl">{p.businessName || p.user.name}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {p.neighborhood ? <span>Based in {p.neighborhood}, Los Angeles</span> : null}
              <span>{p.completedProjects} completed project{p.completedProjects === 1 ? '' : 's'}</span>
              {p.user.isDemo ? <DemoBadge /> : null}
            </div>
            {user?.id === p.user.id ? (
              <div><Button asChild variant="outline"><Link to="/account/profile">Edit business details</Link></Button></div>
            ) : null}
            <MessageButton participantId={p.user.id} participantName={p.user.name} />
          </div>
        </div>
      </section>
      <div className="mx-auto grid w-full max-w-7xl gap-14 px-5 py-14 md:px-8 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-14">
          <section aria-labelledby="customer-bio" className="flex flex-col gap-6">
            <h2 id="customer-bio" className="text-2xl font-black uppercase tracking-tight">Biography</h2>
            {p.user.bio ? <p className="max-w-3xl whitespace-pre-line text-lg leading-relaxed">{p.user.bio}</p> : <p className="text-muted-foreground">No biography yet.</p>}
          </section>
          <ReviewList title="Reviews from creators" reviews={p.reviews} emptyText="Creators leave reviews after a completed booking." />
        </div>
        <aside className="flex flex-col gap-6">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Content interests</h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {p.interests.length > 0 ? p.interests.map((i) => <li key={i}><Badge variant="outline" className="rounded-sm font-normal">{i}</Badge></li>) : <li className="text-sm text-muted-foreground">None listed.</li>}
            </ul>
          </div>
          <Button asChild size="lg"><Link to="/match">Build a creative team</Link></Button>
        </aside>
      </div>
    </>
  );
}

export { BiographyEditor };
