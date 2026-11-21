import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import type { PaymentMode } from '../../shared/types';

/**
 * Payment provider adapter.
 *
 * - "demo" (default when no Stripe secret key is configured): simulates a
 *   PaymentIntent and its refunds. No money moves, and the UI labels every
 *   payment and refund as a demonstration. The server records the transaction
 *   and only marks it successful when the demo confirmation endpoint is called
 *   by the signed-in payer.
 * - "stripe": creates real Stripe PaymentIntents, syncs their status from
 *   Stripe, issues refunds, and accepts signed webhooks. Card details are
 *   collected by Stripe Elements in the browser and never reach this server.
 *
 * A refund is only "refunded" once the provider reports it succeeded. Stripe can
 * report a refund as pending; the webhook then confirms or fails it.
 */

export interface ChargeIntent {
  providerRef: string;
  clientSecret: string | null;
}

export type ProviderStatus = 'succeeded' | 'processing' | 'requires_payment' | 'canceled';

export type RefundOutcome = 'succeeded' | 'pending' | 'failed';

export interface RefundResult {
  status: RefundOutcome;
  providerRef: string;
}

export interface PaymentProvider {
  mode: PaymentMode;
  createIntent(input: { paymentId: string; projectId: string; amountCents: number; description: string }): Promise<ChargeIntent>;
  fetchStatus(providerRef: string): Promise<ProviderStatus>;
  /** Idempotent per refundId: the same refundId can be sent again without refunding twice. */
  refund(input: { refundId: string; providerRef: string; amountCents: number }): Promise<RefundResult>;
}

export function resolvePaymentMode(env: NodeJS.ProcessEnv = process.env): PaymentMode {
  const requested = env.PAYMENT_MODE?.trim().toLowerCase();
  if (requested === 'demo') return 'demo';
  if (requested === 'stripe') {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error('PAYMENT_MODE=stripe needs STRIPE_SECRET_KEY. See docs/PAYMENTS.md.');
    }
    return 'stripe';
  }
  return env.STRIPE_SECRET_KEY ? 'stripe' : 'demo';
}

const demoProvider: PaymentProvider = {
  mode: 'demo',
  async createIntent() {
    const id = randomUUID();
    return { providerRef: `demo_pi_${id}`, clientSecret: `demo_secret_${id}` };
  },
  async fetchStatus() {
    return 'requires_payment';
  },
  async refund({ refundId }) {
    // Demo refunds are recorded in the database only. The provider "confirms" them at once, labelled as a demonstration.
    return { status: 'succeeded', providerRef: `demo_re_${refundId}` };
  },
};

function outcomeFromStripeRefund(status: string | null | undefined): RefundOutcome {
  if (status === 'succeeded') return 'succeeded';
  if (status === 'failed' || status === 'canceled') return 'failed';
  return 'pending';
}

function createStripeProvider(secretKey: string): PaymentProvider {
  const stripe = new Stripe(secretKey);
  return {
    mode: 'stripe',
    async createIntent({ paymentId, projectId, amountCents, description }) {
      const intent = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: 'usd',
          description,
          automatic_payment_methods: { enabled: true },
          metadata: { payment_id: paymentId, project_id: projectId, marketplace: 'photo-shoot' },
        },
        { idempotencyKey: `intent-${paymentId}` },
      );
      return { providerRef: intent.id, clientSecret: intent.client_secret };
    },
    async fetchStatus(providerRef) {
      const intent = await stripe.paymentIntents.retrieve(providerRef);
      switch (intent.status) {
        case 'succeeded':
          return 'succeeded';
        case 'processing':
          return 'processing';
        case 'canceled':
          return 'canceled';
        default:
          return 'requires_payment';
      }
    },
    async refund({ refundId, providerRef, amountCents }) {
      // The idempotency key is the refund id, so a retried request cannot create a second refund at Stripe.
      const refund = await stripe.refunds.create(
        { payment_intent: providerRef, amount: amountCents, metadata: { refund_id: refundId } },
        { idempotencyKey: `refund-${refundId}` },
      );
      return { status: outcomeFromStripeRefund(refund.status), providerRef: refund.id };
    },
  };
}

/** Maps a Stripe refund object's status to the outcome we record. Used by the webhook as well. */
export function refundOutcomeFromStripe(status: string | null | undefined): RefundOutcome {
  return outcomeFromStripeRefund(status);
}

export function createPaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProvider {
  const mode = resolvePaymentMode(env);
  if (mode === 'stripe') return createStripeProvider(env.STRIPE_SECRET_KEY as string);
  return demoProvider;
}

/** Verifies a Stripe webhook signature and returns the parsed event. Throws when invalid. */
export function constructStripeEvent(
  env: NodeJS.ProcessEnv,
  rawBody: Buffer,
  signature: string,
): Stripe.Event {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe webhooks need STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.');
  }
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}
