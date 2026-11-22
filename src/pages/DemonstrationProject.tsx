import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DemonstrationProjectBadge } from '@/components/opportunities/DemonstrationProjectBadge';
import { SampleApplicationDialog } from '@/components/opportunities/SampleApplicationDialog';
import { EmptyState } from '@/components/site/ui-bits';
import { formatUsd as money } from '../../shared/money';
import {
  findDemonstrationProject,
  formatDeadline,
  roleName,
  settingLabel,
  shootSchedule,
  type DemonstrationProject as Project,
  type DemonstrationRole,
} from '../../shared/demonstration-projects';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <h2 id={id} className="text-2xl font-black uppercase tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base">{children}</dd>
    </div>
  );
}

function roleSummary(role: DemonstrationRole): string {
  if (role.payCents === undefined) return `${roleName(role.role)}: paid from the total project budget`;
  return `Pay for ${role.role}: ${money(role.payCents)}`;
}

function Summary({ project }: { project: Project }) {
  const schedule = shootSchedule(project);
  return (
    <div className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 md:p-7">
      <DemonstrationProjectBadge className="w-fit" />
      <div className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Total project budget</p>
        <p className="text-4xl font-black tracking-tight" data-testid="demo-total-budget">{money(project.budgetCents)}</p>
        <p className="text-sm text-muted-foreground">Includes editing</p>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {project.roles.map((role) => (
          <li key={role.role} className="flex flex-col">
            <span className="font-semibold">{roleSummary(role)}</span>
          </li>
        ))}
      </ul>
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Shoot</dt>
          <dd>
            {schedule.date}
            <span className="block text-muted-foreground">{schedule.times}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Estimated duration</dt>
          <dd>{schedule.duration} on set</dd>
        </div>
      </dl>
      <SampleApplicationDialog project={project} variant="default" testId="sample-apply" />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Demonstration projects cannot be booked or paid for. Nothing on this page creates a booking, payment or application.
      </p>
    </div>
  );
}

export function DemonstrationProject() {
  const { slug } = useParams();
  const project = findDemonstrationProject(slug);

  if (!project) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-24 md:px-8">
        <EmptyState
          testId="demonstration-not-found"
          title="That demonstration project is not available"
          body="Browse the project board for the sample briefs."
          action={<Button asChild><Link to="/opportunities">Back to the project board</Link></Button>}
        />
      </div>
    );
  }

  const schedule = shootSchedule(project);

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-5 pt-10 md:px-8">
        <Button asChild variant="ghost" className="-ml-3">
          <Link to="/opportunities"><ArrowLeft aria-hidden /> Back to the project board</Link>
        </Button>
      </div>

      <header className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 pb-10 pt-6 md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <DemonstrationProjectBadge />
          <span className="text-sm text-muted-foreground">Sample brief. Not live, and it cannot be booked or paid for.</span>
        </div>
        <h1 className="max-w-4xl text-5xl font-black uppercase leading-[0.92] tracking-tight md:text-6xl" data-testid="demonstration-title">
          {project.title}
        </h1>
        <p className="flex items-center gap-2 text-muted-foreground">
          <MapPin className="size-4" aria-hidden />
          {project.neighborhood}, Los Angeles · {settingLabel(project.setting)}
        </p>
      </header>

      <div className="mx-auto w-full max-w-7xl px-5 md:px-8">
        <img src={project.image.src} alt={project.image.alt} className="aspect-[21/9] w-full rounded-lg object-cover" />
      </div>

      <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 py-12 md:px-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-14">
          <Section id="detail-overview" title="Overview and creative goals">
            <p className="text-lg leading-relaxed">{project.overview}</p>
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Creative goals</h3>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground marker:text-brand-red-text">
              {project.creativeGoals.map((goal) => <li key={goal}>{goal}</li>)}
            </ul>
          </Section>

          <Section id="detail-customer" title="Demonstration customer">
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-red-text">Fictional customer, for demonstration only</p>
              <dl className="grid gap-5 sm:grid-cols-2">
                <Fact label="Business">{project.customer.businessName}</Fact>
                <Fact label="Contact">{project.customer.contactName}</Fact>
              </dl>
              <p className="text-sm leading-relaxed text-muted-foreground">{project.customer.description}</p>
            </div>
          </Section>

          <Section id="detail-schedule" title="Shoot location and schedule">
            <dl className="grid gap-6 sm:grid-cols-2">
              <Fact label="Location">{project.neighborhood}, Los Angeles</Fact>
              <Fact label="Indoor or outdoor">{settingLabel(project.setting)}</Fact>
              <Fact label="Shoot date">{schedule.date}</Fact>
              <Fact label="Start and end (Los Angeles time)">{schedule.times}</Fact>
              <Fact label="Estimated duration">{schedule.duration} on set</Fact>
              <Fact label="Delivery deadline">{formatDeadline(project.deliveryDeadline)}</Fact>
            </dl>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {project.settingNote} The exact address is shared once the terms are agreed.
            </p>
          </Section>

          <Section id="detail-roles" title="Roles and compensation">
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Total project budget</p>
              <p className="text-3xl font-black tracking-tight">{money(project.budgetCents)}, including editing</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{project.compensationIncludes}</p>
              {project.paymentTerms?.length ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Payment terms</p>
                  <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground marker:text-brand-red-text">
                    {project.paymentTerms.map((term) => <li key={term}>{term}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              {project.roles.map((role) => (
                <article key={role.role} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
                  <h3 className="text-lg font-black uppercase tracking-tight">{roleName(role.role)}</h3>
                  <p className="font-semibold">{roleSummary(role)}</p>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">Responsibilities</p>
                    <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground marker:text-brand-red-text">
                      {role.responsibilities.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </Section>

          <Section id="detail-deliverables" title="Deliverables">
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground marker:text-brand-red-text">
              {project.deliverables.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p className="text-sm font-semibold">Delivery deadline: {formatDeadline(project.deliveryDeadline)}</p>
          </Section>

          <Section id="detail-style" title="Requested visual style">
            <p className="leading-relaxed text-muted-foreground">{project.visualStyle}</p>
          </Section>

          <Section id="detail-equipment" title="Equipment">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em]">Applicants bring</h3>
                <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground marker:text-brand-red-text">
                  {project.equipment.applicant.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em]">The customer provides</h3>
                <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground marker:text-brand-red-text">
                  {project.equipment.customer.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
          </Section>

          <Section id="detail-travel" title="Travel and expenses">
            <p className="leading-relaxed text-muted-foreground">{project.travel}</p>
          </Section>

          <Section id="detail-usage" title="Requested content usage">
            <p className="leading-relaxed text-muted-foreground">{project.usage}</p>
          </Section>

          <Section id="detail-terms" title="Proposed project terms">
            <div className="flex flex-col gap-4 rounded-lg border border-dashed border-border-strong p-6">
              <p className="font-semibold">Proposed terms, to be agreed before booking.</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Usage, scope and payment on this page are proposals. Nothing here is booked, charged or paid. Once a project is agreed, any
                cancellation follows the{' '}
                <Link className="font-semibold text-foreground underline underline-offset-4 hover:text-brand-red-text" to="/policies/refund-and-cancellation">
                  Refund and Cancellation Policy
                </Link>
                .
              </p>
            </div>
          </Section>

          <Section id="detail-submit" title="What applicants submit">
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground marker:text-brand-red-text">
              {project.submission.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                A sample application shows the form without sending anything.
              </p>
              <SampleApplicationDialog project={project} testId="sample-apply-section" />
            </div>
          </Section>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          <Summary project={project} />
        </aside>
      </div>
    </>
  );
}
