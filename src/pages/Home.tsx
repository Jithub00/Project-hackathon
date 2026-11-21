import { Link } from 'react-router';
import { ArrowRight, Camera, ClipboardList, FileCheck2, Handshake, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CameraSequence } from '@/components/home/CameraSequence';
import { CreatorCard } from '@/components/marketplace/CreatorCard';
import { DemoBadge, EmptyState, ErrorAlert, LoadingBlock, SectionTitle } from '@/components/site/ui-bits';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useApi } from '@/lib/use-api';
import { SERVICE_AREA_STATEMENT } from '../../shared/service-area';
import type { CreatorCard as CreatorCardData } from '../../shared/types';

interface FeaturedItem {
  id: string;
  kind: 'photo' | 'video';
  title: string;
  mediaUrl: string;
  posterUrl: string | null;
  projectLabel: string;
  creatorId: string;
  creatorName: string;
}

const PROCESS = [
  { icon: ClipboardList, title: 'Describe the project', body: 'Content type, services, Los Angeles location, budget, dates, style and deliverables.' },
  { icon: Users, title: 'Find your team', body: 'See matched creators, why they fit, and their packages. Build a photographer, videographer or both.' },
  { icon: Handshake, title: 'Agree on expectations', body: 'Everyone approves one brief: responsibilities, prices, shoot time, deliverables, revisions and usage.' },
  { icon: FileCheck2, title: 'Book securely', body: 'Pay the deposit through the payment provider. Balance is due after you confirm completion.' },
  { icon: Camera, title: 'Create and deliver', body: 'Shoot, upload files in the workspace, request included revisions, then review each other.' },
];

