import { Link } from 'react-router';
import { MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DemonstrationProjectBadge } from '@/components/opportunities/DemonstrationProjectBadge';
import { formatUsd as money } from '../../../shared/money';
import {
  roleName,
  settingLabel,
  shootSchedule,
  type DemonstrationProject,
  type DemonstrationRole,
} from '../../../shared/demonstration-projects';

function needsLabel(project: DemonstrationProject): string {
  const roles = project.roles.map((role) => role.role);
  if (roles.includes('photographer') && roles.includes('videographer')) return 'Photographer and videographer';
  return roles.includes('photographer') ? 'Photographer' : 'Videographer';
}

/** Says whether a role has its own pay or is paid from the total project budget. */
function roleLabel(role: DemonstrationRole): string {
  if (role.payCents === undefined) return `${roleName(role.role)}, paid from the total budget`;
  return `Pay for ${role.role}: ${money(role.payCents)}`;
}

export function DemonstrationProjectCard({ project }: { project: DemonstrationProject }) {
  const schedule = shootSchedule(project);
  const headingId = `demonstration-title-${project.slug}`;

  return (
    <article
      aria-labelledby={headingId}
      data-testid="demonstration-card"
      data-slug={project.slug}
      className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-muted">
        <img src={project.image.src} alt={project.image.alt} decoding="async" className="size-full object-cover" />
        <DemonstrationProjectBadge className="absolute left-4 top-4" />
      </div>

      <div className="flex flex-1 flex-col gap-5 p-6 md:p-7">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{project.neighborhood}, Los Angeles</p>
          <h3 id={headingId} className="text-2xl font-black uppercase leading-tight tracking-tight">{project.title}</h3>
        </div>

        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Location</dt>
            <dd className="mt-1 flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {project.neighborhood}
                <span className="block text-muted-foreground">{settingLabel(project.setting)}</span>
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Needs</dt>
            <dd className="mt-1 font-semibold">{needsLabel(project)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Shoot date</dt>
            <dd className="mt-1">
              {schedule.date}
              <span className="block text-muted-foreground">{schedule.times} · {schedule.duration}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Payment</dt>
            <dd className="mt-1">
              <span className="font-semibold">Total project budget {money(project.budgetCents)}</span>
              <span className="block text-muted-foreground">Includes editing</span>
            </dd>
          </div>
        </dl>

        <p className="text-sm leading-relaxed text-muted-foreground">{project.overview}</p>

        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Roles available</p>
          <ul className="flex flex-wrap gap-2">
            {project.roles.map((role) => (
              <li key={role.role}>
                <Badge variant="outline" className="h-auto whitespace-normal rounded-sm py-1 text-left font-normal">
                  {roleLabel(role)}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-auto pt-2">
          <Button asChild>
            <Link to={`/opportunities/demo/${project.slug}`}>
              View Project<span className="sr-only">: {project.title}</span>
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
