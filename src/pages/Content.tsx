import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { PageHeader, SectionTitle } from '@/components/site/ui-bits';
import { CANCELLATION_GUARANTEE, QUALITY_GUARANTEE } from '../../shared/policy';
import { CREATOR_COMMISSION_RATE, CUSTOMER_FEE_RATE, DEPOSIT_RATE } from '../../shared/pricing';
import { SERVICE_AREA_STATEMENT } from '../../shared/service-area';

interface Credit {
  file: string;
  title: string;
  subject: string;
  sourceUrl: string | null;
  author: string;
  license: string;
  licenseUrl: string | null;
}

const STEPS = [
  { title: 'Describe the project', body: 'Write a short brief: the content, the Los Angeles neighbourhood, dates, budget, style and what you will receive. Creators see only what the brief says.' },
  { title: 'Find your team', body: 'Matching uses profile information: services, coverage, packages, availability, style and reviews. Each result explains why it fits. Choose one creator or a photographer and a videographer.' },
  { title: 'Agree on expectations', body: 'Everyone on the team reads the same brief: goals, responsibilities, prices, shoot time, deliverables, revisions, usage rights and deadlines. Nothing is booked until every person approves.' },
  { title: 'Book securely', body: 'The customer accepts the Refund and Cancellation Policy, then pays a deposit through the payment provider. The balance is due after the customer confirms completion.' },
  { title: 'Create and deliver', body: 'Creators upload files in the project workspace. The customer requests included revisions or confirms completion. Both sides then review the booking.' },
];

export function HowItWorks() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 md:px-8 md:py-16">
      <PageHeader
        eyebrow="How it works"
        title="From idea to delivered work"
        description={SERVICE_AREA_STATEMENT}
        actions={
          <>
            <Button asChild><Link to="/discover">Find LA Photographers &amp; Videographers</Link></Button>
            <Button asChild variant="outline"><Link to="/match">Match Me With a Creative Team</Link></Button>
          </>
        }
      />
      <ol className="mt-14 grid gap-8 md:grid-cols-2">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-4 border-t border-border pt-6">
            <p className="text-sm font-bold tabular-nums text-brand-red-text">0{index + 1}</p>
            <h2 className="text-2xl font-black uppercase tracking-tight">{step.title}</h2>
            <p className="leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
      <section className="mt-20 grid gap-10 md:grid-cols-2" aria-labelledby="money-title">
        <SectionTitle eyebrow="Money" title="Clear terms before you pay" description="These are the figures used in this build. The price breakdown on every project shows the amounts for your team." />
        <ul className="flex flex-col gap-4 text-sm leading-relaxed">
          <li><span className="font-semibold">Customer service fee:</span> {Math.round(CUSTOMER_FEE_RATE * 100)}% added to the creators&apos; package prices.</li>
          <li><span className="font-semibold">Deposit:</span> {Math.round(DEPOSIT_RATE * 100)}% of the total, paid to confirm the booking.</li>
          <li><span className="font-semibold">Balance:</span> the remainder, paid after the customer confirms completion.</li>
          <li><span className="font-semibold">Creator commission:</span> {Math.round(CREATOR_COMMISSION_RATE * 100)}% of each package. Payouts are scheduled after the balance clears.</li>
        </ul>
      </section>
      <div className="mt-16 flex flex-wrap gap-3">
        <Button asChild variant="outline"><Link to="/policies/refund-and-cancellation">Read the Refund and Cancellation Policy</Link></Button>
      </div>
    </div>
  );
}

