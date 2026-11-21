import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CreatorCard } from '@/components/marketplace/CreatorCard';
import { NeighborhoodSelect } from '@/components/marketplace/NeighborhoodSelect';
import { EmptyState, ErrorAlert, FieldError, LoadingBlock, PageHeader, PriceBreakdown } from '@/components/site/ui-bits';
import { api, errorMessage } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useApi } from '@/lib/use-api';
import { addDays, todayString } from '@/lib/format';
import { formatUsd, formatUsdExact } from '../../shared/money';
import { quoteTeam, CUSTOMER_FEE_RATE, DEPOSIT_RATE } from '../../shared/pricing';
import { BUDGET_OPTIONS_DOLLARS, CONTENT_TYPES, STYLE_OPTIONS, USAGE_OPTIONS } from '../../shared/constants';
import { isLaNeighborhood, SERVICE_AREA_NAME } from '../../shared/service-area';
import type { CreatorCard as CreatorCardData, CreatorProfile, DiscoveryResponse, QuoteView, ServiceKind } from '../../shared/types';

const DRAFT_KEY = 'photo-shoot.match-draft.v1';
const STEPS = ['Your project', 'Services and style', 'Budget and dates', 'Deliverables', 'Matches and team'];
const VIDEO_LENGTHS = [15, 30, 60, 90, 120];

type Service = 'photography' | 'videography' | 'both';

interface Pick {
  creatorId: string;
  name: string;
  service: ServiceKind;
  packageId: string;
  packageName: string;
  priceCents: number;
}

interface Draft {
  step: number;
  title: string;
  contentType: string;
  description: string;
  neighborhood: string;
  locationDetail: string;
  services: Service | '';
  styles: string[];
  budgetDollars: number;
  preferredDate: string;
  deadline: string;
  photoCount: number;
  videoCount: number;
  videoLengthSeconds: number;
  includedRevisions: number;
  usageRights: string;
  otherDeliverables: string;
  picks: Pick[];
  openCall: boolean;
}

const EMPTY_DRAFT: Draft = {
  step: 1,
  title: '',
  contentType: '',
  description: '',
  neighborhood: '',
  locationDetail: '',
  services: '',
  styles: [],
  budgetDollars: 2500,
  preferredDate: '',
  deadline: '',
  photoCount: 40,
  videoCount: 1,
  videoLengthSeconds: 60,
  includedRevisions: 2,
  usageRights: 'social-web-12m',
  otherDeliverables: '',
  picks: [],
  openCall: false,
};

function loadDraft(): Draft {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    return { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<Draft>) };
  } catch {
    return EMPTY_DRAFT;
  }
}

type Errors = Partial<Record<keyof Draft | 'picks' | 'form', string>>;

function validate(step: number, d: Draft): Errors {
  const e: Errors = {};
  if (step === 1) {
    if (d.title.trim().length < 3) e.title = 'Give the project a short title (at least 3 characters).';
    if (!d.contentType) e.contentType = 'Choose the type of content.';
    if (!isLaNeighborhood(d.neighborhood)) e.neighborhood = `Choose a ${SERVICE_AREA_NAME} neighbourhood.`;
    if (d.locationDetail.length > 200) e.locationDetail = 'Keep location details under 200 characters.';
    if (d.description.length > 2000) e.description = 'Keep the description under 2,000 characters.';
  }
  if (step === 2) {
    if (!d.services) e.services = 'Choose photography, videography, or both.';
    if (d.styles.length > 4) e.styles = 'Choose up to 4 styles.';
  }
  if (step === 3) {
    if (!BUDGET_OPTIONS_DOLLARS.includes(d.budgetDollars as (typeof BUDGET_OPTIONS_DOLLARS)[number])) e.budgetDollars = 'Choose a total budget.';
    if (d.preferredDate && d.preferredDate < todayString()) e.preferredDate = 'Choose today or a later date.';
    if (d.deadline && d.preferredDate && d.deadline < d.preferredDate) e.deadline = 'The deadline should fall after the shoot date.';
  }
  if (step === 4) {
    if ((d.services === 'photography' || d.services === 'both') && (d.photoCount < 1 || d.photoCount > 500)) {
      e.photoCount = 'Enter between 1 and 500 photos.';
    }
    if ((d.services === 'videography' || d.services === 'both') && (d.videoCount < 1 || d.videoCount > 20)) {
      e.videoCount = 'Enter between 1 and 20 videos.';
    }
    if (d.includedRevisions < 0 || d.includedRevisions > 5) e.includedRevisions = 'Choose between 0 and 5 included revisions.';
  }
  return e;
}

