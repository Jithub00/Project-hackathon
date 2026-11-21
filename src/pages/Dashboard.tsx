import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { EmptyState, ErrorAlert, LoadingBlock, PageHeader, StatusBadge, Stat, ErrorAlert as Alert } from '@/components/site/ui-bits';
import { api, errorMessage } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useApi } from '@/lib/use-api';
import { formatDate } from '@/lib/format';
import type { ProjectSummary, SessionUser } from '../../shared/types';

interface DashboardData {
  user: SessionUser;
  projects: ProjectSummary[];
  opportunities: number;
  checklist: Array<{ label: string; done: boolean; href: string }>;
}

function ProjectRow({ project, role }: { project: ProjectSummary; role: 'customer' | 'creator' }) {
  const action = project.nextStep.action;
  const needsAction = action !== 'none';
  return (
    <li className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 md:flex-row md:items-center md:justify-between" data-testid="project-row" data-project-id={project.id}>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={project.status} />
          {needsAction ? <span className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-red-text">Action needed</span> : null}
        </div>
        <h3 className="text-xl font-black uppercase leading-tight tracking-tight">{project.title}</h3>
        <p className="text-sm text-muted-foreground">
          {role === 'customer' ? project.customer.name : project.contentType} · {project.neighborhood}
          {project.shootDate ? ` · Shoot ${formatDate(project.shootDate)}` : ''}
        </p>
        <p className="text-sm"><span className="font-semibold">{project.nextStep.title}.</span> <span className="text-muted-foreground">{project.nextStep.body}</span></p>
      </div>
      <Button asChild variant={needsAction ? 'default' : 'outline'} className="shrink-0">
        <Link to={`/projects/${project.id}`} aria-label={`Open project ${project.title}`}>
          {role === 'creator' && project.nextStep.action === 'accept' ? 'Review invitation' : 'Open project'} <ArrowRight aria-hidden />
        </Link>
      </Button>
    </li>
  );
}

export function Dashboard() {
  const { user, setUser } = useApp();
  const data = useApi(() => api.get<DashboardData>('/api/me/dashboard'), [user?.id]);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!user) return null;
  if (data.loading) return <LoadingBlock label="Loading your dashboard" />;
  if (data.error || !data.data) return <div className="mx-auto max-w-3xl px-5 py-20 md:px-8"><ErrorAlert message={data.error ?? 'Your dashboard could not load.'} onRetry={data.reload} /></div>;

  const d = data.data;
  const projects = d.projects;
  const isCreator = user.role === 'creator';
  const active = projects.filter((p) => !['closed', 'cancelled'].includes(p.status));
  const needsAction = projects.filter((p) => p.nextStep.action !== 'none');
  const firstName = user.name.split(' ')[0];

  const toggleSeeking = async (value: boolean) => {
    setSaving(true);
    setToggleError(null);
    try {
      await api.put('/api/me/seeking', { seeking: value });
      setUser({ ...user, seekingClients: value });
    } catch (error) {
      setToggleError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const remaining = d.checklist.filter((item) => !item.done);

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-12 md:px-8 md:py-16">
      <PageHeader
        eyebrow={isCreator ? 'Creator dashboard' : 'Client dashboard'}
        title={`Welcome back, ${firstName}`}
        description={
          isCreator
            ? 'Accept invitations, approve briefs, deliver files and track payouts. Open calls in Los Angeles are on the project board.'
            : 'Track your briefs, approvals, bookings and deliveries. Start a new team whenever you need one.'
        }
        actions={
          isCreator ? (
            <>
              <Button asChild variant="outline"><Link to="/account/profile">Edit profile</Link></Button>
              <Button asChild><Link to="/opportunities">Find creative projects</Link></Button>
            </>
          ) : (
            <>
              <Button asChild variant="outline"><Link to="/discover">Find creators</Link></Button>
              <Button asChild><Link to="/match">Build a new team</Link></Button>
            </>
          )
        }
      />

      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {isCreator ? (
          <>
            <Stat label="Invitations and actions" value={needsAction.length} testId="stat-action" />
            <Stat label="Active bookings" value={active.length} testId="stat-active" />
            <Stat label="Open LA projects" value={d.opportunities} testId="stat-open" />
          </>
        ) : (
          <>
            <Stat label="Active projects" value={active.length} testId="stat-active" />
            <Stat label="Need your action" value={needsAction.length} testId="stat-action" />
            <Stat label="Total projects" value={projects.length} testId="stat-total" />
          </>
        )}
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_340px]">
        <section aria-labelledby="projects-title" className="flex min-w-0 flex-col gap-6">
          <h2 id="projects-title" className="text-2xl font-black uppercase tracking-tight">{isCreator ? 'Invitations and bookings' : 'Your projects'}</h2>
          {projects.length === 0 ? (
            <EmptyState
              testId="no-projects"
              title={isCreator ? 'No invitations yet' : 'No projects yet'}
              body={isCreator ? 'When a customer invites you to a team, the invitation appears here. You can also express interest in open briefs.' : 'Build a team from your brief. Each creator confirms before anything is committed.'}
              action={isCreator ? <Button asChild variant="outline"><Link to="/opportunities">Browse the project board</Link></Button> : <Button asChild><Link to="/match">Build a team</Link></Button>}
            />
          ) : (
            <ul className="flex flex-col gap-4">
              {projects.map((project) => (
                <ProjectRow key={project.id} project={project} role={user.role} />
              ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-8" aria-label="Account status">
          {isCreator ? (
            <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6" aria-labelledby="seeking-title">
              <h2 id="seeking-title" className="text-lg font-black uppercase tracking-tight">Seeking clients</h2>
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span className="text-sm">
                  {user.seekingClients ? 'You appear in discovery and matching.' : 'You are hidden from discovery and matching.'}
                </span>
                <Switch checked={Boolean(user.seekingClients)} disabled={saving} onCheckedChange={toggleSeeking} aria-label="Seeking new clients" data-testid="seeking-switch" />
              </label>
              {toggleError ? <Alert message={toggleError} /> : null}
            </section>
          ) : null}

          <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6" aria-labelledby="checklist-title" data-testid="checklist">
            <h2 id="checklist-title" className="text-lg font-black uppercase tracking-tight">Profile checklist</h2>
            <p className="text-sm text-muted-foreground">
              {remaining.length === 0 ? 'Your profile is complete.' : `${d.checklist.length - remaining.length} of ${d.checklist.length} complete.`}
            </p>
            <ul className="flex flex-col gap-3">
              {d.checklist.map((item) => (
                <li key={item.label}>
                  <Link to={item.href} className="flex items-start gap-3 text-sm hover:text-brand-red-text">
                    {item.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-label="Done" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="To do" />}
                    <span className={item.done ? 'text-muted-foreground' : 'font-medium'}>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" size="sm" className="w-fit"><Link to="/account/profile">Open profile</Link></Button>
          </section>

          <section className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground" aria-label="Help">
            <p className="font-semibold text-foreground">How refunds and cancellations work</p>
            <p className="mt-2">Cancelling at least 72 hours before the shoot refunds everything you paid. Refund requests are reviewed by Photo Shoot, and payouts are held while a request is open. <a className="underline underline-offset-4" href="/policies/refund-and-cancellation">Read the policy</a>.</p>
            <Button asChild variant="link" className="px-0"><Link to="/policies">Read the policies</Link></Button>
          </section>
        </aside>
      </div>
    </div>
  );
}
