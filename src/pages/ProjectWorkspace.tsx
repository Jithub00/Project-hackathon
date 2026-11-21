import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { CheckCircle2, Circle, FileDown, Send, Undo2, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { CreatorCard } from '@/components/marketplace/CreatorCard';
import { ReviewList } from '@/components/marketplace/ReviewList';
import { DemoBadge, EmptyState, ErrorAlert, FieldError, InitialsAvatar, LoadingBlock, PriceBreakdown, StatusBadge, Eyebrow } from '@/components/site/ui-bits';
import { api, errorMessage, uploadFile } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useApi } from '@/lib/use-api';
import { formatDate, formatDateTime, formatBytes } from '@/lib/format';
import { formatUsd, formatUsdExact } from '../../shared/money';
import { RefundPanel } from '@/components/refunds/RefundPanel';
import { InvitationResponse } from '@/components/refunds/InvitationResponse';
import { SERVICE_KIND_LABEL, USAGE_LABEL, USAGE_OPTIONS } from '../../shared/constants';
import { SERVICE_AREA_NAME } from '../../shared/service-area';
import { STATUS_META } from '../../shared/status';
import type { BriefContent, BriefVersion, CreatorCard as CreatorCardData, DiscoveryResponse, ProjectDetail, ProjectMember } from '../../shared/types';

type TabKey = 'overview' | 'agreement' | 'team' | 'messages' | 'delivery' | 'payments' | 'reviews';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'agreement', label: 'Agreement' },
  { key: 'team', label: 'Team' },
  { key: 'messages', label: 'Messages' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'payments', label: 'Payments' },
  { key: 'reviews', label: 'Reviews' },
];

const DATE_LONG: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' };

function ActionButton({ busy, onClick, children, variant = 'default', testId }: { busy: boolean; onClick: () => void; children: ReactNode; variant?: 'default' | 'outline' | 'ghost'; testId?: string }) {
  return (
    <Button variant={variant} onClick={onClick} disabled={busy} data-testid={testId}>
      {children}
    </Button>
  );
}

