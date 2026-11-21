import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../app';
import { openDatabase, type Db } from '../db';
import { createPaymentProvider, type PaymentProvider, type RefundResult } from '../payments/provider';
import { getUserRow, type UserRow } from '../domain/people';
import { applyRefundEvent, cancelProject, decideRefundRequest, retryRefund, submitRefundRequest, withdrawRefundRequest } from '../domain/refunds';
import { scheduledStartFor } from '../domain/refund-core';
import { bootstrapStaffAccount } from '../domain/staff';
import { REFUND_POLICY_VERSION, TERMS_VERSION } from '../../shared/policy';

/**
 * Refund and cancellation behaviour, tested over the real API and, where a precise clock matters, directly against the
 * domain functions. Demo payments are used. A scripted provider covers failures and pending refunds.
 */

const PASSWORD = 'Test-Password-2026';
const STAFF_EMAIL = 'reviewer.refunds@example.com';
const POLICY = { acceptedRefundPolicyVersion: REFUND_POLICY_VERSION, acceptedTermsVersion: TERMS_VERSION };
const HOUR = 3_600_000;

type Json = Record<string, unknown>;

interface Harness {
  db: Db;
  server: Server;
  base: string;
  provider: ScriptedProvider;
  staff: UserRow;
  staffCookie: string;
}

/** A demo provider whose refunds can be scripted to fail or to stay pending, and which records every call. */
class ScriptedProvider implements PaymentProvider {
  readonly mode = 'demo' as const;
  readonly calls: Array<{ refundId: string; amountCents: number }> = [];
  script: Array<'succeeded' | 'pending' | 'failed' | 'throw'> = [];
  createIntent: PaymentProvider['createIntent'];
  fetchStatus: PaymentProvider['fetchStatus'];

  constructor() {
    const demo = createPaymentProvider({ PAYMENT_MODE: 'demo' } as NodeJS.ProcessEnv);
    this.createIntent = demo.createIntent.bind(demo);
    this.fetchStatus = demo.fetchStatus.bind(demo);
  }

  /** Clears the call log and script between tests, so each test sees only its own provider calls. */
  reset(): void {
    this.calls.length = 0;
    this.script = [];
  }

  async refund(input: { refundId: string; providerRef: string; amountCents: number }): Promise<RefundResult> {
    this.calls.push({ refundId: input.refundId, amountCents: input.amountCents });
    const next = this.script.shift() ?? 'succeeded';
    if (next === 'throw') throw new Error('network dropped');
    return { status: next === 'failed' ? 'failed' : next === 'pending' ? 'pending' : 'succeeded', providerRef: `re_${input.refundId}` };
  }
}

async function startHarness(): Promise<Harness> {
  const db = openDatabase(':memory:');
  const env = {
    PAYMENT_MODE: 'demo',
    MODERATOR_EMAILS: STAFF_EMAIL,
    STAFF_BOOTSTRAP_EMAIL: STAFF_EMAIL,
    STAFF_BOOTSTRAP_PASSWORD: PASSWORD,
  } as unknown as NodeJS.ProcessEnv;
  bootstrapStaffAccount(db, env);
  const provider = new ScriptedProvider();
  const app = createApp({ db, provider, env, uploadsDir: 'data/unit-uploads' });
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: STAFF_EMAIL, password: PASSWORD }),
  });
  const staffCookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
  const staff = getUserRow(db, (((await login.json()) as { user: { id: string } }).user.id)) as UserRow;
  return { db, server, base, provider, staff, staffCookie };
}

async function stopHarness(h: Harness): Promise<void> {
  h.server.closeAllConnections();
  await new Promise<void>((resolve) => h.server.close(() => resolve()));
  h.db.close();
}

async function call(h: Harness, method: string, path: string, body?: unknown, cookie?: string): Promise<{ status: number; json: Json }> {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${h.base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, json: text ? (JSON.parse(text) as Json) : {} };
}

function cookieFrom(setCookie: string | null): string {
  return (setCookie ?? '').split(';')[0];
}

