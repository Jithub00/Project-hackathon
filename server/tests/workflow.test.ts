import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../app';
import { openDatabase, type Db } from '../db';
import { createPaymentProvider } from '../payments/provider';
import { REFUND_POLICY_VERSION, TERMS_VERSION } from '../../shared/policy';

/** Acceptance of the current Refund and Cancellation Policy and Terms, sent with invitations and deposits. */
const POLICY_ACCEPTANCE = { acceptedRefundPolicyVersion: REFUND_POLICY_VERSION, acceptedTermsVersion: TERMS_VERSION };

/**
 * Integration tests for the marketplace rules, run against the real Express app
 * on an in-memory SQLite database with demo payments.
 */

const PASSWORD = 'Test-Password-2026';

interface Reply {
  status: number;
  json: Record<string, unknown> | null;
  cookie?: string;
}

describe('marketplace API workflow', () => {
  let db: Db;
  let server: Server;
  let base: string;

  const call = async (method: string, path: string, body?: unknown, cookie?: string): Promise<Reply> => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const setCookie = res.headers.get('set-cookie');
    return {
      status: res.status,
      json: text ? (JSON.parse(text) as Record<string, unknown>) : null,
      cookie: setCookie ? setCookie.split(';')[0] : undefined,
    };
  };

  const signupCreator = (email: string, packageCents: number) =>
    call('POST', '/api/auth/signup/creator', {
      name: 'Ana Creator',
      email,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      services: 'photography',
      specialties: ['Editorial'],
      styles: ['Editorial'],
      neighborhoods: ['Venice'],
      citywide: false,
      packageService: 'photography',
      packageName: 'Half-day shoot',
      packageHours: 4,
      packagePriceCents: packageCents,
      bio: 'Testing creator.',
      seekingClients: true,
      acceptTerms: true,
    });

  before(async () => {
    db = openDatabase(':memory:');
    const app = createApp({
      db,
      provider: createPaymentProvider({ PAYMENT_MODE: 'demo' } as NodeJS.ProcessEnv),
      env: { PAYMENT_MODE: 'demo' } as NodeJS.ProcessEnv,
      uploadsDir: 'data/unit-uploads',
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  it('rejects a biography over 350 words with BIO_TOO_LONG and keeps accounts private', async () => {
    const signup = await call('POST', '/api/auth/signup/customer', {
      name: 'Long Bio', email: 'long.bio@example.com', password: PASSWORD, confirmPassword: PASSWORD,
      customerType: 'individual', businessName: '', neighborhood: '', interests: [], bio: 'Short.', acceptTerms: true,
    });
    assert.equal(signup.status, 201);
    const tooLong = Array.from({ length: 351 }, (_, i) => `w${i}`).join(' ');
    const reply = await call('PUT', '/api/me/profile', { name: 'Long Bio', bio: tooLong }, signup.cookie);
    assert.equal(reply.status, 422);
    assert.equal(reply.json?.code, 'BIO_TOO_LONG');
    const me = await call('GET', '/api/me/dashboard', undefined, signup.cookie);
    assert.equal(me.status, 200);
    const anonymous = await call('GET', '/api/me/dashboard');
    assert.equal(anonymous.status, 401);
  });

  it('keeps discovery inside the Los Angeles service area', async () => {
    const reply = await call('GET', '/api/creators?neighborhood=Santa%20Monica');
    assert.equal(reply.status, 400);
    assert.equal(reply.json?.code, 'OUTSIDE_SERVICE_AREA');
  });

  it('runs a booking from invitation to a paid deposit, then cancels with the policy refund', async () => {
    const customer = await call('POST', '/api/auth/signup/customer', {
      name: 'Booking Client', email: 'booking.client@example.com', password: PASSWORD, confirmPassword: PASSWORD,
      customerType: 'individual', businessName: '', neighborhood: 'Venice', interests: [], bio: '', acceptTerms: true,
    });
    const creator = await signupCreator('booking.creator@example.com', 90000);
    const creatorId = ((await call('GET', '/api/auth/me', undefined, creator.cookie)).json?.user as { id: string }).id;
    const packages = (await call('GET', `/api/creators/${creatorId}`)).json?.profile as { packages: Array<{ id: string }> };
    const packageId = packages.packages[0].id;

    const created = await call(
      'POST',
      '/api/projects',
      {
        title: 'Integration booking', contentType: 'Brand campaign', services: 'photography', budgetCents: 200000,
        neighborhood: 'Venice', locationDetail: '', styleTags: [], preferredDates: [], description: 'Testing the flow.',
        visibility: 'invite', invites: [{ creatorId, packageId }],
      },
      customer.cookie,
    );
    assert.equal(created.status, 201);
    const project = created.json?.project as { id: string; status: string };
    assert.equal(project.status, 'recruiting');

    const early = await call('POST', `/api/projects/${project.id}/send`, {}, customer.cookie);
    assert.equal(early.status, 409);
    assert.equal(early.json?.code, 'MEMBER_NOT_ACCEPTED');

    const accepted = await call('POST', `/api/projects/${project.id}/respond`, { action: 'accept', ...POLICY_ACCEPTANCE }, creator.cookie);
    assert.equal(accepted.status, 200);

    const sent = await call('POST', `/api/projects/${project.id}/send`, {}, customer.cookie);
    assert.equal(sent.status, 200);
    const pending = (sent.json?.project as { pending: { id: string; approvers: Array<{ userId: string }> } }).pending;
    assert.equal(pending.approvers.length, 2);

    await call('POST', `/api/projects/${project.id}/versions/${pending.id}/approve`, {}, creator.cookie);
    const agreed = await call('POST', `/api/projects/${project.id}/versions/${pending.id}/approve`, {}, customer.cookie);
    assert.equal((agreed.json?.project as { status: string }).status, 'agreed');

    // $900 package + 8% fee = $972. Deposit 30% = $291.60.
    const checkout = await call('POST', `/api/projects/${project.id}/checkout`, { kind: 'deposit', ...POLICY_ACCEPTANCE }, customer.cookie);
    assert.equal(checkout.status, 200);
    assert.equal(checkout.json?.amountCents, 29160);
    assert.equal(checkout.json?.mode, 'demo');
    const paymentId = (checkout.json?.payment as { id: string }).id;

    const confirmed = await call('POST', `/api/payments/${paymentId}/demo-confirm`, {}, customer.cookie);
    assert.equal(confirmed.status, 200);
    assert.equal((confirmed.json?.project as { status: string }).status, 'booked');

    // The shoot is about 21 days out, so the 72-hour guarantee applies: a full refund of everything paid, fee included.
    const cancelled = await call('POST', `/api/projects/${project.id}/cancel`, { reason: 'Client changed plans' }, customer.cookie);
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.json?.alreadyCancelled, false);
    const refund = cancelled.json?.refund as { status: string; approvedCents: number; refundedCents: number; qualifies72h: boolean };
    assert.equal(refund.status, 'refunded');
    assert.equal(refund.approvedCents, 29160);
    assert.equal(refund.refundedCents, 29160);
    assert.equal(refund.qualifies72h, true);
    assert.equal((cancelled.json?.project as { status: string }).status, 'cancelled');

    // A repeated cancellation changes nothing and refunds nothing again.
    const repeated = await call('POST', `/api/projects/${project.id}/cancel`, { reason: 'Client changed plans' }, customer.cookie);
    assert.equal(repeated.status, 200);
    assert.equal(repeated.json?.alreadyCancelled, true);
    const payments = (repeated.json?.project as { payments: Array<{ kind: string; status: string; amountCents: number }> }).payments;
    assert.equal(payments.filter((p) => p.kind === 'refund').length, 1);
  });

  it('blocks reviews until a project is completed and only accepted team members can review', async () => {
    const customer = await call('POST', '/api/auth/signup/customer', {
      name: 'Review Client', email: 'review.client@example.com', password: PASSWORD, confirmPassword: PASSWORD,
      customerType: 'individual', businessName: '', neighborhood: '', interests: [], bio: '', acceptTerms: true,
    });
    const creator = await signupCreator('review.creator@example.com', 60000);
    const draft = await call(
      'POST',
      '/api/projects',
      {
        title: 'Review gate', contentType: 'Other', services: 'photography', budgetCents: 100000,
        neighborhood: 'Venice', locationDetail: '', styleTags: [], preferredDates: [], description: '',
        visibility: 'invite', invites: [],
      },
      customer.cookie,
    );
    const projectId = (draft.json?.project as { id: string }).id;
    const review = {
      revieweeId: 'nobody',
      communication: 5, reliability: 5, professionalism: 5, quality: 5, expectationsMet: true,
      body: 'Twenty characters or more for this review.',
    };
    const reply = await call('POST', `/api/projects/${projectId}/reviews`, review, customer.cookie);
    assert.equal(reply.status, 409);
    assert.equal(reply.json?.code, 'REVIEW_NOT_ELIGIBLE');
    const stranger = await call('POST', `/api/projects/${projectId}/reviews`, review, creator.cookie);
    assert.equal(stranger.status, 403);
  });
});