export function Policies() {
  const [credits, setCredits] = useState<Credit[] | null>(null);
  const [creditError, setCreditError] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/images/samples/credits.json')
      .then((r) => (r.ok ? (r.json() as Promise<Credit[]>) : Promise.reject(new Error('not found'))))
      .then((data) => {
        if (active) setCredits(data);
      })
      .catch(() => {
        if (active) setCreditError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 md:px-8 md:py-16">
      <PageHeader eyebrow="Policies" title="Terms that are easy to read" description="The Refund and Cancellation Policy, Terms and Conditions, service area, disputes, reviews, and the credits for sample imagery." />

      <section id="service-area" className="mt-14 grid gap-6 md:grid-cols-[1fr_2fr]" aria-labelledby="sa-title">
        <h2 id="sa-title" className="text-2xl font-black uppercase tracking-tight">Service area</h2>
        <p className="leading-relaxed text-muted-foreground">{SERVICE_AREA_STATEMENT} If you work outside the City of Los Angeles, Photo Shoot can&apos;t match that project yet.</p>
      </section>

      <section id="cancellation" className="mt-16 flex flex-col gap-6" aria-labelledby="cancel-title">
        <h2 id="cancel-title" className="text-2xl font-black uppercase tracking-tight">Refund and Cancellation Policy</h2>
        <p className="max-w-3xl leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Quality and delivery guarantee.</span> {QUALITY_GUARANTEE}
        </p>
        <p className="max-w-3xl leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">72-hour cancellation guarantee.</span> {CANCELLATION_GUARANTEE} Exactly 72 elapsed hours qualifies. Your project shows the deadline in Los Angeles time before you pay and before you cancel.
        </p>
        <p className="max-w-3xl leading-relaxed text-muted-foreground">
          A cancellation made less than 72 hours before the session is not covered by that guarantee. The cancellation is still recorded, and a Photo Shoot reviewer decides any refund in writing. Delivery and quality requests are independent of the cancellation deadline.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild><Link to="/policies/refund-and-cancellation">Read the full Refund and Cancellation Policy</Link></Button>
          <Button asChild variant="outline"><Link to="/terms">Terms and Conditions</Link></Button>
        </div>
      </section>

      <section id="disputes" className="mt-16 flex flex-col gap-6" aria-labelledby="dispute-title">
        <h2 id="dispute-title" className="text-2xl font-black uppercase tracking-tight">Refund requests and disputes</h2>
        <ol className="list-decimal space-y-3 pl-6 leading-relaxed text-muted-foreground">
          <li>Request a refund, or open a dispute, from the project&apos;s Payments tab once the booking is confirmed. Payouts for that project are held while it is reviewed.</li>
          <li>The creator can respond and add evidence. A creator cannot approve or reject a complaint about their own work alone.</li>
          <li>A Photo Shoot reviewer who was not part of the booking reviews the evidence from both sides and writes the decision, with its reasons.</li>
          <li>The status is shown as submitted, under review, approved, sent to the payment provider, or refunded. We do not promise a review timescale yet.</li>
        </ol>
      </section>

      <section id="reviews" className="mt-16 flex flex-col gap-6" aria-labelledby="review-title">
        <h2 id="review-title" className="text-2xl font-black uppercase tracking-tight">Reviews and verification</h2>
        <ul className="list-disc space-y-3 pl-6 leading-relaxed text-muted-foreground">
          <li>Reviews can only be written after a project is completed. Each review names the booking it came from.</li>
          <li>Customers rate creators on communication, reliability, professionalism and quality, and say whether the agreed expectations were met.</li>
          <li>Creators rate customers on the same points, so each side can see how the other works.</li>
          <li>This build does not perform identity checks, so no verified-identity badge is shown. Demonstration profiles, projects and reviews are labelled.</li>
        </ul>
      </section>

      <section id="credits" className="mt-16 flex flex-col gap-6" aria-labelledby="credits-title">
        <h2 id="credits-title" className="text-2xl font-black uppercase tracking-tight">Sample imagery credits</h2>
        <p className="max-w-3xl leading-relaxed text-muted-foreground">
          The sample images show Los Angeles architecture, skylines and landscapes, plus original abstract compositions made for this build. Photographs are from Wikimedia Commons under the licences listed below. Attribution is shown for each image.
        </p>
        {creditError ? <p className="text-sm text-muted-foreground">The credits list could not load. See public/images/samples/credits.json.</p> : null}
        {credits ? (
          <ul className="grid gap-4 md:grid-cols-2" data-testid="credits-list">
            {credits.map((c) => (
              <li key={c.file} className="flex flex-col gap-1 rounded-md border border-border bg-card p-4 text-sm">
                <span className="font-semibold">{c.title}</span>
                <span className="text-muted-foreground">By {c.author}</span>
                <span className="text-muted-foreground">
                  Licence:{' '}
                  {c.licenseUrl ? <a className="underline underline-offset-4" href={c.licenseUrl} target="_blank" rel="noreferrer">{c.license}</a> : c.license}
                  {c.sourceUrl ? <> · <a className="underline underline-offset-4" href={c.sourceUrl} target="_blank" rel="noreferrer">Source</a></> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-6 px-5 py-28 md:px-8">
      <p className="eyebrow">Page not found</p>
      <h1 className="text-5xl font-black uppercase leading-[0.92] tracking-tight md:text-7xl">We could not find that frame.</h1>
      <p className="max-w-xl text-muted-foreground">The page may have moved. Try the creator directory or build a team from your brief.</p>
      <div className="flex flex-wrap gap-3">
        <Button asChild><Link to="/">Back to home</Link></Button>
        <Button asChild variant="outline"><Link to="/discover">Find creators</Link></Button>
      </div>
    </div>
  );
}