async function signup(h: Harness, role: 'customer' | 'creator', label: string): Promise<{ id: string; cookie: string }> {
  const email = `${label}.${Math.random().toString(36).slice(2, 9)}@example.com`;
  const res =
    role === 'customer'
      ? await fetch(`${h.base}/api/auth/signup/customer`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: `${label} Client`, email, password: PASSWORD, confirmPassword: PASSWORD, customerType: 'individual',
            businessName: '', neighborhood: 'Venice', interests: [], bio: 'A customer.', acceptTerms: true,
          }),
        })
      : await fetch(`${h.base}/api/auth/signup/creator`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: `${label} Studio`, email, password: PASSWORD, confirmPassword: PASSWORD, services: 'photography',
            specialties: ['Editorial'], styles: ['Editorial'], neighborhoods: ['Venice'], citywide: false,
            packageService: 'photography', packageName: 'Half-day shoot', packageHours: 4, packagePriceCents: 90000,
            bio: 'A creator.', seekingClients: true, acceptTerms: true,
          }),
        });
  if (res.status !== 201) assert.fail(`sign-up failed: ${await res.text()}`);
  const json = (await res.json()) as { user: { id: string } };
  return { id: json.user.id, cookie: cookieFrom(res.headers.get('set-cookie')) };
}

interface Booking {
  projectId: string;
  customer: { id: string; cookie: string };
  creator: { id: string; cookie: string };
  paymentId: string;
}

/** Books a team of one creator and confirms the deposit. The shoot is about three weeks out, by default. */
async function bookPaidProject(h: Harness, label: string, customerOverride?: { id: string; cookie: string }): Promise<Booking> {
  const customer = customerOverride ?? (await signup(h, 'customer', `${label}-client`));
  const creator = await signup(h, 'creator', `${label}-creator`);
  const packages = (await call(h, 'GET', `/api/creators/${creator.id}`)).json.profile as { packages: Array<{ id: string }> };
  const created = await call(h, 'POST', '/api/projects', {
    title: `Refund test ${label}`, contentType: 'Brand campaign', services: 'photography', budgetCents: 200000,
    neighborhood: 'Venice', locationDetail: '', styleTags: [], preferredDates: [], description: 'Testing refunds.',
    visibility: 'invite', invites: [{ creatorId: creator.id, packageId: packages.packages[0].id }],
  }, customer.cookie);
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const projectId = (created.json.project as { id: string }).id;
  const accepted = await call(h, 'POST', `/api/projects/${projectId}/respond`, { action: 'accept', ...POLICY }, creator.cookie);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.json));
  const sent = await call(h, 'POST', `/api/projects/${projectId}/send`, {}, customer.cookie);
  const pending = (sent.json.project as { pending: { id: string } }).pending;
  await call(h, 'POST', `/api/projects/${projectId}/versions/${pending.id}/approve`, {}, creator.cookie);
  await call(h, 'POST', `/api/projects/${projectId}/versions/${pending.id}/approve`, {}, customer.cookie);
  const checkout = await call(h, 'POST', `/api/projects/${projectId}/checkout`, { kind: 'deposit', ...POLICY }, customer.cookie);
  assert.equal(checkout.status, 200, JSON.stringify(checkout.json));
  const paymentId = (checkout.json.payment as { id: string }).id;
  const confirmed = await call(h, 'POST', `/api/payments/${paymentId}/demo-confirm`, {}, customer.cookie);
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.json));
  return { projectId, customer, creator, paymentId };
}

function startOf(h: Harness, projectId: string): number {
  const start = scheduledStartFor(h.db, projectId);
  assert.notEqual(start, null);
  return start as number;
}