function criteriaQuery(d: Draft): string {
  const q = new URLSearchParams();
  if (d.services) q.set('services', d.services);
  if (d.neighborhood) q.set('neighborhood', d.neighborhood);
  q.set('budget', String(d.budgetDollars));
  if (d.styles.length) q.set('styles', d.styles.join(','));
  if (d.preferredDate) q.set('date', d.preferredDate);
  return q.toString();
}

function toQuoteView(picks: Pick[]): QuoteView {
  if (picks.length === 0) {
    return { basis: 'none', subtotalCents: 0, customerFeeCents: 0, totalCents: 0, depositCents: 0, balanceCents: 0, creatorCommissionCents: 0, creatorPayoutCents: 0, lines: [] };
  }
  const quote = quoteTeam(picks.map((p) => ({ userId: p.creatorId, priceCents: p.priceCents })));
  return {
    basis: 'draft',
    subtotalCents: quote.subtotalCents,
    customerFeeCents: quote.customerFeeCents,
    totalCents: quote.totalCents,
    depositCents: quote.depositCents,
    balanceCents: quote.balanceCents,
    creatorCommissionCents: quote.creatorCommissionCents,
    creatorPayoutCents: quote.creatorPayoutCents,
    lines: picks.map((p) => {
      const split = quote.members.find((m) => m.userId === p.creatorId);
      return {
        userId: p.creatorId,
        name: p.name,
        roleLabel: p.service === 'photography' ? 'Photographer' : 'Videographer',
        packageName: p.packageName,
        priceCents: p.priceCents,
        payoutCents: split?.payoutCents ?? p.priceCents,
        commissionCents: split?.commissionCents ?? 0,
      };
    }),
  };
}

function Field({ id, label, error, children, hint }: { id: string; label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-sm font-semibold">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <FieldError message={error} id={`${id}-error`} />
    </div>
  );
}

