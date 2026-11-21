import { Link, useParams } from 'react-router';
import { MapPin, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageButton } from '@/components/messages/MessageButton';
import { AvailabilityCalendar } from '@/components/marketplace/AvailabilityCalendar';
import { PortfolioGrid } from '@/components/marketplace/PortfolioGrid';
import { ReviewList } from '@/components/marketplace/ReviewList';
import { DemoBadge, EmptyState, ErrorAlert, InitialsAvatar, LoadingBlock, RatingLine } from '@/components/site/ui-bits';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import { formatUsd } from '../../shared/money';
import { SERVICE_KIND_LABEL, WEEKDAY_OPTIONS } from '../../shared/constants';
import type { CreatorProfile as CreatorProfileData, CreatorPackage } from '../../shared/types';

const SERVICE_LABEL: Record<CreatorProfileData['services'], string> = {
  photography: 'Photographer',
  videography: 'Videographer',
  both: 'Photographer & videographer',
};

function PackageList({ packages }: { packages: CreatorPackage[] }) {
  if (packages.length === 0) {
    return <p className="text-sm text-muted-foreground">Packages have not been published yet.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border" data-testid="package-list">
      {packages.map((pkg) => (
        <li key={pkg.id} className="flex flex-col gap-2 py-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-bold">{pkg.name}</p>
            <p className="text-lg font-black tabular-nums">{formatUsd(pkg.priceCents)}</p>
          </div>
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {SERVICE_KIND_LABEL[pkg.service]} · {pkg.hours} hour{pkg.hours === 1 ? '' : 's'} on location
          </p>
          {pkg.deliverables ? <p className="text-sm text-muted-foreground">{pkg.deliverables}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function CreatorProfile() {
  const { id = '' } = useParams();
  const { user } = useApp();
  const state = useApi(() => api.get<{ profile: CreatorProfileData }>(`/api/creators/${id}`).then((d) => d.profile), [id]);

  if (state.loading) return <LoadingBlock label="Loading profile" />;
  if (state.error || !state.data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-24 md:px-8">
        <ErrorAlert message={state.error ?? 'We could not find that creator.'} onRetry={state.reload} />
        <Button asChild variant="outline" className="mt-6"><Link to="/discover">Back to creators</Link></Button>
      </div>
    );
  }

  const p = state.data;
  const isOwner = user?.id === p.user.id;
  const photos = p.portfolio.filter((item) => item.kind === 'photo');
  const videos = p.portfolio.filter((item) => item.kind === 'video');
  const buildHref = `/match?creator=${encodeURIComponent(p.user.id)}`;
  const buildCta = user?.role === 'customer' ? buildHref : `/signup/customer?next=${encodeURIComponent(buildHref)}`;
  const weekdayNames = WEEKDAY_OPTIONS.filter((d) => p.weekdays.includes(d.value)).map((d) => d.label).join(', ');

  return (
    <>
      <section aria-labelledby="creator-name" className="border-b border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-14 md:flex-row md:items-end md:justify-between md:px-8 md:py-20">
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <InitialsAvatar initials={p.user.initials} size="lg" />
            <div className="flex flex-col gap-3">
              <p className="eyebrow">{SERVICE_LABEL[p.services]}</p>
              <h1 id="creator-name" className="text-5xl font-black uppercase leading-[0.9] tracking-tight md:text-7xl">{p.user.name}</h1>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2"><MapPin className="size-4" aria-hidden />{p.coverageLabel}</span>
                <RatingLine average={p.rating.average} count={p.rating.count} />
                <span>{p.completedProjects} completed project{p.completedProjects === 1 ? '' : 's'}</span>
                {p.user.isDemo ? <DemoBadge /> : null}
                {!p.seekingClients ? <Badge variant="outline" className="border-border">Not taking new clients right now</Badge> : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <MessageButton participantId={p.user.id} participantName={p.user.name} />
            {isOwner ? (
              <Button asChild variant="outline">
                <Link to="/account/profile"><Pencil aria-hidden /> Edit profile</Link>
              </Button>
            ) : (
              <Button asChild size="lg" disabled={!p.seekingClients}>
                <Link to={buildCta} data-testid="build-project-cta">Build a project with {p.user.name.split(' ')[0]}</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-7xl gap-14 px-5 py-14 md:px-8 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 flex flex-col gap-14">
          <Tabs defaultValue="biography" className="gap-8" data-testid="profile-tabs">
            <TabsList className="group-data-horizontal/tabs:h-auto w-full flex-wrap justify-start gap-1 rounded-none border-b border-border bg-transparent p-0">
              <TabsTrigger value="biography" className="h-auto flex-none rounded-none border-0 border-b-2 border-transparent px-3 py-3 md:px-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground">
                Biography
              </TabsTrigger>
              <TabsTrigger value="photography" data-testid="tab-photography" className="h-auto flex-none rounded-none border-0 border-b-2 border-transparent px-3 py-3 md:px-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground">
                Photography <span className="ml-2 tabular-nums text-muted-foreground">{photos.length}</span>
              </TabsTrigger>
              <TabsTrigger value="videography" data-testid="tab-videography" className="h-auto flex-none rounded-none border-0 border-b-2 border-transparent px-3 py-3 md:px-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground">
                Videography <span className="ml-2 tabular-nums text-muted-foreground">{videos.length}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="biography" className="flex flex-col gap-8" data-testid="panel-biography">
              {p.user.bio ? (
                <p className="max-w-3xl whitespace-pre-line text-lg leading-relaxed">{p.user.bio}</p>
              ) : (
                <EmptyState title="No biography yet" body={`${p.user.name} has not written a biography yet.`} />
              )}
              <div className="grid gap-8 sm:grid-cols-2">
                <div className="flex flex-col gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Specialties</h2>
                  <ul className="flex flex-wrap gap-2">
                    {p.specialties.map((s) => <li key={s}><Badge variant="outline" className="rounded-sm border-white/25 font-normal">{s}</Badge></li>)}
                  </ul>
                </div>
                <div className="flex flex-col gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Styles</h2>
                  <ul className="flex flex-wrap gap-2">
                    {p.styles.map((s) => <li key={s}><Badge variant="outline" className="rounded-sm border-white/25 font-normal">{s}</Badge></li>)}
                  </ul>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {p.yearsExperience > 0 ? `${p.yearsExperience} years of experience. ` : ''}
                {p.typicalHours && weekdayNames ? `Usually available ${weekdayNames}, ${p.typicalHours.replace('-', ' to ')}.` : ''}
              </p>
            </TabsContent>

            <TabsContent value="photography" data-testid="panel-photography">
              <PortfolioGrid
                items={photos}
                kind="photo"
                emptyTitle="No photography uploaded yet"
                emptyBody={isOwner ? 'Upload your best photography in Profile and portfolio. Include a short note on your role in each project.' : `${p.user.name} has not added photography to this profile yet.`}
                emptyAction={isOwner ? <Button asChild variant="outline"><Link to="/account/profile">Add photography</Link></Button> : undefined}
              />
            </TabsContent>

            <TabsContent value="videography" data-testid="panel-videography">
              <PortfolioGrid
                items={videos}
                kind="video"
                emptyTitle="No videography uploaded yet"
                emptyBody={isOwner ? 'Upload a showreel or project film. Uploaded videos play here; sample films show a labelled preview frame.' : `${p.user.name} has not added video work to this profile yet.`}
                emptyAction={isOwner ? <Button asChild variant="outline"><Link to="/account/profile">Add video work</Link></Button> : undefined}
              />
            </TabsContent>
          </Tabs>

          <ReviewList reviews={p.reviews} title="Reviews" />
        </div>

        <aside className="flex flex-col gap-8" aria-label="Packages, coverage and availability">
          <section className="rounded-lg border border-border bg-card p-6" aria-labelledby="packages-title">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="packages-title" className="text-lg font-black uppercase tracking-tight">Packages</h2>
              {p.priceFromCents !== null ? <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">From {formatUsd(p.priceFromCents)}</p> : null}
            </div>
            <div className="mt-4"><PackageList packages={p.packages} /></div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Prices show the creator&apos;s package. A customer service fee and the deposit are shown before anyone commits. The platform&apos;s quality and delivery guarantee and 72-hour cancellation guarantee apply to every booking. <Link to="/policies/refund-and-cancellation" className="underline underline-offset-4">Read the policy</Link>.</p>
          </section>

          <section className="rounded-lg border border-border bg-card p-6" aria-labelledby="coverage-title">
            <h2 id="coverage-title" className="text-lg font-black uppercase tracking-tight">Los Angeles coverage</h2>
            <p className="mt-3 text-sm leading-relaxed">{p.coverageLabel}</p>
            <p className="mt-3 text-xs text-muted-foreground">Photo Shoot serves the City of Los Angeles only.</p>
          </section>

          <section className="flex flex-col gap-4" aria-labelledby="availability-title">
            <h2 id="availability-title" className="text-lg font-black uppercase tracking-tight">Availability</h2>
            <p className="text-sm text-muted-foreground" data-testid="next-available-profile">
              {p.nextAvailableDate ? `Next available: ${formatDate(p.nextAvailableDate)}` : 'Ask about dates when you send a brief.'}
            </p>
            <AvailabilityCalendar available={p.availableDates} booked={p.bookedDates} readOnly testId="public-calendar" />
          </section>
        </aside>
      </div>
    </>
  );
}