function BriefSummary({ brief, title }: { brief: BriefContent; title: string }) {
  const videoText = brief.video.count > 0 ? `${brief.video.count} video${brief.video.count === 1 ? '' : 's'} of ${brief.video.lengthSeconds} seconds` : 'No video';
  return (
    <section aria-label={title} className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 md:p-8" data-testid="brief-summary">
      <h3 className="text-xl font-black uppercase tracking-tight">{brief.title}</h3>
      <dl className="grid gap-x-8 gap-y-5 text-sm md:grid-cols-2">
        <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Goals</dt><dd className="mt-1 leading-relaxed">{brief.goals}</dd></div>
        <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Creative direction</dt><dd className="mt-1 leading-relaxed">{brief.creativeDirection || 'To be agreed with the team.'}</dd></div>
        <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Shoot</dt><dd className="mt-1">{formatDate(brief.shootDate, DATE_LONG)} at {brief.shootStartTime}, about {brief.durationHours} hours</dd></div>
        <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Location</dt><dd className="mt-1">{brief.neighborhood}, {SERVICE_AREA_NAME}{brief.locationDetail ? ` · ${brief.locationDetail}` : ''}</dd></div>
        <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Deliverables</dt><dd className="mt-1">{brief.photoCount} final photo{brief.photoCount === 1 ? '' : 's'}; {videoText}{brief.otherDeliverables ? `; ${brief.otherDeliverables}` : ''}</dd></div>
        <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Editing</dt><dd className="mt-1 leading-relaxed">{brief.editingRequirements || 'Standard edit as described by each creator.'}</dd></div>
        <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Included revisions</dt><dd className="mt-1">{brief.includedRevisions}</dd></div>
        <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Delivery deadline</dt><dd className="mt-1">{formatDate(brief.deliveryDeadline, DATE_LONG)}</dd></div>
        <div className="md:col-span-2"><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Usage rights</dt><dd className="mt-1">{USAGE_LABEL[brief.usageRights]}</dd></div>
      </dl>
      <div className="border-t border-border pt-6">
        <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Responsibilities and prices</h4>
        <ul className="mt-4 flex flex-col gap-5">
          {brief.members.map((m) => (
            <li key={m.userId} className="grid gap-2 md:grid-cols-[1fr_auto]">
              <div>
                <p className="font-semibold">{m.creatorName} · {m.roleLabel}</p>
                <p className="text-sm text-muted-foreground">{m.packageName}, {m.hours} hours. {m.responsibilities}</p>
              </div>
              <p className="font-bold tabular-nums">{formatUsdExact(m.priceCents)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ApprovalPanel({ version, canApprove, onApprove, busy }: { version: BriefVersion; canApprove: boolean; onApprove: () => void; busy: boolean }) {
  return (
    <section aria-labelledby="approvals-title" className="flex flex-col gap-5 rounded-lg border border-white/35 bg-surface-raised p-6" data-testid="approvals">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 id="approvals-title" className="text-lg font-black uppercase tracking-tight">Approvals</h3>
        {canApprove ? <ActionButton busy={busy} onClick={onApprove} testId="approve-brief">Approve brief</ActionButton> : null}
      </div>
      <ul className="flex flex-col gap-3" aria-label="Who needs to approve">
        {version.approvers.map((a) => (
          <li key={a.userId} className="flex items-center gap-3 text-sm" data-testid="approver">
            {a.approved ? <CheckCircle2 className="size-5" aria-label="Approved" /> : <Circle className="size-5 text-muted-foreground" aria-label="Waiting" />}
            <span className="font-semibold">{a.name}</span>
            <span className="text-muted-foreground">{a.approved ? 'approved' : 'waiting for approval'}</span>
          </li>
        ))}
      </ul>
      {version.changeSummary.length > 0 ? (
        <div>
          <p className="text-sm font-semibold">What changed</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground" data-testid="change-summary">
            {version.changeSummary.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

interface BriefFormValues {
  title: string;
  goals: string;
  creativeDirection: string;
  shootDate: string;
  shootStartTime: string;
  durationHours: number;
  neighborhood: string;
  locationDetail: string;
  photoCount: number;
  videoCount: number;
  videoLengthSeconds: number;
  otherDeliverables: string;
  editingRequirements: string;
  includedRevisions: number;
  deliveryDeadline: string;
  usageRights: string;
  members: Array<{ userId: string; name: string; service: 'photography' | 'videography'; packageId: string; responsibilities: string }>;
}

function briefToForm(brief: BriefContent): BriefFormValues {
  return {
    title: brief.title,
    goals: brief.goals,
    creativeDirection: brief.creativeDirection,
    shootDate: brief.shootDate,
    shootStartTime: brief.shootStartTime,
    durationHours: brief.durationHours,
    neighborhood: brief.neighborhood,
    locationDetail: brief.locationDetail,
    photoCount: brief.photoCount,
    videoCount: brief.video.count,
    videoLengthSeconds: brief.video.lengthSeconds,
    otherDeliverables: brief.otherDeliverables,
    editingRequirements: brief.editingRequirements,
    includedRevisions: brief.includedRevisions,
    deliveryDeadline: brief.deliveryDeadline,
    usageRights: brief.usageRights,
    members: brief.members.map((m) => ({ userId: m.userId, name: m.creatorName, service: m.service, packageId: m.packageId, responsibilities: m.responsibilities })),
  };
}

/** Customer-only editor for the draft brief (also used to propose changes after agreement). */
function BriefEditor({ projectId, draft, onSaved, sendLabel, canSend, busy, setBusy, setError }: {
  projectId: string;
  draft: BriefContent;
  onSaved: () => void;
  sendLabel: string;
  canSend: boolean;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
}) {
  const [values, setValues] = useState<BriefFormValues>(() => briefToForm(draft));
  const [packages, setPackages] = useState<Record<string, Array<{ id: string; service: string; name: string; priceCents: number; hours: number }>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all(values.members.map((m) => api.get<{ profile: { packages: Array<{ id: string; service: string; name: string; priceCents: number; hours: number }> } }>(`/api/creators/${m.userId}`).then((d) => [m.userId, d.profile.packages] as const).catch(() => [m.userId, []] as const)))
      .then((pairs) => {
        if (active) setPackages(Object.fromEntries(pairs));
      });
    return () => {
      active = false;
    };
    // The member list is stable while the editor is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof BriefFormValues>(key: K, value: BriefFormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));

  const payload = () => ({
    title: values.title,
    goals: values.goals,
    creativeDirection: values.creativeDirection,
    shootDate: values.shootDate,
    shootStartTime: values.shootStartTime,
    durationHours: Number(values.durationHours),
    neighborhood: values.neighborhood,
    locationDetail: values.locationDetail,
    photoCount: Number(values.photoCount),
    video: { count: Number(values.videoCount), lengthSeconds: Number(values.videoLengthSeconds) },
    otherDeliverables: values.otherDeliverables,
    editingRequirements: values.editingRequirements,
    includedRevisions: Number(values.includedRevisions),
    deliveryDeadline: values.deliveryDeadline,
    usageRights: values.usageRights,
    members: values.members.map((m) => ({ userId: m.userId, packageId: m.packageId, responsibilities: m.responsibilities })),
  });

  const save = async (andSend: boolean) => {
    const next: Record<string, string> = {};
    if (values.title.trim().length < 3) next.title = 'Give the project a title (at least 3 characters).';
    if (values.goals.trim().length < 10) next.goals = 'Describe the goals (at least 10 characters).';
    if (!values.shootDate) next.shootDate = 'Choose the shoot date.';
    if (!values.deliveryDeadline) next.deliveryDeadline = 'Choose the delivery deadline.';
    if (!/^\d{2}:\d{2}$/.test(values.shootStartTime)) next.shootStartTime = 'Use a 24-hour time such as 09:30.';
    if (values.photoCount === 0 && values.videoCount === 0 && !values.otherDeliverables) next.photoCount = 'Include at least one photo quantity, video, or other deliverable.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.put(`/api/projects/${projectId}/draft`, payload());
      if (andSend) {
        await api.post(`/api/projects/${projectId}/send`);
        setSaved('Sent for approval. Everyone on the team now needs to approve the same brief.');
      } else {
        setSaved('Draft saved.');
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const field = (id: keyof BriefFormValues | string, label: string, input: ReactNode) => (
    <div className="flex flex-col gap-2" key={id}>
      <Label htmlFor={`brief-${id}`}>{label}</Label>
      {input}
      <FieldError message={errors[id]} />
    </div>
  );

  return (
    <form
      className="flex flex-col gap-8"
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save(false);
      }}
      data-testid="brief-editor"
      aria-label="Edit the brief"
    >
      <div className="grid gap-6 md:grid-cols-2">
        {field('title', 'Project title', <Input id="brief-title" value={values.title} onChange={(e) => set('title', e.target.value)} className="bg-background" />)}
        {field('shootDate', 'Shoot date', <Input id="brief-shootDate" type="date" value={values.shootDate} onChange={(e) => set('shootDate', e.target.value)} className="bg-background" />)}
        {field('shootStartTime', 'Start time', <Input id="brief-shootStartTime" type="time" value={values.shootStartTime} onChange={(e) => set('shootStartTime', e.target.value)} className="bg-background" />)}
        {field('durationHours', 'Hours on location', <Input id="brief-durationHours" type="number" min={1} max={24} value={values.durationHours} onChange={(e) => set('durationHours', Number(e.target.value))} className="bg-background" />)}
        {field('deliveryDeadline', 'Delivery deadline', <Input id="brief-deliveryDeadline" type="date" value={values.deliveryDeadline} onChange={(e) => set('deliveryDeadline', e.target.value)} className="bg-background" />)}
        {field('includedRevisions', 'Included revisions', <Input id="brief-includedRevisions" type="number" min={0} max={5} value={values.includedRevisions} onChange={(e) => set('includedRevisions', Number(e.target.value))} className="bg-background" />)}
        {field('photoCount', 'Final photos', <Input id="brief-photoCount" type="number" min={0} max={500} value={values.photoCount} onChange={(e) => set('photoCount', Number(e.target.value))} className="bg-background" />)}
        {field('videoCount', 'Number of videos', <Input id="brief-videoCount" type="number" min={0} max={20} value={values.videoCount} onChange={(e) => set('videoCount', Number(e.target.value))} className="bg-background" />)}
        {field('videoLengthSeconds', 'Video length (seconds)', <Input id="brief-videoLengthSeconds" type="number" min={0} max={900} value={values.videoLengthSeconds} onChange={(e) => set('videoLengthSeconds', Number(e.target.value))} className="bg-background" />)}
        {field('usageRights', 'Usage rights', (
          <Select value={values.usageRights} onValueChange={(v) => set('usageRights', v)}>
            <SelectTrigger id="brief-usageRights" className="w-full bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>{USAGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        ))}
        {field('locationDetail', 'Location details', <Input id="brief-locationDetail" value={values.locationDetail} onChange={(e) => set('locationDetail', e.target.value)} className="bg-background" />)}
      </div>
      {field('goals', 'Goals', <Textarea id="brief-goals" rows={3} value={values.goals} onChange={(e) => set('goals', e.target.value)} className="bg-background" />)}
      {field('creativeDirection', 'Creative direction', <Textarea id="brief-creativeDirection" rows={3} value={values.creativeDirection} onChange={(e) => set('creativeDirection', e.target.value)} className="bg-background" />)}
      {field('editingRequirements', 'Editing requirements', <Textarea id="brief-editingRequirements" rows={3} value={values.editingRequirements} onChange={(e) => set('editingRequirements', e.target.value)} className="bg-background" />)}
      <div className="flex flex-col gap-5">
        <h4 className="text-sm font-semibold uppercase tracking-[0.12em]">Team responsibilities and packages</h4>
        {values.members.map((m, index) => {
          const options = (packages[m.userId] ?? []).filter((p) => p.service === m.service);
          return (
            <div key={m.userId} className="grid gap-4 rounded-md border border-border bg-background p-5 md:grid-cols-[220px_1fr]" data-testid="brief-member">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`brief-member-pkg-${index}`}>{m.name} · {SERVICE_KIND_LABEL[m.service]}</Label>
                <Select value={m.packageId} onValueChange={(v) => setValues((prev) => ({ ...prev, members: prev.members.map((x, i) => (i === index ? { ...x, packageId: v } : x)) }))}>
                  <SelectTrigger id={`brief-member-pkg-${index}`} className="w-full bg-card" data-testid="brief-member-package"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {options.length === 0 ? <SelectItem value={m.packageId}>Current package</SelectItem> : null}
                    {options.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {formatUsd(p.priceCents)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`brief-member-resp-${index}`}>Responsibilities</Label>
                <Textarea id={`brief-member-resp-${index}`} rows={2} value={m.responsibilities} onChange={(e) => setValues((prev) => ({ ...prev, members: prev.members.map((x, i) => (i === index ? { ...x, responsibilities: e.target.value } : x)) }))} className="bg-card" />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={busy} data-testid="save-draft">Save draft</Button>
        {canSend ? <Button type="button" onClick={() => save(true)} disabled={busy} data-testid="send-agreement"><Send aria-hidden /> {sendLabel}</Button> : null}
        {saved ? <p role="status" className="text-sm font-semibold">{saved}</p> : null}
      </div>
    </form>
  );
}

function InvitePanel({ project, onChanged, setError }: { project: ProjectDetail; onChanged: () => void; setError: (e: string | null) => void }) {
  const [services, setServices] = useState<string>(project.services === 'both' ? 'any' : project.services);
  const query = new URLSearchParams({ neighborhood: project.neighborhood });
  if (project.services !== 'both') query.set('services', project.services);
  const candidates = useApi(() => api.get<DiscoveryResponse>(`/api/creators?${query.toString()}`), [project.id]);
  const memberIds = new Set(project.members.map((m) => m.userId));
  const [pkg, setPkg] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const invite = async (creator: CreatorCardData) => {
    const role = services === 'any' ? (creator.services === 'videography' ? 'videography' : 'photography') : services;
    const options = creator.packages.filter((p) => p.service === role).sort((a, b) => a.priceCents - b.priceCents);
    const packageId = pkg[creator.id] ?? options[0]?.id;
    if (!packageId) {
      setError(`${creator.name} has no ${role} package published.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/projects/${project.id}/members`, { creatorId: creator.id, packageId });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const open = (candidates.data?.creators ?? []).filter((c) => !memberIds.has(c.id));
  return (
    <section aria-labelledby="invite-title" className="flex flex-col gap-6" data-testid="invite-panel">
      <div className="flex flex-col gap-2">
        <h3 id="invite-title" className="text-xl font-black uppercase tracking-tight">Invite creators</h3>
        <p className="max-w-2xl text-sm text-muted-foreground">Creators who cover {project.neighborhood} and match this project. Each invitation shows the price before the creator accepts.</p>
      </div>
      {project.services === 'both' ? (
        <div className="flex max-w-xs flex-col gap-2">
          <Label htmlFor="invite-role">Show creators for</Label>
          <Select value={services} onValueChange={setServices}>
            <SelectTrigger id="invite-role" className="w-full bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Either role</SelectItem>
              <SelectItem value="photography">Photography</SelectItem>
              <SelectItem value="videography">Videography</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {candidates.loading ? <LoadingBlock label="Finding creators" /> : null}
      {candidates.data && open.length === 0 ? <EmptyState testId="no-invite-candidates" title="No more creators match this project" body="Adjust the budget or neighbourhood in the brief, or publish the brief as an open call so creators can express interest." /> : null}
      <ul className="grid gap-6 md:grid-cols-2">
        {open.map((creator) => {
          const role = services === 'any' ? (creator.services === 'videography' ? 'videography' : 'photography') : services;
          const options = creator.packages.filter((p) => p.service === role).sort((a, b) => a.priceCents - b.priceCents);
          const current = pkg[creator.id] ?? options[0]?.id ?? '';
          return (
            <li key={creator.id} className="flex">
              <CreatorCard
                creator={creator}
                className="w-full"
                actions={
                  <div className="flex w-full flex-col gap-3">
                    {options.length > 0 ? (
                      <Select value={current} onValueChange={(v) => setPkg((prev) => ({ ...prev, [creator.id]: v }))}>
                        <SelectTrigger className="w-full bg-card" aria-label={`Package for ${creator.name}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{options.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {formatUsd(p.priceCents)}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : <p className="text-sm text-muted-foreground">No {role} package published.</p>}
                    <Button onClick={() => invite(creator)} disabled={busy || options.length === 0} data-testid="invite-button"><UserPlus aria-hidden /> Invite to team</Button>
                  </div>
                }
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ProjectStatusCard({ project }: { project: ProjectDetail }) {
  const brief = project.accepted?.content ?? project.draft?.content;
  return (
    <section aria-label="Key details" className="grid gap-5 rounded-lg border border-border bg-card p-6 md:grid-cols-4">
      <div><p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Shoot</p><p className="mt-1 font-semibold">{project.shootDate ? formatDate(project.shootDate, DATE_LONG) : 'Not set yet'}</p></div>
      <div><p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Delivery deadline</p><p className="mt-1 font-semibold">{project.deliveryDeadline ? formatDate(project.deliveryDeadline) : 'Not set yet'}</p></div>
      <div><p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Location</p><p className="mt-1 font-semibold">{project.neighborhood}</p></div>
      <div><p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Team total</p><p className="mt-1 font-semibold tabular-nums">{brief ? formatUsdExact(project.quote.totalCents) : 'Add creators to see the price'}</p></div>
    </section>
  );
}

function MemberRow({ member, role }: { member: ProjectMember; role: string }) {
  return (
    <li className="flex items-center gap-4 py-4" data-testid="member-row">
      <InitialsAvatar initials={member.initials} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{member.name}{member.isDemo ? <span className="ml-2 align-middle"><DemoBadge /></span> : null}</p>
        <p className="text-sm text-muted-foreground">{role}</p>
        {member.message ? <p className="mt-1 text-sm">&ldquo;{member.message}&rdquo;</p> : null}
      </div>
      <Badge variant="outline" className="rounded-sm text-[11px] uppercase tracking-[0.12em]" data-testid="member-status">
        {member.status === 'interested' ? 'Interested' : member.status === 'invited' ? 'Invited' : member.status === 'accepted' ? 'Accepted' : 'Declined'}
      </Badge>
    </li>
  );
}

export function ProjectWorkspace() {
  const { id = '' } = useParams();
  const { user } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const state = useApi(() => api.get<{ project: ProjectDetail }>(`/api/projects/${id}`).then((d) => d.project), [id]);
  const [tab, setTab] = useState<TabKey>('overview');
  const [flash, setFlash] = useState<string | null>((location.state as { flash?: string } | null)?.flash ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if ((location.state as { flash?: string } | null)?.flash) navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await fn();
      if (success) setFlash(success);
      state.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;
  if (!state.data && state.loading) return <LoadingBlock label="Opening project" />;
  if (!state.data) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-20 md:px-8">
        <ErrorAlert message={state.error ?? 'This project could not be opened.'} onRetry={state.reload} />
        <Button asChild variant="outline" className="mt-6"><Link to="/dashboard">Back to dashboard</Link></Button>
      </div>
    );
  }

  const p = state.data;
  const perm = p.permissions;
  const next = p.nextStep;
  const roleLabel = (m: ProjectMember) => {
    const memberBrief = (p.accepted ?? p.draft)?.content.members.find((x) => x.userId === m.userId);
    return memberBrief ? `${memberBrief.roleLabel} · ${memberBrief.packageName}` : 'Creator';
  };
  const myReviewed = p.reviewTargets.length > 0 && p.reviewTargets.every((t) => t.alreadyReviewed);

  const primaryAction = (() => {
    switch (next.action) {
      case 'accept':
        return (
          <div className="flex flex-wrap gap-3">
            <InvitationResponse
              busy={busy}
              onAccept={(versions) => run(() => api.post(`/api/projects/${id}/respond`, { action: 'accept', ...versions }), 'Invitation accepted.')}
              onDecline={() => run(() => api.post(`/api/projects/${id}/respond`, { action: 'decline' }), 'Invitation declined.')}
            />
          </div>
        );
      case 'send_agreement':
        return <ActionButton busy={busy} testId="send-agreement-cta" onClick={() => setTab('agreement')}>Review and send the agreement</ActionButton>;
      case 'approve':
        return <ActionButton busy={busy} testId="approve-cta" onClick={() => p.pending && run(() => api.post(`/api/projects/${id}/versions/${p.pending!.id}/approve`), 'Thanks. Your approval is recorded.')}>Approve brief</ActionButton>;
      case 'pay_deposit':
        return <Button asChild data-testid="pay-deposit-cta"><Link to={`/projects/${id}/checkout?kind=deposit`}>Pay the deposit</Link></Button>;
      case 'pay_balance':
        return <Button asChild data-testid="pay-balance-cta"><Link to={`/projects/${id}/checkout?kind=balance`}>Pay the balance</Link></Button>;
      case 'upload':
        return <ActionButton busy={busy} onClick={() => setTab('delivery')} testId="upload-cta">Upload the files</ActionButton>;
      case 'confirm_completion':
        return (
          <div className="flex flex-wrap gap-3">
            <ActionButton busy={busy} testId="confirm-completion" onClick={() => run(() => api.post(`/api/projects/${id}/complete`), 'Completion confirmed. The balance is now due.')}>Confirm completion</ActionButton>
            <Button variant="outline" onClick={() => setTab('delivery')} data-testid="request-revision-cta">Request a revision</Button>
          </div>
        );
      case 'review':
        return <ActionButton busy={busy} onClick={() => setTab('reviews')} testId="review-cta">Leave your review</ActionButton>;
      case 'invite':
        return <ActionButton busy={busy} onClick={() => setTab('team')} testId="invite-cta">Invite creators</ActionButton>;
      default:
        return null;
    }
  })();

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-10 md:px-8 md:py-14">
      <header className="flex flex-col gap-5 border-b border-border pb-8">
        <div className="flex flex-wrap items-center gap-4">
          <Eyebrow>{perm.viewerIsCustomer ? 'Your project' : 'Project with ' + p.customer.name}</Eyebrow>
          <StatusBadge status={p.status} />
          {p.visibility === 'open' ? <Badge variant="outline" className="rounded-sm">Open call</Badge> : null}
        </div>
        <h1 className="text-4xl font-black uppercase leading-[0.95] tracking-tight md:text-6xl" data-testid="project-title">{p.title}</h1>
        <p className="max-w-3xl text-muted-foreground" data-testid="project-status-description">{STATUS_META[p.status].description}</p>
      </header>

      {flash ? <p role="status" className="mt-6 rounded-md border border-white/30 bg-surface-raised p-4 text-sm font-semibold" data-testid="flash">{flash}</p> : null}
      {error ? <div className="mt-6"><ErrorAlert message={error} /></div> : null}

      <section aria-labelledby="next-step-title" className="mt-8 flex flex-col gap-5 rounded-lg border border-primary bg-primary/10 p-6 md:flex-row md:items-center md:justify-between" data-testid="next-step">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-red-text">Next step</p>
          <h2 id="next-step-title" className="text-2xl font-black uppercase tracking-tight">{next.title}</h2>
          <p className="max-w-3xl text-sm leading-relaxed">{next.body}</p>
        </div>
        {primaryAction}
      </section>

      {p.permissions.viewerRole === null ? (
        <p className="mt-6 text-sm text-muted-foreground">You are viewing this project as a visitor. Only the customer and team members can see the full workspace.</p>
      ) : null}

      <div className="mt-8">
        <ProjectStatusCard project={p} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="mt-10 gap-10" data-testid="workspace-tabs">
        <TabsList className="flex group-data-horizontal/tabs:h-auto w-full flex-wrap justify-start gap-2 rounded-none border-b border-border bg-transparent p-0 pb-2">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} data-testid={`tab-${t.key}`} className="h-auto rounded-sm border border-border px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-primary/10">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="grid gap-10 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-4">
              <h2 className="text-2xl font-black uppercase tracking-tight">Project summary</h2>
              <p className="whitespace-pre-line leading-relaxed">{p.description || 'No description yet.'}</p>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Type</dt><dd className="mt-1">{p.contentType}</dd></div>
                <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Services</dt><dd className="mt-1">{p.services === 'both' ? 'Photography and video' : p.services === 'photography' ? 'Photography' : 'Videography'}</dd></div>
                <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Budget</dt><dd className="mt-1">Up to {formatUsd(p.budgetCents)}</dd></div>
                <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Styles</dt><dd className="mt-1">{p.styleTags.join(', ') || 'Open'}</dd></div>
              </dl>
            </section>
            <section className="flex flex-col gap-2">
              <h2 className="text-2xl font-black uppercase tracking-tight">Team</h2>
              <ul className="divide-y divide-border">
                {p.members.filter((m) => m.status !== 'declined').map((m) => <MemberRow key={m.userId} member={m} role={roleLabel(m)} />)}
              </ul>
              {p.members.filter((m) => m.status !== 'declined').length === 0 ? <p className="text-sm text-muted-foreground">No creators on this team yet.</p> : null}
            </section>
          </div>
          <aside className="flex flex-col gap-6" aria-label="Activity">
            <h2 className="text-lg font-black uppercase tracking-tight">Activity</h2>
            <ol className="flex flex-col gap-4 border-l border-border pl-5" data-testid="events">
              {p.events.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span className="absolute -left-[26px] top-1.5 size-2 rounded-full bg-primary" aria-hidden />
                  <p>{e.message}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</p>
                </li>
              ))}
            </ol>
          </aside>
        </TabsContent>

        <TabsContent value="agreement" className="flex flex-col gap-10">
          {p.pending ? (
            <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
              <div className="flex flex-col gap-6">
                <h2 className="text-2xl font-black uppercase tracking-tight">Brief awaiting approval</h2>
                <BriefSummary brief={p.pending.content} title="Brief awaiting approval" />
              </div>
              <div className="flex flex-col gap-6">
                <ApprovalPanel version={p.pending} canApprove={perm.canApprove} busy={busy} onApprove={() => run(() => api.post(`/api/projects/${id}/versions/${p.pending!.id}/approve`), 'Approval recorded.')} />
                {perm.viewerIsCustomer ? (
                  <Button variant="outline" onClick={() => run(() => api.post(`/api/projects/${id}/versions/${p.pending!.id}/withdraw`), 'Agreement withdrawn so you can edit it.')} disabled={busy} data-testid="withdraw">
                    <Undo2 aria-hidden /> Withdraw to edit
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {p.accepted ? (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <h2 className="text-2xl font-black uppercase tracking-tight">Agreed brief · version {p.accepted.versionNo}</h2>
                <p className="text-xs text-muted-foreground">Agreed {p.accepted.acceptedAt ? formatDate(p.accepted.acceptedAt) : ''}</p>
              </div>
              <BriefSummary brief={p.accepted.content} title="Agreed brief" />
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><FileDown className="size-4" aria-hidden /> Changes after agreement need approval from everyone affected. Propose them below.</p>
            </div>
          ) : null}

          {perm.canEditDraft && p.draft && (!p.pending) ? (
            <div className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 md:p-8" data-testid="draft-section">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tight">{p.accepted ? 'Propose a change' : 'Edit the brief'}</h2>
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                  {p.accepted ? 'Your changes take effect only after every affected person approves them. Until then the agreed brief still applies.' : 'Write the brief once. Everyone on the team approves the same version before deposits are paid.'}
                </p>
              </div>
              {p.draft.changeSummary.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-sm" data-testid="draft-changes">
                  {p.draft.changeSummary.map((c) => <li key={c}>{c}</li>)}
                </ul>
              ) : null}
              <BriefEditor
                projectId={id}
                draft={p.draft.content}
                onSaved={() => state.reload()}
                sendLabel={p.accepted ? 'Send change for approval' : 'Send agreement for approval'}
                canSend={perm.canSendAgreement}
                busy={busy}
                setBusy={setBusy}
                setError={setError}
              />
            </div>
          ) : null}

          {!p.accepted && !p.pending && !perm.canEditDraft ? (
            <EmptyState testId="no-brief" title="No brief yet" body={perm.viewerIsCustomer ? 'Invite creators, then write the brief once the team accepts.' : 'The customer will share the brief once the team is set.'} />
          ) : null}
          {!perm.viewerIsCustomer && p.draft && !p.accepted && !p.pending ? (
            <p className="text-sm text-muted-foreground">The customer is still writing the brief. You will be asked to approve it once it is sent.</p>
          ) : null}
        </TabsContent>

        <TabsContent value="team" className="grid gap-10 lg:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-10">
            <section className="flex flex-col gap-2">
              <h2 className="text-2xl font-black uppercase tracking-tight">Team and status</h2>
              <ul className="divide-y divide-border border-y border-border" data-testid="team-list">
                {p.members.length === 0 ? <li className="py-6 text-sm text-muted-foreground">No creators yet.</li> : null}
                {p.members.map((m) => (
                  <li key={m.userId} className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between" data-testid="team-row">
                    <MemberRow member={m} role={roleLabel(m)} />
                    {perm.canInvite && m.status !== 'accepted' ? (
                      <Button variant="ghost" size="sm" onClick={() => run(() => api.delete(`/api/projects/${id}/members/${m.userId}`), `${m.name} removed from the team.`)} disabled={busy}>Remove</Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
            {perm.canInvite ? <InvitePanel project={p} onChanged={() => run(async () => undefined, 'Invitation sent.')} setError={setError} /> : null}
          </div>
          <aside className="flex flex-col gap-6">
            <PriceBreakdown quote={p.quote} perspective={perm.viewerIsCustomer ? 'customer' : 'creator'} title="Team price" />
            {perm.viewerIsMember ? <p className="text-xs text-muted-foreground">Creators see the platform commission and their payout here. Customers see the service fee and deposit.</p> : null}
          </aside>
        </TabsContent>

        <TabsContent value="messages" className="grid gap-10 lg:grid-cols-[1fr_360px]">
          {perm.canMessage ? (
            <>
              <MessageThread projectId={id} messages={p.messages} onPosted={() => state.reload()} setError={setError} />
              <aside className="flex flex-col gap-4 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">Keep decisions in the brief</p>
                <p>Use messages to discuss details. Anything that changes scope, price, responsibilities or deadlines must become a change to the brief so everyone can approve it.</p>
              </aside>
            </>
          ) : (
            <EmptyState testId="messages-locked" title="Messages are for the customer and team members" body="Accept an invitation to join the discussion. Creators who decline or have not responded can't post here." />
          )}
        </TabsContent>

        <TabsContent value="delivery" className="flex flex-col gap-10">
          <section className="flex flex-col gap-6" aria-labelledby="deliveries-title">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 id="deliveries-title" className="text-2xl font-black uppercase tracking-tight">Delivered files</h2>
              <p className="text-sm text-muted-foreground" data-testid="revisions-used">Included revisions used: {p.revisionsUsed} of {p.revisionsIncluded}</p>
            </div>
            {p.deliveries.length === 0 ? (
              <EmptyState testId="no-deliveries" title="No files delivered yet" body={perm.viewerIsMember ? 'Upload finished files here when the shoot is complete. The customer downloads them from this page.' : 'The creators upload finished files here. You will be able to review them then.'} />
            ) : (
              <ul className="divide-y divide-border border-y border-border" data-testid="delivery-list">
                {p.deliveries.map((d) => (
                  <li key={d.id} className="flex flex-col gap-2 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <a href={d.fileUrl} download className="font-semibold underline underline-offset-4 hover:text-brand-red-text">{d.fileName}</a>
                      <p className="text-sm text-muted-foreground">Round {d.round} · {d.kind} · {formatBytes(d.sizeBytes)}{d.note ? ` · ${d.note}` : ''}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDateTime(d.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {perm.canDeliver ? <DeliveryUpload projectId={id} onDone={() => state.reload()} setError={setError} /> : null}

          {perm.canRequestRevision || perm.canConfirmCompletion ? (
            <RevisionPanel projectId={id} canRequest={perm.canRequestRevision} canConfirm={perm.canConfirmCompletion} onDone={() => state.reload()} setError={setError} />
          ) : null}

          {p.revisions.length > 0 ? (
            <section className="flex flex-col gap-4">
              <h3 className="text-lg font-black uppercase tracking-tight">Revision requests</h3>
              <ul className="flex flex-col gap-3 text-sm">
                {p.revisions.map((r, i) => (
                  <li key={r.id} className="rounded-md border border-border bg-card p-4">
                    <p className="font-semibold">Revision {i + 1} · {r.status === 'open' ? 'open' : 'completed'}</p>
                    <p className="mt-1 text-muted-foreground">{r.notes}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </TabsContent>

        <TabsContent value="payments" className="grid gap-10 lg:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-10">
            <section className="flex flex-col gap-4" aria-labelledby="payments-title">
              <div className="flex flex-wrap items-center gap-3">
                <h2 id="payments-title" className="text-2xl font-black uppercase tracking-tight">Payments</h2>
                {p.payments.some((x) => x.provider === 'demo') ? <DemoBadge /> : null}
              </div>
              {p.payments.length === 0 ? (
                <EmptyState testId="no-payments" title="No payments yet" body="The deposit is due once everyone has approved the brief. Nothing is charged before then." />
              ) : (
                <ul className="divide-y divide-border border-y border-border" data-testid="payment-list">
                  {p.payments.map((pay) => (
                    <li key={pay.id} className="flex items-center justify-between gap-4 py-4 text-sm" data-testid="payment-row" data-status={pay.status}>
                      <span>
                        <span className="font-semibold capitalize">{pay.kind}</span>
                        <span className="text-muted-foreground"> · {pay.provider === 'demo' ? 'Demonstration (no money moves)' : 'Payment provider'}</span>
                      </span>
                      <span className="flex items-center gap-4 tabular-nums">
                        <span className="capitalize text-muted-foreground">{pay.status.replace('_', ' ')}</span>
                        <span className="font-semibold">{formatUsdExact(pay.amountCents)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-3">
                {perm.canPayDeposit ? <Button asChild data-testid="deposit-link"><Link to={`/projects/${id}/checkout?kind=deposit`}>Pay deposit · {formatUsdExact(p.quote.depositCents)}</Link></Button> : null}
                {perm.canPayBalance ? <Button asChild data-testid="balance-link"><Link to={`/projects/${id}/checkout?kind=balance`}>Pay balance · {formatUsdExact(p.quote.balanceCents)}</Link></Button> : null}
              </div>
            </section>

            {p.payouts.length > 0 ? (
              <section className="flex flex-col gap-3" aria-labelledby="payouts-title">
                <h3 id="payouts-title" className="text-lg font-black uppercase tracking-tight">Creator payouts</h3>
                <ul className="divide-y divide-border border-y border-border text-sm" data-testid="payout-list">
                  {p.payouts.map((po) => (
                    <li key={po.creatorName} className="flex items-center justify-between py-3">
                      <span>{po.creatorName} · <span className="text-muted-foreground">{po.status === 'scheduled' ? `Scheduled for ${formatDate(po.scheduledFor)}` : po.status}</span></span>
                      <span className="tabular-nums font-semibold">{formatUsdExact(po.amountCents)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">Payouts are scheduled after the balance clears. {p.payouts.some((x) => x.status === 'held') ? 'Payouts are held while a dispute or refund request is open.' : ''}</p>
              </section>
            ) : null}
          </div>

          <aside className="flex flex-col gap-6">
            <PriceBreakdown quote={p.quote} perspective={perm.viewerIsCustomer ? 'customer' : 'creator'} title={perm.viewerIsCustomer ? 'What you pay' : 'What you earn'} />
            <RefundPanel
              project={p}
              viewerIsCustomer={perm.viewerIsCustomer}
              canCancel={perm.canCancel}
              onChanged={(m) => { setFlash(m); state.reload(); }}
              setError={setError}
            />
            {perm.canDispute ? <DisputePanel projectId={id} onDone={(m) => { setFlash(m); state.reload(); }} setError={setError} /> : null}
            {p.disputeReason ? <p className="rounded-md border border-primary/60 bg-primary/10 p-4 text-sm">Dispute open: {p.disputeReason}</p> : null}
          </aside>
        </TabsContent>

        <TabsContent value="reviews" className="flex flex-col gap-10">
          {['completed', 'closed'].includes(p.status) && p.reviewTargets.length > 0 && !myReviewed ? (
            <ReviewForms projectId={id} targets={p.reviewTargets.filter((t) => !t.alreadyReviewed)} onDone={() => state.reload()} setError={setError} />
          ) : null}
          {['completed', 'closed'].includes(p.status) && myReviewed ? <p className="text-sm font-semibold">Thanks. Your reviews are published on the profiles involved.</p> : null}
          {!['completed', 'closed'].includes(p.status) ? (
            <EmptyState testId="reviews-locked" title="Reviews open after completion" body="Once the customer confirms completion and the balance is paid, both sides can review the project. Reviews appear on profiles only after that." />
          ) : null}
          <ReviewList reviews={p.reviews} title="Project reviews" emptyText="No reviews have been posted for this project yet." />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MessageThread({ projectId, messages, onPosted, setError }: { projectId: string; messages: ProjectDetail['messages']; onPosted: () => void; setError: (e: string | null) => void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!body.trim()) {
      setFormError('Write a message first.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/projects/${projectId}/messages`, { body });
      setBody('');
      onPosted();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="flex flex-col gap-6" aria-labelledby="thread-title">
      <h2 id="thread-title" className="text-2xl font-black uppercase tracking-tight">Discussion</h2>
      {messages.length === 0 ? <EmptyState testId="no-messages" title="No messages yet" body="Start the conversation. Ask about locations, access, timing or kit." /> : null}
      <ol className="flex flex-col gap-4" data-testid="message-list">
        {messages.map((m) => (
          <li key={m.id} className="rounded-md border border-border bg-card p-4" data-testid="message">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{m.authorName} · {formatDateTime(m.createdAt)}</p>
            <p className="mt-2 whitespace-pre-line leading-relaxed">{m.body}</p>
          </li>
        ))}
      </ol>
      <form onSubmit={send} className="flex flex-col gap-3" noValidate>
        <Label htmlFor="message-body">Message</Label>
        <Textarea id="message-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} className="bg-card" data-testid="message-input" />
        <FieldError message={formError} />
        <div><Button type="submit" disabled={busy} data-testid="send-message">{busy ? 'Sending…' : 'Send message'}</Button></div>
      </form>
    </section>
  );
}

function DeliveryUpload({ projectId, onDone, setError }: { projectId: string; onDone: () => void; setError: (e: string | null) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const upload = async () => {
    if (!file) {
      setError('Choose a file to deliver.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const uploaded = await uploadFile(file);
      await api.post(`/api/projects/${projectId}/deliveries`, { fileName: uploaded.fileName, fileUrl: uploaded.url, kind: uploaded.kind, sizeBytes: uploaded.sizeBytes, note });
      setFile(null);
      setNote('');
      setMessage('Delivered. The customer has been notified in the workspace.');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="grid gap-6 rounded-lg border border-border bg-card p-6 md:grid-cols-2" aria-labelledby="upload-files-title" data-testid="delivery-upload">
      <h3 id="upload-files-title" className="text-lg font-black uppercase tracking-tight md:col-span-2">Upload finished files</h3>
      <div className="flex flex-col gap-2">
        <Label htmlFor="delivery-file">File (image or video)</Label>
        <Input id="delivery-file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="bg-background file:mr-3 file:rounded-sm file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground" data-testid="delivery-file" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="delivery-note">Note for the client (optional)</Label>
        <Input id="delivery-note" value={note} onChange={(e) => setNote(e.target.value)} className="bg-background" />
      </div>
      <div className="flex flex-wrap items-center gap-4 md:col-span-2">
        <Button onClick={upload} disabled={busy} data-testid="deliver-files">{busy ? 'Uploading…' : 'Deliver files'}</Button>
        {message ? <p role="status" className="text-sm font-semibold">{message}</p> : null}
      </div>
    </section>
  );
}

function RevisionPanel({ projectId, canRequest, canConfirm, onDone, setError }: { projectId: string; canRequest: boolean; canConfirm: boolean; onDone: () => void; setError: (e: string | null) => void }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const request = async () => {
    setFormError(null);
    if (notes.trim().length < 10) {
      setFormError('Describe the revision (at least 10 characters).');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/projects/${projectId}/revisions`, { notes });
      setNotes('');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    setBusy(true);
    try {
      await api.post(`/api/projects/${projectId}/complete`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="grid gap-6 rounded-lg border border-border bg-card p-6 md:grid-cols-2" aria-labelledby="review-files-title">
      <h3 id="review-files-title" className="text-lg font-black uppercase tracking-tight md:col-span-2">Review the files</h3>
      {canRequest ? (
        <div className="flex flex-col gap-3">
          <Label htmlFor="revision-notes">Request an included revision</Label>
          <Textarea id="revision-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Which images or cuts, and what should change?" className="bg-background" data-testid="revision-notes" />
          <FieldError message={formError} />
          <div><Button variant="outline" onClick={request} disabled={busy} data-testid="request-revision">Request revision</Button></div>
        </div>
      ) : null}
      {canConfirm ? (
        <div className="flex flex-col justify-between gap-4">
          <p className="text-sm text-muted-foreground">Once you confirm completion, the balance is due. Confirm when the files meet the brief.</p>
          <div><Button onClick={confirm} disabled={busy} data-testid="confirm-completion-panel">Confirm completion</Button></div>
        </div>
      ) : null}
    </section>
  );
}

function DisputePanel({ projectId, onDone, setError }: { projectId: string; onDone: (message: string) => void; setError: (e: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const submit = async () => {
    setFormError(null);
    if (reason.trim().length < 20) {
      setFormError('Describe the issue (at least 20 characters).');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/projects/${projectId}/dispute`, { reason });
      setOpen(false);
      onDone('Dispute opened. Payouts are held while the Photo Shoot team reviews it.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-lg border border-border bg-card p-6 text-sm" aria-labelledby="dispute-title">
      <h3 id="dispute-title" className="text-sm font-semibold uppercase tracking-[0.12em]">Open a dispute</h3>
      <p className="mt-3 text-muted-foreground">Disputes pause payouts while we review them. We do not yet publish a reply time.</p>
      {!open ? (
        <Button variant="outline" className="mt-4" onClick={() => setOpen(true)} data-testid="open-dispute">Open a dispute</Button>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <Label htmlFor="dispute-reason">What happened?</Label>
          <Textarea id="dispute-reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} className="bg-background" data-testid="dispute-reason" />
          <FieldError message={formError} />
          <div className="flex flex-wrap gap-3">
            <Button onClick={submit} disabled={busy} data-testid="confirm-dispute">Submit dispute</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Not now</Button>
          </div>
        </div>
      )}
    </section>
  );
}

function ReviewForms({ projectId, targets, onDone, setError }: { projectId: string; targets: Array<{ userId: string; name: string }>; onDone: () => void; setError: (e: string | null) => void }) {
  return (
    <div className="flex flex-col gap-10" data-testid="review-forms">
      {targets.map((t) => <ReviewForm key={t.userId} projectId={projectId} target={t} onDone={onDone} setError={setError} />)}
    </div>
  );
}

function ReviewForm({ projectId, target, onDone, setError }: { projectId: string; target: { userId: string; name: string }; onDone: () => void; setError: (e: string | null) => void }) {
  const [scores, setScores] = useState({ communication: 5, reliability: 5, professionalism: 5, quality: 5 });
  const [expectationsMet, setExpectationsMet] = useState(true);
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setFormError(null);
    if (body.trim().length < 20) {
      setFormError('Write at least 20 characters so others understand your experience.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/projects/${projectId}/reviews`, { revieweeId: target.userId, ...scores, expectationsMet, body });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 md:p-8" aria-labelledby={`review-${target.userId}`} data-testid="review-form">
      <h3 id={`review-${target.userId}`} className="text-xl font-black uppercase tracking-tight">Review {target.name}</h3>
      <div className="grid gap-5 md:grid-cols-2">
        {(['communication', 'reliability', 'professionalism', 'quality'] as const).map((key) => (
          <div key={key} className="flex flex-col gap-2">
            <Label htmlFor={`${target.userId}-${key}`} className="capitalize">{key}</Label>
            <Select value={String(scores[key])} onValueChange={(v) => setScores((prev) => ({ ...prev, [key]: Number(v) }))}>
              <SelectTrigger id={`${target.userId}-${key}`} className="w-full bg-background" data-testid={`score-${key}`}><SelectValue /></SelectTrigger>
              <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} of 5</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-border bg-background p-4 text-sm">
        <span>
          <span className="block font-semibold">Were the agreed expectations met?</span>
          <span className="text-muted-foreground">Scope, timing, deliverables and responsibilities as written in the brief.</span>
        </span>
        <Switch checked={expectationsMet} onCheckedChange={setExpectationsMet} aria-label="Expectations met" data-testid="expectations-met" />
      </label>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${target.userId}-body`}>Your review</Label>
        <Textarea id={`${target.userId}-body`} rows={4} value={body} onChange={(e) => setBody(e.target.value)} className="bg-background" data-testid="review-body" />
        <FieldError message={formError} />
      </div>
      <div><Button onClick={submit} disabled={busy} data-testid="submit-review">{busy ? 'Posting…' : 'Post review'}</Button></div>
    </section>
  );
}

