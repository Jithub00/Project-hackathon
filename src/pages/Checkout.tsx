import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { Stripe, StripeElements } from '@stripe/stripe-js';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { DemoBadge, ErrorAlert, LoadingBlock, PageHeader, PriceBreakdown } from '@/components/site/ui-bits';
import { api, errorMessage } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { formatBookingTime } from '../../shared/cancellation';
import { formatUsdExact } from '../../shared/money';
import { CREATOR_COMMISSION_RATE, CUSTOMER_FEE_RATE, DEPOSIT_RATE } from '../../shared/pricing';
import { CANCELLATION_SUMMARY, QUALITY_SUMMARY, REFUND_POLICY_VERSION, TERMS_VERSION } from '../../shared/policy';
import type { PaymentView, ProjectDetail } from '../../shared/types';

interface CheckoutSession {
  payment: PaymentView;
  clientSecret: string | null;
  mode: 'demo' | 'stripe';
  amountCents: number;
  kind: 'deposit' | 'balance';
  project: ProjectDetail;
}

function laTime(iso: string | null): string | null {
  return iso ? formatBookingTime(Date.parse(iso)) : null;
}

export function Checkout() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const kind: 'deposit' | 'balance' = params.get('kind') === 'balance' ? 'balance' : 'deposit';
  const navigate = useNavigate();
  const { config } = useApp();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const agreeId = useId();
  const stripeRef = useRef<{ stripe: Stripe; elements: StripeElements } | null>(null);
  // Track readiness in state: writing a ref does not re-render, so the button would stay disabled.
  const [stripeReady, setStripeReady] = useState(false);

  // Load the booking first, so the customer sees the policy and dates before any payment is started.
  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get<{ project: ProjectDetail }>(`/api/projects/${id}`)
      .then((data) => {
        if (active) setProject(data.project);
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  // The balance needs no new acceptance, so its payment starts straight away.
  useEffect(() => {
    if (kind !== 'balance') return;
    let active = true;
    setLoading(true);
    setError(null);
    api
      .post<CheckoutSession>(`/api/projects/${id}/checkout`, { kind })
      .then((data) => {
        if (active) setSession(data);
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, kind]);

  // Live payments: mount Stripe's Payment Element only when a publishable key is configured.
  useEffect(() => {
    if (!session || session.mode !== 'stripe' || !session.clientSecret || !config?.stripePublishableKey) return;
    let cancelled = false;
    (async () => {
      const { loadStripe } = await import('@stripe/stripe-js');
      const stripe = await loadStripe(config.stripePublishableKey as string);
      if (!stripe || cancelled) return;
      const elements = stripe.elements({
        clientSecret: session.clientSecret as string,
        appearance: { theme: 'night', variables: { colorPrimary: '#E12325', borderRadius: '6px' } },
      });
      elements.create('payment').mount('#payment-element');
      stripeRef.current = { stripe, elements };
      setStripeReady(true);
    })().catch((err: unknown) => {
      if (!cancelled) setError(errorMessage(err));
    });
    return () => {
      cancelled = true;
    };
  }, [session, config]);

  const finish = (message: string) => navigate(`/projects/${id}`, { state: { flash: message } });

  /** Deposit only: the customer accepts the current policy and terms, and only then is the payment started. */
  const continueToPayment = async () => {
    if (!agreed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<CheckoutSession>(`/api/projects/${id}/checkout`, {
        kind: 'deposit',
        acceptedRefundPolicyVersion: REFUND_POLICY_VERSION,
        acceptedTermsVersion: TERMS_VERSION,
      });
      setSession(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmDemo = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/payments/${session.payment.id}/demo-confirm`);
      finish(
        session.kind === 'deposit'
          ? 'Deposit received. The booking is confirmed, and the policy version you accepted is recorded with it. This was a demonstration payment, so no money moved.'
          : 'Balance received. Creator payouts are scheduled. This was a demonstration payment, so no money moved.',
      );
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const confirmStripe = async () => {
    if (!session || !stripeRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const { stripe, elements } = stripeRef.current;
      const result = await stripe.confirmPayment({ elements, redirect: 'if_required' });
      if (result.error) {
        setError(result.error.message ?? 'The payment was not completed. Check your details and try again.');
        setBusy(false);
        return;
      }
      const synced = await api.post<{ payment: PaymentView }>(`/api/payments/${session.payment.id}/sync`);
      if (synced.payment.status === 'succeeded') {
        finish(session.kind === 'deposit' ? 'Deposit received. The booking is confirmed.' : 'Balance received. Creator payouts are scheduled.');
      } else {
        finish('Payment received and processing. The project page will update when the provider confirms it.');
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const demo = session?.mode === 'demo';
  const label = kind === 'deposit' ? `Deposit · ${Math.round(DEPOSIT_RATE * 100)}% of the total` : 'Balance due after completion';
  const start = project?.cancellation.scheduledStart ?? null;
  const deadline = project?.cancellation.deadline ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 md:px-8 md:py-16">
      <PageHeader
        eyebrow="Secure booking"
        title={kind === 'deposit' ? 'Pay the deposit' : 'Pay the balance'}
        description={
          kind === 'deposit'
            ? 'The deposit confirms the booking for everyone on the agreed team. Card details are handled by the payment provider, never by Photo Shoot.'
            : 'The balance closes the project. Creator payouts are scheduled after it clears.'
        }
        actions={demo ? <DemoBadge /> : null}
      />

      {loading ? <div className="mt-10"><LoadingBlock label="Preparing secure payment" /></div> : null}
      {error ? <div className="mt-8"><ErrorAlert message={error} /></div> : null}

      {kind === 'deposit' && project && !session ? (
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px]">
          <section className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 md:p-8" aria-labelledby="policy-summary-title" data-testid="checkout-policy">
            <h2 id="policy-summary-title" className="text-xl font-black uppercase tracking-tight">Before you pay</h2>
            <p className="text-sm leading-relaxed">
              <span className="font-semibold">Quality and delivery guarantee.</span> {QUALITY_SUMMARY}
            </p>
            <p className="text-sm leading-relaxed" data-testid="checkout-cancellation-summary">
              <span className="font-semibold">72-hour cancellation guarantee.</span> {CANCELLATION_SUMMARY}
            </p>
            {deadline ? (
              <p className="text-sm" data-testid="checkout-deadline">
                The scheduled start is <span className="font-semibold">{laTime(start)}</span>. The 72-hour deadline is{' '}
                <span className="font-semibold">{laTime(deadline)}</span> (Los Angeles time). Cancelling at or before this time, with your cancellation recorded then, is covered by the full-refund guarantee.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">The agreed brief has no usable start time yet, so the 72-hour deadline cannot be shown.</p>
            )}
            <div className="flex flex-wrap gap-4 text-sm">
              <Link to="/policies/refund-and-cancellation" className="underline underline-offset-4" data-testid="checkout-policy-link">Read the Refund and Cancellation Policy</Link>
              <Link to="/terms" className="underline underline-offset-4">Read the Terms and Conditions</Link>
            </div>
            <div className="flex items-start gap-3 rounded-md border border-white/15 bg-surface-raised p-4">
              <Checkbox id={agreeId} checked={agreed} onCheckedChange={(value) => setAgreed(value === true)} data-testid="checkout-accept" />
              <Label htmlFor={agreeId} className="font-normal leading-relaxed">
                I have read and accept the Refund and Cancellation Policy (version {REFUND_POLICY_VERSION}) and the Terms and Conditions (version {TERMS_VERSION}). The version I accept is recorded with this booking.
              </Label>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => void continueToPayment()} disabled={!agreed || busy} data-testid="continue-to-payment">
                {busy ? 'Starting payment…' : 'Continue to payment'}
              </Button>
              <Button asChild variant="outline"><Link to={`/projects/${id}`}>Back to project</Link></Button>
            </div>
          </section>
          <aside className="flex flex-col gap-6">
            <PriceBreakdown quote={project.quote} title="Price with fees" />
          </aside>
        </div>
      ) : null}

      {session ? (
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px]">
          <section className="flex flex-col gap-8 rounded-lg border border-border bg-card p-6 md:p-8" aria-labelledby="pay-title">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 id="pay-title" className="text-xl font-black uppercase tracking-tight">{label}</h2>
              <p className="text-3xl font-black tabular-nums" data-testid="amount-due">{formatUsdExact(session.amountCents)}</p>
            </div>

            {demo ? (
              <div className="flex flex-col gap-5 rounded-md border border-dashed border-border-strong p-5" data-testid="demo-payment">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline" className="border-white/40 uppercase tracking-[0.12em]">Demonstration payment</Badge>
                  <p className="text-sm text-muted-foreground">No card is charged and no money moves in this environment.</p>
                </div>
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Card (demonstration)</dt><dd className="mt-1 font-mono">4242 4242 4242 4242</dd></div>
                  <div><dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Expiry and CVC</dt><dd className="mt-1 font-mono">12 / 34 · 123</dd></div>
                </dl>
                <Button size="lg" onClick={confirmDemo} disabled={busy} data-testid="confirm-demo-payment">
                  {busy ? 'Confirming…' : `Confirm demonstration ${kind}`}
                </Button>
              </div>
            ) : session.mode === 'stripe' ? (
              <div className="flex flex-col gap-5">
                <div id="payment-element" data-testid="payment-element" className="min-h-40" />
                <Button size="lg" onClick={confirmStripe} disabled={busy || !stripeReady} data-testid="confirm-stripe-payment">
                  {busy ? 'Processing…' : `Pay ${formatUsdExact(session.amountCents)}`}
                </Button>
              </div>
            ) : null}

            <p className="flex items-start gap-3 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
              <span>
                The booking is confirmed only after the payment provider reports success. Photo Shoot records the result from the provider, never from the browser alone.
              </span>
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline"><Link to={`/projects/${id}`}>Back to project</Link></Button>
              <Button asChild variant="ghost"><Link to="/policies/refund-and-cancellation">Refund and Cancellation Policy</Link></Button>
            </div>
          </section>

          <aside className="flex flex-col gap-6">
            <PriceBreakdown quote={session.project.quote} title="Price with fees" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Includes a {Math.round(CUSTOMER_FEE_RATE * 100)}% customer service fee. Creators keep their package price minus a {Math.round(CREATOR_COMMISSION_RATE * 100)}% platform commission.
            </p>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