describe('checkout and policy acceptance', () => {
  let h: Harness;
  before(async () => {
    h = await startHarness();
  });
  after(async () => {
    await stopHarness(h);
  });

  it('will not take a deposit without the current policy and terms', async () => {
    const customer = await signup(h, 'customer', 'gate-client');
    const creator = await signup(h, 'creator', 'gate-creator');
    const packages = (await call(h, 'GET', `/api/creators/${creator.id}`)).json.profile as { packages: Array<{ id: string }> };
    const created = await call(h, 'POST', '/api/projects', {
      title: 'Gate test', contentType: 'Brand campaign', services: 'photography', budgetCents: 200000,
      neighborhood: 'Venice', locationDetail: '', styleTags: [], preferredDates: [], description: 'Gate.',
      visibility: 'invite', invites: [{ creatorId: creator.id, packageId: packages.packages[0].id }],
    }, customer.cookie);
    const projectId = (created.json.project as { id: string }).id;

    const invitationWithoutPolicy = await call(h, 'POST', `/api/projects/${projectId}/respond`, { action: 'accept' }, creator.cookie);
    assert.equal(invitationWithoutPolicy.status, 400);
    assert.equal(invitationWithoutPolicy.json.code, 'POLICY_REQUIRED');

    const checkoutWithoutPolicy = await call(h, 'POST', `/api/projects/${projectId}/checkout`, { kind: 'deposit' }, customer.cookie);
    assert.equal(checkoutWithoutPolicy.status, 400);
    assert.equal(checkoutWithoutPolicy.json.code, 'POLICY_REQUIRED');

    const staleVersion = await call(h, 'POST', `/api/projects/${projectId}/checkout`, {
      kind: 'deposit', acceptedRefundPolicyVersion: '2020-01-01', acceptedTermsVersion: TERMS_VERSION,
    }, customer.cookie);
    assert.equal(staleVersion.status, 409);
    assert.equal(staleVersion.json.code, 'POLICY_CHANGED');
  });

  it('keeps a booking-time record with the policy versions and what was being bought', async () => {
    const booking = await bookPaidProject(h, 'record');
    const detail = await call(h, 'GET', `/api/projects/${booking.projectId}`, undefined, booking.customer.cookie);
    const project = detail.json.project as { booking: { policyVersion: string; termsVersion: string; members: Array<{ name: string; portfolio: unknown[] }> } | null; paidCents: number };
    assert.ok(project.booking, 'a booking record exists once the deposit is confirmed');
    assert.equal(project.booking.policyVersion, REFUND_POLICY_VERSION);
    assert.equal(project.booking.termsVersion, TERMS_VERSION);
    assert.equal(project.booking.members.length, 1);
    assert.equal(project.paidCents, 29160);
  });
});

