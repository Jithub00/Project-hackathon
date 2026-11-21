import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/site/ui-bits';
import {
  CANCELLATION_GUARANTEE,
  POLICY_VERSIONS,
  QUALITY_GUARANTEE,
  REFUND_POLICY_TITLE,
  REFUND_POLICY_VERSION,
  TERMS_TITLE,
  TERMS_VERSION,
  type PolicySection,
  type PublishedPolicy,
} from '../../shared/policy';

/** The version named in the link (for example ?version=2026-11-21), or the current one. Earlier versions stay readable. */
function publishedVersion(raw: string | null, current: string): PublishedPolicy {
  const version = raw && POLICY_VERSIONS[raw] ? raw : current;
  return POLICY_VERSIONS[version];
}

function Sections({ sections }: { sections: PolicySection[] }) {
  return (
    <div className="flex flex-col gap-12">
      {sections.map((section) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="flex scroll-mt-24 flex-col gap-4">
          <h2 id={`${section.id}-title`} className="text-2xl font-black uppercase tracking-tight">{section.title}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="leading-relaxed text-muted-foreground">{paragraph}</p>
          ))}
          {section.items ? (
            <ul className="flex flex-col gap-3 pl-1 leading-relaxed text-muted-foreground">
              {section.items.map((item) => (
                <li key={item.text} className="flex gap-3">
                  <span aria-hidden className="mt-2.5 inline-block size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{item.label ? <span className="font-semibold text-foreground">{item.label} </span> : null}{item.text}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function VersionNote({ version, current }: { version: string; current: string }) {
  if (version === current) return null;
  return (
    <p className="rounded-md border border-white/15 bg-surface-raised p-4 text-sm">
      You are reading an earlier version ({version}). Bookings made under it keep this text. The <Link to={`${location.pathname}`} className="underline underline-offset-4">current version</Link> applies to new bookings.
    </p>
  );
}

export function RefundPolicyPage() {
  const [params] = useSearchParams();
  const published = publishedVersion(params.get('version'), REFUND_POLICY_VERSION);
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12 md:px-8 md:py-16">
      <PageHeader
        eyebrow={`Version ${published.version}`}
        title={REFUND_POLICY_TITLE}
        description="How refunds, cancellations and refund requests work on Photo Shoot. Written in plain language. Where a creator's profile or project terms say something different, this policy applies."
      />
      <div className="mt-10 flex flex-col gap-6">
        <VersionNote version={published.version} current={REFUND_POLICY_VERSION} />
        <aside className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6" aria-label="Our two customer protections">
          <p className="text-sm leading-relaxed">
            <span className="font-semibold">Quality and delivery guarantee.</span> {QUALITY_GUARANTEE}
          </p>
          <p className="text-sm leading-relaxed">
            <span className="font-semibold">72-hour cancellation guarantee.</span> {CANCELLATION_GUARANTEE}
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild variant="outline" size="sm"><Link to="/terms">Terms and Conditions</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/policies">All policies</Link></Button>
          </div>
        </aside>
      </div>
      <div className="mt-14">
        <Sections sections={published.refund} />
      </div>
    </div>
  );
}

export function TermsPage() {
  const [params] = useSearchParams();
  const published = publishedVersion(params.get('version'), TERMS_VERSION);
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12 md:px-8 md:py-16">
      <PageHeader
        eyebrow={`Version ${published.version}`}
        title={TERMS_TITLE}
        description="The rules for using Photo Shoot as a customer or a creator. The Refund and Cancellation Policy forms part of these Terms."
        actions={
          <Button asChild variant="outline"><Link to="/policies/refund-and-cancellation">Refund and Cancellation Policy</Link></Button>
        }
      />
      <div className="mt-10">
        <VersionNote version={published.version} current={TERMS_VERSION} />
      </div>
      <div className="mt-14">
        <Sections sections={published.terms} />
      </div>
    </div>
  );
}