export function Home() {
  const { user } = useApp();
  const creators = useApi(
    () => api.get<{ creators: CreatorCardData[] }>('/api/creators?sort=rating').then((d) => d.creators.slice(0, 4)),
    [],
  );
  const featured = useApi(() => api.get<{ items: FeaturedItem[] }>('/api/featured').then((d) => d.items), []);
  const creatorCta = user?.role === 'creator' ? '/opportunities' : '/signup/creator';

  return (
    <>
      <section aria-labelledby="hero-title" className="relative isolate flex min-h-[calc(100dvh-7rem)] items-end overflow-hidden">
        <img
          src="/images/samples/hero-los-angeles.jpg"
          alt=""
          aria-hidden
          fetchPriority="high"
          className="absolute inset-0 -z-20 h-full w-full object-cover opacity-70"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black/40 via-black/65 to-black" />
        <div aria-hidden className="hairline absolute inset-x-0 top-[22%] mx-auto hidden max-w-7xl md:block" />

        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 pb-16 pt-28 md:px-8 md:pb-24">
          <p className="eyebrow">Los Angeles · Photographers, videographers and clients</p>
          <h1 id="hero-title" className="max-w-5xl text-[2.9rem] font-black uppercase leading-[0.92] tracking-tight sm:text-7xl lg:text-[6.5rem]">
            Assemble your <span className="text-brand-red-text">Los Angeles</span> creative team.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-white/85 md:text-xl">
            Photo Shoot connects clients with photographers and videographers across the City of Los Angeles. Compare portfolios,
            packages and availability, agree on one brief together, then book securely and create.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <Button asChild size="lg" className="h-12 w-full px-6 text-base sm:w-auto">
              <Link to="/discover">Find LA Photographers &amp; Videographers</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 w-full border-white/60 bg-black/30 px-6 text-base hover:bg-white hover:text-black sm:w-auto">
              <Link to="/opportunities">Join a Creative Project</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 w-full border-white/60 bg-black/30 px-6 text-base hover:bg-white hover:text-black sm:w-auto">
              <Link to="/projects/new">Post a Creative Project</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="h-12 w-full justify-start px-2 text-base text-white hover:text-brand-red-text sm:w-auto sm:justify-center">
              <Link to={creatorCta}>
                Find Clients in Los Angeles <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          <p className="max-w-2xl text-xs uppercase tracking-[0.14em] text-white/60">{SERVICE_AREA_STATEMENT}</p>
        </div>
      </section>

      <CameraSequence />

      <section aria-labelledby="creators-title" className="section-pad">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <SectionTitle
              eyebrow="Creator previews"
              title="Top-rated in Los Angeles"
              description="Specialties, packages, availability and reviews from completed bookings. Pick a creator to see the full portfolio, or match a whole team from your brief."
            />
            <Button asChild variant="outline" size="lg">
              <Link to="/discover">See all creators</Link>
            </Button>
          </div>
          <div className="mt-12">
            {creators.loading ? <LoadingBlock label="Loading creators" /> : null}
            {creators.error ? <ErrorAlert message={creators.error} onRetry={creators.reload} /> : null}
            {creators.data && creators.data.length === 0 ? (
              <EmptyState title="No creators are listed yet" body="New creators appear here once their profiles are complete." />
            ) : null}
            {creators.data && creators.data.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4" data-testid="home-creators">
                {creators.data.map((creator) => (
                  <CreatorCard key={creator.id} creator={creator} showFit={false} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section aria-labelledby="work-title" className="section-pad border-t border-border bg-black">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <SectionTitle
              eyebrow="Featured work"
              title="Portfolio frames from LA"
              description={<span className="flex flex-wrap items-center gap-3">Sample imagery from demonstration creators. <DemoBadge /></span>}
            />
            <Button asChild variant="ghost" className="text-muted-foreground hover:text-foreground">
              <Link to="/discover">Browse creators <ArrowRight aria-hidden /></Link>
            </Button>
          </div>
          <div className="mt-12">
            {featured.loading ? <LoadingBlock label="Loading work" /> : null}
            {featured.error ? <ErrorAlert message={featured.error} onRetry={featured.reload} /> : null}
            {featured.data ? (
              <ul className="grid auto-rows-[260px] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="featured-gallery">
                {featured.data.map((item, index) => (
                  <li
                    key={item.id}
                    className={index % 5 === 0 ? 'group relative overflow-hidden rounded-lg lg:row-span-2' : 'group relative overflow-hidden rounded-lg'}
                  >
                    <Link to={`/creators/${item.creatorId}`} className="block h-full focus-visible:outline-2">
                      <img
                        src={item.posterUrl ?? item.mediaUrl}
                        alt={item.title}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                      />
                      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black via-black/70 to-transparent p-5">
                        <span className="text-base font-bold">{item.title}</span>
                        <span className="text-xs uppercase tracking-[0.14em] text-white/75">{item.creatorName} · {item.projectLabel}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </section>

      <section aria-labelledby="process-title" className="section-pad border-t border-border" id="process">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <SectionTitle eyebrow="How it works" title="From idea to delivered work" description="Five steps keep everyone on the same page before money moves." />
          <ol className="mt-14 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2 xl:grid-cols-5" data-testid="process-steps">
            {PROCESS.map((step, index) => (
              <li key={step.title} className="flex flex-col gap-5 bg-black p-7">
                <span className="flex items-center justify-between">
                  <step.icon className="size-7 text-brand-red-text" aria-hidden />
                  <span className="text-sm font-bold tabular-nums text-muted-foreground">0{index + 1}</span>
                </span>
                <h3 className="text-xl font-black uppercase leading-tight tracking-tight">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="split-title" className="section-pad border-t border-border bg-black">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 md:grid-cols-2 md:px-8">
          <article className="flex flex-col gap-6 rounded-lg border border-border bg-card p-8 md:p-10">
            <Sparkles className="size-7 text-brand-red-text" aria-hidden />
            <h2 id="split-title" className="text-3xl font-black uppercase leading-none tracking-tight md:text-4xl">Build your LA creative team</h2>
            <p className="text-muted-foreground">
              Tell us the content you need. We match photographers and videographers who cover your neighbourhood, then show the combined price with fees before anything is committed.
            </p>
            <div>
              <Button asChild size="lg">
                <Link to="/match">Match Me With a Creative Team</Link>
              </Button>
            </div>
          </article>
          <article className="flex flex-col gap-6 rounded-lg border border-border bg-card p-8 md:p-10">
            <Camera className="size-7 text-brand-red-text" aria-hidden />
            <h2 className="text-3xl font-black uppercase leading-none tracking-tight md:text-4xl">Find creative projects in Los Angeles</h2>
            <p className="text-muted-foreground">
              Create a portfolio, set clear packages and mark the dates you are free. Express interest in open briefs from clients across the city.
            </p>
            <div>
              <Button asChild size="lg" variant="outline">
                <Link to={creatorCta}>{user?.role === 'creator' ? 'Open project board' : 'Join as a creator'}</Link>
              </Button>
            </div>
          </article>
        </div>
      </section>

      <section aria-labelledby="trust-title" className="section-pad border-t border-border">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 md:grid-cols-[1fr_1.2fr] md:px-8">
          <SectionTitle eyebrow="Trust" title="Only what we can stand behind" description="Photo Shoot makes claims only where the platform can check them." />
          <ul className="grid gap-6 sm:grid-cols-2">
            {[
              ['Reviews from completed bookings', 'Reviews are only possible after a project is completed. Each one names the booking it came from.'],
              ['Clear money terms', 'Fees, deposit, balance and payout schedule are shown before you pay. Payments go through a payment provider.'],
              ['Labelled demonstration content', 'Sample profiles, projects and reviews in this environment are labelled Demonstration.'],
              ['Written refund and cancellation terms', 'A 72-hour cancellation guarantee and a quality guarantee, with refund requests reviewed by Photo Shoot. Read the policy before you pay.'],
            ].map(([title, body]) => (
              <li key={title} className="flex flex-col gap-2 border-t border-border pt-5">
                <p className="font-bold">{title}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