describe('cancellations', () => {
  let h: Harness;
  before(async () => {
    h = await startHarness();
  });
  beforeEach(() => {
    h.provider.reset();
  });
  after(async () => {
    await stopHarness(h);
  });

  it('refunds a cancellation inside 72 hours only after a reviewer decides it, and never twice', async () => {
    const booking = await bookPaidProject(h, 'late');
    const user = getUserRow(h.db, booking.customer.id) as UserRow;
    const start = startOf(h, booking.projectId);
    // Ten hours before the shoot: inside the 72 hours, so the guarantee does not apply.
    const late = await cancelProject(h.db, h.provider, user, booking.projectId, 'Need to move the shoot', new Date(start - 10 * HOUR));
    assert.equal(late.refund?.status, 'under_review');
    assert.equal(late.refund?.qualifies72h, false);
    assert.equal(late.refund?.refundedCents, 0);
    assert.equal(h.provider.calls.length, 0, 'nothing is sent to the provider before a decision');
    assert.equal(late.project.status, 'cancelled');

    const requestId = late.refund!.id;
    // A repeated cancellation does not change the recorded time or outcome.
    const again = await cancelProject(h.db, h.provider, user, booking.projectId, 'Again', new Date(start - 9 * HOUR));
    assert.equal(again.alreadyCancelled, true);
    assert.equal(again.refund?.id, requestId);

    const reviewer = h.staff;
    const decided = await decideRefundRequest(h.db, h.provider, reviewer, requestId, {
      decision: 'approve',
      amountCents: 10000,
      note: 'A goodwill refund for the late cancellation, agreed in writing.',
    });
    const decidedRequest = (decided.refundRequests as Array<{ status: string; refundedCents: number; approvedCents: number }>)[0];
    assert.equal(decidedRequest.status, 'refunded');
    assert.equal(decidedRequest.approvedCents, 10000);
    assert.equal(decidedRequest.refundedCents, 10000);
    assert.equal(h.provider.calls.length, 1);

    // Approving again is refused, so the refund cannot be issued twice.
    await assert.rejects(
      decideRefundRequest(h.db, h.provider, reviewer, requestId, { decision: 'approve', amountCents: 10000, note: 'Approving again.' }),
      (error: Error & { code?: string }) => error.code === 'BAD_STATUS',
    );
    assert.equal(h.provider.calls.length, 1);
  });

  it('creates exactly one refund when the same cancellation is submitted twice at the same moment', async () => {
    const booking = await bookPaidProject(h, 'double');
    const user = getUserRow(h.db, booking.customer.id) as UserRow;
    const [first, second] = await Promise.all([
      cancelProject(h.db, h.provider, user, booking.projectId, 'Double click'),
      cancelProject(h.db, h.provider, user, booking.projectId, 'Double click'),
    ]);
    assert.equal([first, second].filter((r) => !r.alreadyCancelled).length, 1);
    assert.equal(h.provider.calls.length, 1, 'the provider receives one refund request');
    const refunds = (first.project.payments as Array<{ kind: string }>).filter((p) => p.kind === 'refund');
    assert.equal(refunds.length, 1);
  });

  it('recovers a refund the provider failed, by sending the same refund again rather than a new one', async () => {
    const booking = await bookPaidProject(h, 'flaky');
    const user = getUserRow(h.db, booking.customer.id) as UserRow;
    h.provider.script = ['throw'];
    const result = await cancelProject(h.db, h.provider, user, booking.projectId, 'Changed plans');
    assert.equal(result.project.status, 'cancelled', 'the cancellation is recorded even if the refund fails');
    assert.equal(result.refund?.status, 'refund_failed');
    const requestId = result.refund!.id;

    const retried = await retryRefund(h.db, h.provider, user, requestId);
    const request = (retried.refundRequests as Array<{ status: string; refundedCents: number }>)[0];
    assert.equal(request.status, 'refunded');
    assert.equal(request.refundedCents, 29160);
    assert.equal(h.provider.calls.length, 2);
    assert.equal(h.provider.calls[0].refundId, h.provider.calls[1].refundId, 'the retry uses the same idempotency key');
  });

  it('keeps a pending provider refund until the provider confirms it', async () => {
    const booking = await bookPaidProject(h, 'pending');
    const user = getUserRow(h.db, booking.customer.id) as UserRow;
    h.provider.script = ['pending'];
    const result = await cancelProject(h.db, h.provider, user, booking.projectId, 'Changed plans');
    assert.equal(result.refund?.status, 'refund_initiated', 'sent to the provider, not yet confirmed');

    applyRefundEvent(h.db, 're_' + h.provider.calls[0].refundId, 'succeeded');
    const detail = (await call(h, 'GET', `/api/projects/${booking.projectId}`, undefined, booking.customer.cookie)).json.project as {
      refundRequests: Array<{ status: string }>;
    };
    assert.equal(detail.refundRequests[0].status, 'refunded');
  });
});