function Stepper({ step, onGo }: { step: number; onGo: (n: number) => void }) {
  return (
    <nav aria-label="Build your team progress">
      <ol className="grid gap-3 md:grid-cols-5">
        {STEPS.map((label, index) => {
          const n = index + 1;
          const active = n === step;
          const done = n < step;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => onGo(n)}
                aria-current={active ? 'step' : undefined}
                data-testid={`step-${n}`}
                className={`flex w-full flex-col gap-2 rounded-md border px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
                  active ? 'border-primary bg-primary/10 text-foreground' : done ? 'border-white/40 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="tabular-nums">0{n}</span>
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function Match({ mode = 'team' }: { mode?: 'team' | 'post' } = {}) {
  const { user, config } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselectId = params.get('creator');
  const [draft, setDraft] = useState<Draft>(() => loadDraft());
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pkgChoice, setPkgChoice] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const goTo = (n: number) => {
    setErrors({});
    setSaveError(null);
    setDraft((prev) => ({ ...prev, step: n }));
  };

  const next = () => {
    const found = validate(draft.step, draft);
    setErrors(found);
    if (Object.keys(found).length === 0) goTo(Math.min(5, draft.step + 1));
  };

  const preselect = useApi(
    () => (preselectId ? api.get<{ profile: CreatorProfile }>(`/api/creators/${preselectId}`).then((d) => d.profile) : Promise.resolve(null)),
    [preselectId],
  );

  const query = criteriaQuery(draft);
  const matches = useApi(
    () => (draft.step === 5 ? api.get<DiscoveryResponse>(`/api/creators?${query}`) : Promise.resolve(null)),
    [draft.step, query],
  );

  // Pre-select a creator when arriving from a profile ("Build a project with ...").
  useEffect(() => {
    const profile = preselect.data;
    if (!profile || draft.step !== 5) return;
    if (draft.picks.some((p) => p.creatorId === profile.user.id)) return;
    const role: ServiceKind | null = profile.services === 'videography' ? 'videography' : profile.services === 'photography' ? 'photography' : draft.services === 'videography' ? 'videography' : 'photography';
    const pkg = profile.packages.filter((p) => p.service === role).sort((a, b) => a.priceCents - b.priceCents)[0];
    if (!pkg) return;
    setDraft((prev) => ({
      ...prev,
      picks: [...prev.picks.filter((p) => p.service !== role), { creatorId: profile.user.id, name: profile.user.name, service: role, packageId: pkg.id, packageName: pkg.name, priceCents: pkg.priceCents }],
    }));
    setNotice(`${profile.user.name} has been added to your team. Review the price before you save.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect.data, draft.step]);

  const quote = useMemo(() => toQuoteView(draft.picks), [draft.picks]);
  const budgetCents = draft.budgetDollars * 100;
  const overBudget = quote.totalCents > budgetCents && quote.basis !== 'none';

  const addPick = (creator: CreatorCardData, role: ServiceKind) => {
    const packageId = pkgChoice[creator.id] ?? creator.packages.filter((p) => p.service === role).sort((a, b) => a.priceCents - b.priceCents)[0]?.id;
    const pkg = creator.packages.find((p) => p.id === packageId);
    if (!pkg) return;
    setDraft((prev) => ({
      ...prev,
      picks: [
        ...prev.picks.filter((p) => p.service !== role && p.creatorId !== creator.id),
        { creatorId: creator.id, name: creator.name, service: role, packageId: pkg.id, packageName: pkg.name, priceCents: pkg.priceCents },
      ],
    }));
    setSaveError(null);
  };

  const removePick = (creatorId: string) => setDraft((prev) => ({ ...prev, picks: prev.picks.filter((p) => p.creatorId !== creatorId) }));

  const saveBrief = async () => {
    const found = {
      ...validate(1, draft),
      ...validate(2, draft),
      ...validate(3, draft),
      ...validate(4, draft),
    };
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setSaveError('Some answers need attention. Go back to the highlighted step to fix them.');
      return;
    }
    if (user?.role !== 'customer') {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        title: draft.title.trim(),
        contentType: draft.contentType,
        services: draft.services,
        budgetCents,
        neighborhood: draft.neighborhood,
        locationDetail: draft.locationDetail,
        styleTags: draft.styles,
        preferredDates: draft.preferredDate ? [draft.preferredDate] : [],
        description: draft.description,
        visibility: draft.openCall ? 'open' : 'invite',
        invites: draft.picks.map((p) => ({ creatorId: p.creatorId, packageId: p.packageId })),
        photoCount: draft.services === 'videography' ? 0 : draft.photoCount,
        videoCount: draft.services === 'photography' ? 0 : draft.videoCount,
        videoLengthSeconds: draft.videoLengthSeconds,
        includedRevisions: draft.includedRevisions,
        usageRights: draft.usageRights,
        deliveryDeadline: draft.deadline || undefined,
      };
      const data = await api.post<{ project: { id: string } }>('/api/projects', body);
      window.localStorage.removeItem(DRAFT_KEY);
      setDraft(EMPTY_DRAFT);
      navigate(`/projects/${data.project.id}`);
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const roleLists = useMemo(() => {
    const creators = matches.data?.creators ?? [];
    if (draft.services === 'both') {
      return [
        { role: 'photography' as ServiceKind, title: 'Photographers', creators: creators.filter((c) => c.services !== 'videography') },
        { role: 'videography' as ServiceKind, title: 'Videographers', creators: creators.filter((c) => c.services !== 'photography') },
      ];
    }
    if (draft.services === 'videography') return [{ role: 'videography' as ServiceKind, title: 'Videographers', creators }];
    return [{ role: 'photography' as ServiceKind, title: 'Photographers', creators }];
  }, [matches.data, draft.services]);

  const excludedReasons = matches.data
    ? Object.entries(matches.data.excluded)
        .filter(([, n]) => n > 0)
        .map(([key, n]) => {
          const labels: Record<string, string> = {
            service: `${n} do not offer the service you need`,
            location: `${n} do not cover ${draft.neighborhood}`,
            budget: `${n} have no package within your budget`,
            availability: `${n} are not free on your preferred date`,
            notSeeking: `${n} are not taking new clients right now`,
            rating: `${n} are below your rating threshold`,
            style: `${n} do not work in the visual styles you chose`,
          };
          return labels[key];
        })
    : [];

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-5 md:px-8">
        <PageHeader
          eyebrow={mode === 'post' ? 'Post a creative project' : 'Guided matching'}
          title={mode === 'post' ? 'Describe your project' : 'Build your Los Angeles creative team'}
          description={
            mode === 'post'
              ? 'Describe the work, the creative roles you need, your budget, the location and the dates. Invite creators directly, or post an open call on the project board. Nothing is booked until every person approves the brief.'
              : `Answer five short steps. We match creators who cover your neighbourhood, show why they fit, and total the price with fees before anything is committed. ${SERVICE_AREA_NAME} only.`
          }
        />
      </div>

      <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-12 md:px-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-10">
          <Stepper step={draft.step} onGo={(n) => (n <= draft.step || validate(draft.step, draft) && Object.keys(validate(draft.step, draft)).length === 0 ? goTo(n) : setErrors(validate(draft.step, draft)))} />

          {notice ? (
            <p role="status" className="flex items-center gap-3 rounded-md border border-white/30 bg-surface-raised p-4 text-sm">
              <CheckCircle2 className="size-5 shrink-0" aria-hidden /> {notice}
            </p>
          ) : null}

          {draft.step === 1 ? (
            <section className="flex flex-col gap-7" aria-labelledby="step-1-title">
              <h2 id="step-1-title" className="text-2xl font-black uppercase tracking-tight">1. Describe the project</h2>
              <Field id="title" label="Project title" error={errors.title}>
                <Input id="title" value={draft.title} onChange={(e) => update('title', e.target.value)} placeholder="Spring lookbook for a Downtown label" aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? 'title-error' : undefined} className="bg-card" data-testid="project-title" />
              </Field>
              <Field id="content-type" label="Type of content" error={errors.contentType}>
                <Select value={draft.contentType} onValueChange={(v) => update('contentType', v)}>
                  <SelectTrigger id="content-type" className="w-full bg-card" aria-invalid={Boolean(errors.contentType)} data-testid="content-type"><SelectValue placeholder="Choose a type of content" /></SelectTrigger>
                  <SelectContent>{CONTENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <NeighborhoodSelect id="neighborhood" label="Shoot neighbourhood in Los Angeles" value={draft.neighborhood} onValueChange={(v) => update('neighborhood', v)} error={errors.neighborhood} hint={`${SERVICE_AREA_NAME} neighbourhoods only. Creators are matched to this location.`} />
              <Field id="location-detail" label="Location details (optional)" error={errors.locationDetail}>
                <Input id="location-detail" value={draft.locationDetail} onChange={(e) => update('locationDetail', e.target.value)} placeholder="Street, landmark or studio name" className="bg-card" />
              </Field>
              <Field id="description" label="What do you need? (optional)" error={errors.description}>
                <Textarea id="description" rows={5} value={draft.description} onChange={(e) => update('description', e.target.value)} placeholder="Goals, audience, tone, and anything the creators should know." className="bg-card" />
              </Field>
            </section>
          ) : null}

          {draft.step === 2 ? (
            <section className="flex flex-col gap-7" aria-labelledby="step-2-title">
              <h2 id="step-2-title" className="text-2xl font-black uppercase tracking-tight">2. Services and style</h2>
              <Field id="services" label="What do you need?" error={errors.services}>
                <RadioGroup value={draft.services} onValueChange={(v) => update('services', v as Service)} className="grid gap-3 md:grid-cols-3" aria-invalid={Boolean(errors.services)}>
                  {[
                    { value: 'photography', label: 'Photography', hint: 'Stills for web, print or social' },
                    { value: 'videography', label: 'Videography', hint: 'Films, reels and cut-downs' },
                    { value: 'both', label: 'Both', hint: 'A photographer and a videographer as one team' },
                  ].map((opt) => (
                    <Label key={opt.value} htmlFor={`svc-${opt.value}`} className="flex cursor-pointer flex-col gap-2 rounded-lg border border-border bg-card p-5 has-[[data-state=checked]]:border-primary">
                      <span className="flex items-center gap-3">
                        <RadioGroupItem value={opt.value} id={`svc-${opt.value}`} data-testid={`service-${opt.value}`} />
                        <span className="font-bold">{opt.label}</span>
                      </span>
                      <span className="text-sm font-normal text-muted-foreground">{opt.hint}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </Field>
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-2 text-sm font-semibold">Visual style (up to 4)</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {STYLE_OPTIONS.map((style) => (
                    <label key={style} className="flex cursor-pointer items-center gap-3 text-sm">
                      <Checkbox
                        checked={draft.styles.includes(style)}
                        onCheckedChange={(checked) => {
                          const next = checked === true ? [...draft.styles, style] : draft.styles.filter((s) => s !== style);
                          if (next.length <= 4) update('styles', next);
                        }}
                        aria-label={style}
                      />
                      {style}
                    </label>
                  ))}
                </div>
                <FieldError message={errors.styles} />
              </fieldset>
            </section>
          ) : null}

          {draft.step === 3 ? (
            <section className="flex flex-col gap-7" aria-labelledby="step-3-title">
              <h2 id="step-3-title" className="text-2xl font-black uppercase tracking-tight">3. Budget and dates</h2>
              <Field id="budget" label="Total budget (creator packages, before fees)" error={errors.budgetDollars} hint="The customer service fee and deposit are shown before you commit.">
                <Select value={String(draft.budgetDollars)} onValueChange={(v) => update('budgetDollars', Number(v))}>
                  <SelectTrigger id="budget" className="w-full bg-card md:max-w-sm" data-testid="budget-select"><SelectValue /></SelectTrigger>
                  <SelectContent>{BUDGET_OPTIONS_DOLLARS.map((d) => <SelectItem key={d} value={String(d)}>Up to {formatUsd(d * 100)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <div className="grid gap-6 md:grid-cols-2">
                <Field id="preferred-date" label="Preferred shoot date (optional)" error={errors.preferredDate}>
                  <Input id="preferred-date" type="date" min={todayString()} value={draft.preferredDate} onChange={(e) => update('preferredDate', e.target.value)} className="bg-card" data-testid="preferred-date" />
                </Field>
                <Field id="deadline" label="Final files needed by (optional)" error={errors.deadline}>
                  <Input id="deadline" type="date" min={draft.preferredDate || addDays(todayString(), 1)} value={draft.deadline} onChange={(e) => update('deadline', e.target.value)} className="bg-card" data-testid="deadline" />
                </Field>
              </div>
            </section>
          ) : null}

          {draft.step === 4 ? (
            <section className="flex flex-col gap-7" aria-labelledby="step-4-title">
              <h2 id="step-4-title" className="text-2xl font-black uppercase tracking-tight">4. Deliverables</h2>
              <div className="grid gap-6 md:grid-cols-2">
                {draft.services !== 'videography' ? (
                  <Field id="photo-count" label="Number of final photos" error={errors.photoCount}>
                    <Input id="photo-count" type="number" min={1} max={500} value={draft.photoCount} onChange={(e) => update('photoCount', Number(e.target.value))} className="bg-card" data-testid="photo-count" />
                  </Field>
                ) : null}
                {draft.services !== 'photography' ? (
                  <>
                    <Field id="video-count" label="Number of videos" error={errors.videoCount}>
                      <Input id="video-count" type="number" min={1} max={20} value={draft.videoCount} onChange={(e) => update('videoCount', Number(e.target.value))} className="bg-card" data-testid="video-count" />
                    </Field>
                    <Field id="video-length" label="Length of each video">
                      <Select value={String(draft.videoLengthSeconds)} onValueChange={(v) => update('videoLengthSeconds', Number(v))}>
                        <SelectTrigger id="video-length" className="w-full bg-card" data-testid="video-length"><SelectValue /></SelectTrigger>
                        <SelectContent>{VIDEO_LENGTHS.map((s) => <SelectItem key={s} value={String(s)}>{s} seconds</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                  </>
                ) : null}
                <Field id="revisions" label="Included revisions" error={errors.includedRevisions} hint="Revisions beyond this number need a change to the brief.">
                  <Select value={String(draft.includedRevisions)} onValueChange={(v) => update('includedRevisions', Number(v))}>
                    <SelectTrigger id="revisions" className="w-full bg-card" data-testid="revisions"><SelectValue /></SelectTrigger>
                    <SelectContent>{[0, 1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} revision{n === 1 ? '' : 's'}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              <Field id="usage" label="How will the client use the files?">
                <RadioGroup value={draft.usageRights} onValueChange={(v) => update('usageRights', v)} className="grid gap-3">
                  {USAGE_OPTIONS.map((o) => (
                    <Label key={o.value} htmlFor={`usage-${o.value}`} className="flex cursor-pointer flex-col gap-1 rounded-md border border-border bg-card p-4 has-[[data-state=checked]]:border-primary">
                      <span className="flex items-center gap-3"><RadioGroupItem value={o.value} id={`usage-${o.value}`} /> <span className="font-semibold">{o.label}</span></span>
                      <span className="text-sm font-normal text-muted-foreground">{o.description}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </Field>
              <Field id="other" label="Other deliverables (optional)">
                <Input id="other" value={draft.otherDeliverables} onChange={(e) => update('otherDeliverables', e.target.value)} placeholder="Captions, thumbnails, raw files" className="bg-card" />
              </Field>
            </section>
          ) : null}

          {draft.step === 5 ? (
            <section className="flex flex-col gap-8" aria-labelledby="step-5-title" data-testid="matches-step">
              <div className="flex flex-col gap-3">
                <h2 id="step-5-title" className="text-2xl font-black uppercase tracking-tight">5. Matches and team</h2>
                <p className="text-sm text-muted-foreground">
                  {draft.services === 'both' ? 'Choose one photographer and one videographer. Each role is filled by a different creator.' : 'Choose the creator you want to invite. Each choice shows the package price before you commit.'}
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline" className="rounded-sm">{draft.services === 'both' ? 'Photography and video' : draft.services === 'videography' ? 'Videography' : 'Photography'}</Badge>
                  <Badge variant="outline" className="rounded-sm">{draft.neighborhood}</Badge>
                  <Badge variant="outline" className="rounded-sm">Budget up to {formatUsd(budgetCents)}</Badge>
                  {draft.preferredDate ? <Badge variant="outline" className="rounded-sm">Shoot {draft.preferredDate}</Badge> : null}
                </div>
              </div>

              {matches.loading ? <LoadingBlock label="Matching creators" /> : null}
              {matches.error ? <ErrorAlert message={matches.error} onRetry={matches.reload} /> : null}

              {roleLists.map((list) => (
                <div key={list.role} className="flex flex-col gap-5" data-testid={`matches-${list.role}`}>
                  <h3 className="text-lg font-black uppercase tracking-tight">{list.title} <span className="text-muted-foreground">({list.creators.length})</span></h3>
                  {list.creators.length === 0 && !matches.loading ? (
                    <EmptyState
                      testId={`no-${list.role}-matches`}
                      title={`No ${list.title.toLowerCase()} match this brief yet`}
                      body={
                        <div className="flex flex-col gap-3">
                          {excludedReasons.length > 0 ? <ul className="list-disc space-y-1 pl-5">{excludedReasons.map((r) => <li key={r}>{r}</li>)}</ul> : <p>No creator covers {draft.neighborhood} for these services yet.</p>}
                          <p>You can raise the budget, choose another neighbourhood, or remove the preferred date.</p>
                        </div>
                      }
                      action={<Button variant="outline" onClick={() => goTo(3)}>Adjust my requirements</Button>}
                    />
                  ) : null}
                  <ul className="grid gap-6 md:grid-cols-2">
                    {list.creators.map((creator) => {
                      const pkgs = creator.packages.filter((p) => p.service === list.role).sort((a, b) => a.priceCents - b.priceCents);
                      const chosen = draft.picks.find((p) => p.creatorId === creator.id && p.service === list.role);
                      const selectedPkg = pkgChoice[creator.id] ?? pkgs[0]?.id ?? '';
                      return (
                        <li key={`${list.role}-${creator.id}`} className="flex">
                          <CreatorCard
                            creator={creator}
                            className="w-full"
                            actions={
                              <div className="flex w-full flex-col gap-3">
                                {pkgs.length > 0 ? (
                                  <Select value={selectedPkg} onValueChange={(v) => setPkgChoice((prev) => ({ ...prev, [creator.id]: v }))}>
                                    <SelectTrigger className="w-full bg-card" aria-label={`Package for ${creator.name}`} data-testid="package-select"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {pkgs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {formatUsd(p.priceCents)} · {p.hours}h</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <p className="text-sm text-muted-foreground">No {list.role === 'photography' ? 'photography' : 'video'} package published.</p>
                                )}
                                <div className="flex flex-wrap gap-3">
                                  {chosen ? (
                                    <Button variant="outline" onClick={() => removePick(creator.id)} data-testid="remove-from-team"><X aria-hidden /> Remove from team</Button>
                                  ) : (
                                    <Button onClick={() => addPick(creator, list.role)} disabled={pkgs.length === 0} data-testid="add-to-team">Add to team</Button>
                                  )}
                                  <Button asChild variant="ghost"><Link to={`/creators/${creator.id}`}>View profile</Link></Button>
                                </div>
                              </div>
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              {preselect.data && !draft.picks.some((p) => p.creatorId === preselect.data!.user.id) && matches.data && !matches.data.creators.some((c) => c.id === preselect.data!.user.id) ? (
                <p className="text-sm text-muted-foreground">{preselect.data.user.name} does not match every filter in this brief. Adjust the requirements to see them in the results.</p>
              ) : null}
            </section>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-8">
            {draft.step > 1 ? (
              <Button variant="outline" onClick={() => goTo(draft.step - 1)} data-testid="back-step"><ArrowLeft aria-hidden /> Back</Button>
            ) : <span />}
            {draft.step < 5 ? (
              <Button onClick={next} data-testid="next-step">Continue <ArrowRight aria-hidden /></Button>
            ) : null}
          </div>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start" aria-label="Your team and price" data-testid="team-panel">
          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-black uppercase tracking-tight">Your team</h2>
            {draft.picks.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No creators added yet. Add creators on step 5, or publish the brief as an open call.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3 text-sm" data-testid="team-members">
                {draft.picks.map((p) => (
                  <li key={p.creatorId} className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block font-semibold">{p.name}</span>
                      <span className="block text-muted-foreground">{p.service === 'photography' ? 'Photographer' : 'Videographer'} · {p.packageName}</span>
                    </span>
                    <span className="flex items-center gap-3 tabular-nums">
                      {formatUsdExact(p.priceCents)}
                      <button type="button" onClick={() => removePick(p.creatorId)} aria-label={`Remove ${p.name}`} className="text-muted-foreground hover:text-foreground"><X className="size-4" aria-hidden /></button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <PriceBreakdown quote={quote} title="Price with fees" />

          {overBudget ? (
            <p role="alert" data-testid="over-budget" className="rounded-md border border-primary/60 bg-primary/10 p-4 text-sm">
              This team totals {formatUsdExact(quote.totalCents)} including fees, above your {formatUsd(budgetCents)} budget. Remove a creator, choose a lower package, or raise the budget.
              <Button variant="link" className="px-1" onClick={() => goTo(3)}>Adjust budget</Button>
            </p>
          ) : null}

          <p className="text-xs leading-relaxed text-muted-foreground">
            A {Math.round(CUSTOMER_FEE_RATE * 100)}% service fee applies to the team total. A {Math.round(DEPOSIT_RATE * 100)}% deposit books the shoot and the balance is due after you confirm completion.
          </p>

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <Checkbox checked={draft.openCall} onCheckedChange={(c) => update('openCall', c === true)} data-testid="open-call-toggle" />
            <span>Also publish this brief as an open call for Los Angeles creators</span>
          </label>

          {draft.step === 5 ? (
            user?.role === 'customer' ? (
              <Button size="lg" onClick={saveBrief} disabled={saving} data-testid="save-brief">
                {saving ? 'Saving…' : draft.picks.length > 0 ? 'Save brief and invite team' : 'Save brief'}
              </Button>
            ) : user?.role === 'creator' ? (
              <p className="text-sm text-muted-foreground">Creator accounts cannot post briefs. Create a customer account to save this project.</p>
            ) : (
              <div className="flex flex-col gap-3 rounded-md border border-border p-4" data-testid="signin-to-save">
                <p className="text-sm">Create a free customer account to save this brief. Your answers stay on this device until you do.</p>
                <Button asChild><Link to={`/signup/customer?next=${encodeURIComponent('/match')}`}>Create customer account</Link></Button>
                <Button asChild variant="outline"><Link to={`/login?next=${encodeURIComponent('/match')}`}>Log in</Link></Button>
              </div>
            )
          ) : null}
          <FieldError message={saveError} />
          {config?.paymentMode === 'demo' ? <p className="text-xs text-muted-foreground">Demonstration environment: no payment is taken at this step.</p> : null}
        </aside>
      </div>
    </>
  );
}