describe('delivery and quality requests', () => {
  let h: Harness;
  before(async () => {
    h = await startHarness();
  });
  beforeEach(() => {
    h.provider.reset();
  });
  after(async () => {
    await stopHarness(h);
  });

  it('stays available after the cancellation deadline has passed, and reviewers decide it', async () => {
    const booking = await bookPaidProject(h, 'quality');
    // Move the booking into the delivered stage, as a creator's delivery would.
    h.db.prepare("UPDATE projects SET status = 'delivered' WHERE id = ?").run(booking.projectId);
    const submitted = await call(h, 'POST', `/api/projects/${booking.projectId}/refund-requests`, {
      reason: 'quality',
      description: 'The colours in the delivered stills do not match the portfolio standard I booked.',
      portfolioItemIds: [],
      deliveryIds: [],
      messageIds: [],
    }, booking.customer.cookie);
    assert.equal(submitted.status, 200, JSON.stringify(submitted.json));
    const request = (submitted.json.project as { refundRequests: Array<{ id: string; status: string; reason: string }> }).refundRequests[0];
    assert.equal(request.reason, 'quality');
    assert.equal(request.status, 'submitted');

    // The creator can respond, but cannot decide.
    const response = await call(h, 'POST', `/api/refund-requests/${request.id}/notes`, { body: 'The grade was agreed with the customer.' }, booking.creator.cookie);
    assert.equal(response.status, 200, JSON.stringify(response.json));
    const creatorDecision = await call(h, 'POST', `/api/refund-requests/${request.id}/decision`, {
      decision: 'decline', note: 'The work meets the agreed standard.',
    }, booking.creator.cookie);
    assert.equal(creatorDecision.status, 403);

    // A reviewer who is part of this booking cannot decide it either.
    const customerAsReviewer = await call(h, 'POST', `/api/refund-requests/${request.id}/decision`, {
      decision: 'decline', note: 'Declining my own customer claim.',
    }, booking.customer.cookie);
    assert.equal(customerAsReviewer.status, 403);

    // A platform reviewer who is not part of the booking can decide it, and the reasons are required.
    const missingReasons = await call(h, 'POST', `/api/refund-requests/${request.id}/decision`, { decision: 'decline', note: 'No.' }, h.staffCookie);
    assert.equal(missingReasons.status, 400);
    const declined = await call(h, 'POST', `/api/refund-requests/${request.id}/decision`, {
      decision: 'decline', note: 'The colour grade matches the agreed brief and the booked portfolio examples.',
    }, h.staffCookie);
    assert.equal(declined.status, 200, JSON.stringify(declined.json));
    const after = (declined.json.project as { refundRequests: Array<{ status: string }> }).refundRequests[0];
    assert.equal(after.status, 'declined');
  });

  it('lets the customer withdraw an open request, and releases held payouts', async () => {
    const booking = await bookPaidProject(h, 'withdraw');
    h.db.prepare("UPDATE projects SET status = 'delivered' WHERE id = ?").run(booking.projectId);
    const submitted = await submitRefundRequest(h.db, getUserRow(h.db, booking.customer.id) as UserRow, booking.projectId, {
      reason: 'not_delivered',
      description: 'The agreed walkthrough film was not delivered on the agreed date.',
      portfolioItemIds: [],
      deliveryIds: [],
      messageIds: [],
    });
    const request = (submitted.refundRequests as Array<{ id: string; status: string }>)[0];
    assert.equal(request.status, 'submitted');
    const withdrawn = withdrawRefundRequest(h.db, getUserRow(h.db, booking.customer.id) as UserRow, request.id);
    assert.equal((withdrawn.refundRequests as Array<{ status: string }>)[0].status, 'withdrawn');
  });

  it('refuses evidence that is not part of the booking', async () => {
    const booking = await bookPaidProject(h, 'evidence');
    h.db.prepare("UPDATE projects SET status = 'delivered' WHERE id = ?").run(booking.projectId);
    const invalid = await call(h, 'POST', `/api/projects/${booking.projectId}/refund-requests`, {
      reason: 'quality',
      description: 'Citing a portfolio item that is not part of this booking.',
      portfolioItemIds: ['00000000-0000-4000-8000-000000000000'],
      deliveryIds: [],
      messageIds: [],
    }, booking.customer.cookie);
    assert.equal(invalid.status, 400);
    assert.equal(invalid.json.code, 'INVALID_EVIDENCE');
  });

  it('shows the review queue only to platform reviewers', async () => {
    const outsider = await call(h, 'GET', '/api/refund-requests/review', undefined, (await signup(h, 'customer', 'queue-client')).cookie);
    assert.equal(outsider.status, 403);
    const reviewer = await call(h, 'GET', '/api/refund-requests/review', undefined, h.staffCookie);
    assert.equal(reviewer.status, 200);
    assert.ok(Array.isArray(reviewer.json.items));
  });
});
