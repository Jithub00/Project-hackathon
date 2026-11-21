import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../app';
import { openDatabase, type Db } from '../db';
import { createPaymentProvider } from '../payments/provider';
import { MessageHub } from '../messaging/hub';
import { bootstrapStaffAccount } from '../domain/staff';
import type { MessagingLimits } from '../messaging/limits';

/**
 * Integration tests for private messaging, run against the real Express app over HTTP.
 * Each test account signs in with the session cookie that the API issues, exactly as a browser would.
 */

const PASSWORD = 'Test-Password-2026';
const MODERATOR_EMAIL = 'moderator.test@example.com';
const NIL_UUID = '00000000-0000-4000-8000-000000000000';

type Json = Record<string, unknown>;

interface Reply {
  status: number;
  body: Json;
  headers: Headers;
}

interface Account {
  id: string;
  email: string;
  cookie: string;
}

interface Harness {
  db: Db;
  hub: MessageHub;
  server: Server;
  base: string;
}

async function startHarness(messagingLimits?: Partial<MessagingLimits>, streamRevalidateMs?: number): Promise<Harness> {
  const db = openDatabase(':memory:');
  const hub = new MessageHub();
  const env = {
    PAYMENT_MODE: 'demo',
    MODERATOR_EMAILS: MODERATOR_EMAIL,
    STAFF_BOOTSTRAP_EMAIL: MODERATOR_EMAIL,
    STAFF_BOOTSTRAP_PASSWORD: PASSWORD,
  } as unknown as NodeJS.ProcessEnv;
  bootstrapStaffAccount(db, env);
  const app = createApp({
    db,
    provider: createPaymentProvider(env),
    env,
    uploadsDir: 'data/unit-uploads',
    hub,
    messagingLimits,
    streamRevalidateMs,
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return { db, hub, server, base: `http://127.0.0.1:${port}` };
}

async function stopHarness(harness: Harness): Promise<void> {
  harness.server.closeAllConnections();
  await new Promise<void>((resolve) => harness.server.close(() => resolve()));
  harness.db.close();
}

function sessionCookieFrom(headers: Headers): string | undefined {
  const setCookie = headers.get('set-cookie');
  return setCookie ? setCookie.split(';')[0] : undefined;
}

async function request(base: string, method: string, path: string, options: { body?: unknown; cookie?: string; headers?: Record<string, string> } = {}): Promise<Reply> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.cookie) headers.cookie = options.cookie;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Json) : {}, headers: res.headers };
}

async function signupAccount(base: string, role: 'customer' | 'creator', label: string): Promise<Account> {
  const email = `${label}.${Math.random().toString(36).slice(2, 10)}@example.com`;
  const body =
    role === 'customer'
      ? {
          name: `${label} Customer`,
          email,
          password: PASSWORD,
          confirmPassword: PASSWORD,
          customerType: 'individual',
          businessName: '',
          neighborhood: 'Silver Lake',
          interests: ['Social content'],
          bio: 'A customer account for messaging tests.',
          acceptTerms: true,
        }
      : {
          name: `${label} Creator`,
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
          packagePriceCents: 90000,
          bio: 'A creator account for messaging tests.',
          seekingClients: true,
          acceptTerms: true,
        };
  const path = role === 'customer' ? '/api/auth/signup/customer' : '/api/auth/signup/creator';
  const reply = await request(base, 'POST', path, { body });
  assert.equal(reply.status, 201, JSON.stringify(reply.body));
  const cookie = sessionCookieFrom(reply.headers);
  assert.ok(cookie, 'signup should set a session cookie');
  return { id: ((reply.body.user as Json).id as string), email, cookie };
}

interface StreamEvent {
  event: string;
  data: Json;
}

/** Reads server-sent events from a stream opened with a session cookie. */
class EventStream {
  readonly events: StreamEvent[] = [];
  ended = false;
  private readonly controller: AbortController;

  private constructor(controller: AbortController) {
    this.controller = controller;
  }

  static async open(base: string, cookie: string): Promise<{ status: number; stream?: EventStream; reply?: Json }> {
    const controller = new AbortController();
    const res = await fetch(`${base}/api/messages/stream`, { headers: { cookie }, signal: controller.signal });
    if (res.status !== 200) {
      const text = await res.text();
      return { status: res.status, reply: text ? (JSON.parse(text) as Json) : {} };
    }
    const stream = new EventStream(controller);
    void stream.read(res);
    return { status: 200, stream };
  }

  private async read(res: Response): Promise<void> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index = buffer.indexOf('\n\n');
        while (index >= 0) {
          this.handleFrame(buffer.slice(0, index));
          buffer = buffer.slice(index + 2);
          index = buffer.indexOf('\n\n');
        }
      }
    } catch {
      // Closing the stream aborts the read. That is expected.
    } finally {
      this.ended = true;
    }
  }

  private handleFrame(frame: string): void {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length > 0) this.events.push({ event, data: JSON.parse(dataLines.join('\n')) as Json });
  }

  async waitFor(predicate: (event: StreamEvent) => boolean, timeoutMs = 5000): Promise<StreamEvent> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.events.find(predicate);
      if (found) return found;
      if (Date.now() > deadline) throw new Error('Timed out waiting for a stream event');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  async waitForEnd(timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!this.ended) {
      if (Date.now() > deadline) throw new Error('The stream did not end');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  close(): void {
    this.controller.abort();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('private messaging API', () => {
  let harness: Harness;
  let base: string;
  let a: Account;
  let b: Account;
  let c: Account;
  let d: Account;
  let moderator: Account;
  let conversationId: string;
  const streams: EventStream[] = [];

  const call = (method: string, path: string, options?: { body?: unknown; cookie?: string; headers?: Record<string, string> }) =>
    request(base, method, path, options);

  before(async () => {
    harness = await startHarness({ sendsPerMinute: 500, conversationStartsPerHour: 100, streamsPerUser: 5 });
    base = harness.base;
    a = await signupAccount(base, 'customer', 'alex');
    b = await signupAccount(base, 'creator', 'ben');
    c = await signupAccount(base, 'customer', 'casey');
    d = await signupAccount(base, 'creator', 'dana');
    // The reviewer account is created at startup from the bootstrap settings. It is never created by sign-up.
    const staffLogin = await request(base, 'POST', '/api/auth/login', { body: { email: MODERATOR_EMAIL, password: PASSWORD } });
    assert.equal(staffLogin.status, 200, JSON.stringify(staffLogin.body));
    moderator = {
      id: (staffLogin.body.user as Json).id as string,
      email: MODERATOR_EMAIL,
      cookie: sessionCookieFrom(staffLogin.headers) as string,
    };
  });

  after(async () => {
    for (const stream of streams) stream.close();
    await stopHarness(harness);
  });

  it('answers signed-out requests with 401 and no private data', async () => {
    const inbox = await call('GET', '/api/messages/conversations');
    assert.equal(inbox.status, 401);
    assert.equal(inbox.body.code, 'AUTH_REQUIRED');
    assert.equal('conversations' in inbox.body, false);

    const thread = await call('GET', `/api/messages/conversations/${NIL_UUID}/messages`);
    assert.equal(thread.status, 401);

    const stream = await call('GET', '/api/messages/stream');
    assert.equal(stream.status, 401);
    assert.equal(stream.headers.get('cache-control'), 'private, no-store');

    const unread = await call('GET', '/api/messages/unread');
    assert.equal(unread.status, 401);
  });

  it('creates one conversation with the first message and shows it to both people', async () => {
    const sent = await call('POST', `/api/messages/with/${b.id}/messages`, {
      cookie: a.cookie,
      body: { clientId: 'client-first-0001', body: 'Hello Ben, are you free in March?' },
    });
    assert.equal(sent.status, 201);
    assert.equal(sent.body.created, true);
    const message = sent.body.message as Json;
    assert.equal(message.clientId, 'client-first-0001', 'the sender sees their own client id');
    conversationId = (sent.body.conversation as Json).id as string;

    const inboxB = await call('GET', '/api/messages/conversations', { cookie: b.cookie });
    const itemB = (inboxB.body.conversations as Json[])[0];
    assert.equal(itemB.id, conversationId);
    assert.equal(itemB.unreadCount, 1);
    assert.equal((itemB.other as Json).id, a.id);
    assert.equal(itemB.latestSeq, (message.seq as number));
    assert.equal(((itemB.lastMessage as Json).preview as string), 'Hello Ben, are you free in March?');
    assert.equal(inboxB.body.unreadTotal, 1);

    const inboxA = await call('GET', '/api/messages/conversations', { cookie: a.cookie });
    assert.equal((inboxA.body.conversations as Json[])[0].unreadCount, 0, 'the sender has nothing unread');

    const threadForB = await call('GET', `/api/messages/conversations/${conversationId}/messages`, { cookie: b.cookie });
    const received = (threadForB.body.messages as Json[])[0];
    assert.equal(received.body, 'Hello Ben, are you free in March?');
    assert.equal('clientId' in received, false, 'the recipient never receives the sender client id');
  });

  it('returns the saved message for a repeated client id and rejects reuse with different text', async () => {
    const again = await call('POST', `/api/messages/with/${b.id}/messages`, {
      cookie: a.cookie,
      body: { clientId: 'client-first-0001', body: 'Hello Ben, are you free in March?' },
    });
    assert.equal(again.status, 200);
    assert.equal(again.body.created, false);
    const thread = await call('GET', `/api/messages/conversations/${conversationId}/messages`, { cookie: a.cookie });
    assert.equal((thread.body.messages as Json[]).length, 1, 'a retry never duplicates the message');

    const reused = await call('POST', `/api/messages/conversations/${conversationId}/messages`, {
      cookie: a.cookie,
      body: { clientId: 'client-first-0001', body: 'Different text' },
    });
    assert.equal(reused.status, 409);
    assert.equal(reused.body.code, 'CLIENT_ID_CONFLICT');
  });

  it('rejects empty, oversized and control-character messages on the server', async () => {
    const cases: Array<[string, string]> = [
      ['', 'EMPTY_MESSAGE'],
      ['   \n\t  ', 'EMPTY_MESSAGE'],
      ['a'.repeat(5001), 'MESSAGE_TOO_LONG'],
      ['bad\u0000text', 'INVALID_CHARACTERS'],
    ];
    for (const [index, [body, code]] of cases.entries()) {
      const reply = await call('POST', `/api/messages/conversations/${conversationId}/messages`, {
        cookie: a.cookie,
        body: { clientId: `client-invalid-${index}`, body },
      });
      assert.equal(reply.status, 400, `body case ${index}`);
      assert.equal(reply.body.code, code);
    }

    const boundary = await call('POST', `/api/messages/conversations/${conversationId}/messages`, {
      cookie: a.cookie,
      body: { clientId: 'client-boundary-01', body: 'a'.repeat(5000) },
    });
    assert.equal(boundary.status, 201, 'exactly 5,000 characters is allowed');

    const oversized = await call('POST', `/api/messages/conversations/${conversationId}/messages`, {
      cookie: a.cookie,
      body: { clientId: 'client-huge-000001', body: 'a'.repeat(40_000) },
    });
    assert.equal(oversized.status, 413);
    assert.equal(oversized.body.code, 'MESSAGE_TOO_LARGE');
  });

  it('takes the sender from the session and rejects attempts to set participants', async () => {
    const impersonate = await call('POST', `/api/messages/conversations/${conversationId}/messages`, {
      cookie: a.cookie,
      body: { clientId: 'client-spoof-0001', body: 'spoofed hello', senderId: b.id },
    });
    assert.equal(impersonate.status, 400);
    assert.equal(impersonate.body.code, 'VALIDATION');

    const retarget = await call('POST', `/api/messages/conversations/${conversationId}/messages`, {
      cookie: a.cookie,
      body: { clientId: 'client-spoof-0002', body: 'spoofed hello', conversationId: NIL_UUID },
    });
    assert.equal(retarget.status, 400);

    const thread = await call('GET', `/api/messages/conversations/${conversationId}/messages`, { cookie: b.cookie });
    assert.equal((thread.body.messages as Json[]).some((m) => m.body === 'spoofed hello'), false);
  });

  it('gives an outsider the same not-found response for someone else\'s conversation', async () => {
    const probes: Array<{ method: string; path: string; body?: unknown }> = [
      { method: 'GET', path: `/api/messages/conversations/${conversationId}` },
      { method: 'GET', path: `/api/messages/conversations/${conversationId}/messages` },
      { method: 'POST', path: `/api/messages/conversations/${conversationId}/messages`, body: { clientId: 'client-outsider-1', body: 'hi' } },
      { method: 'PUT', path: `/api/messages/conversations/${conversationId}/read`, body: { throughSeq: 1 } },
      { method: 'POST', path: '/api/messages/reports', body: { conversationId, reason: 'spam', details: '', messageIds: [NIL_UUID] } },
    ];
    const missing = await call('GET', `/api/messages/conversations/${NIL_UUID}`, { cookie: c.cookie });
    assert.equal(missing.status, 404);
    for (const probe of probes) {
      const reply = await call(probe.method, probe.path, { cookie: c.cookie, body: probe.body });
      assert.equal(reply.status, 404, `${probe.method} ${probe.path}`);
      assert.equal(reply.body.error, missing.body.error, 'outsiders cannot tell a private conversation from a missing one');
    }
    const inbox = await call('GET', '/api/messages/conversations', { cookie: c.cookie });
    assert.equal((inbox.body.conversations as Json[]).length, 0);
  });

  it('keeps read positions monotonic and never beyond the newest message', async () => {
    const readAll = await call('PUT', `/api/messages/conversations/${conversationId}/read`, {
      cookie: b.cookie,
      body: { throughSeq: 999_999_999 },
    });
    assert.equal(readAll.status, 200);
    const summary = readAll.body.conversation as Json;
    assert.equal(summary.unreadCount, 0);
    const latestSeq = summary.latestSeq as number;
    assert.equal(summary.lastReadSeq, latestSeq, 'the read position is clamped to the newest message');

    const earlier = await call('PUT', `/api/messages/conversations/${conversationId}/read`, { cookie: b.cookie, body: { throughSeq: 1 } });
    assert.equal((earlier.body.conversation as Json).lastReadSeq, latestSeq, 'the read position never moves backwards');

    const sent = await call('POST', `/api/messages/conversations/${conversationId}/messages`, {
      cookie: a.cookie,
      body: { clientId: 'client-unread-001', body: 'One more thing' },
    });
    assert.equal(sent.status, 201);
    const unread = await call('GET', '/api/messages/unread', { cookie: b.cookie });
    assert.equal(unread.body.total, 1);
    assert.equal((unread.body.byConversation as Json)[conversationId], 1);
  });

  it('rejects invalid read positions', async () => {
    const reply = await call('PUT', `/api/messages/conversations/${conversationId}/read`, { cookie: b.cookie, body: { throughSeq: -4 } });
    assert.equal(reply.status, 400);
    const text = await call('PUT', `/api/messages/conversations/${conversationId}/read`, { cookie: b.cookie, body: { throughSeq: 'two' } });
    assert.equal(text.status, 400);
  });

  it('blocks messages in both directions, keeps history, and restores messaging on unblock', async () => {
    const block = await call('POST', '/api/messages/blocks', { cookie: b.cookie, body: { userId: a.id } });
    assert.equal(block.status, 201);

    const alexSends = await call('POST', `/api/messages/with/${b.id}/messages`, {
      cookie: a.cookie,
      body: { clientId: 'client-blocked-01', body: 'Still there?' },
    });
    assert.equal(alexSends.status, 403);
    assert.equal(alexSends.body.code, 'MESSAGING_UNAVAILABLE');

    const benSends = await call('POST', `/api/messages/conversations/${conversationId}/messages`, {
      cookie: b.cookie,
      body: { clientId: 'client-blocked-02', body: 'No thanks' },
    });
    assert.equal(benSends.status, 403);

    const alexView = await call('GET', `/api/messages/conversations/${conversationId}`, { cookie: a.cookie });
    assert.equal(((alexView.body.conversation as Json).messaging as Json).reason, 'unavailable');
    const benView = await call('GET', `/api/messages/conversations/${conversationId}`, { cookie: b.cookie });
    assert.equal(((benView.body.conversation as Json).messaging as Json).reason, 'blocked-by-you');

    const history = await call('GET', `/api/messages/conversations/${conversationId}/messages`, { cookie: a.cookie });
    assert.ok((history.body.messages as Json[]).length >= 2, 'history stays available');

    // A new conversation is refused too.
    await call('POST', '/api/messages/blocks', { cookie: b.cookie, body: { userId: d.id } });
    const newAttempt = await call('POST', `/api/messages/with/${b.id}/messages`, {
      cookie: d.cookie,
      body: { clientId: 'client-blocked-03', body: 'Hello from dana' },
    });
    assert.equal(newAttempt.status, 403);
    const status = await call('GET', `/api/messages/with/${b.id}`, { cookie: d.cookie });
    assert.equal(status.body.conversationId, null, 'no conversation is created for a blocked pair');

    await call('DELETE', `/api/messages/blocks/${a.id}`, { cookie: b.cookie });
    const restored = await call('POST', `/api/messages/conversations/${conversationId}/messages`, {
      cookie: a.cookie,
      body: { clientId: 'client-restored-1', body: 'Back on?' },
    });
    assert.equal(restored.status, 201);
  });

  it('stores reports for moderators only, with the selected messages', async () => {
    const thread = await call('GET', `/api/messages/conversations/${conversationId}/messages`, { cookie: a.cookie });
    const first = (thread.body.messages as Json[])[0];

    const report = await call('POST', '/api/messages/reports', {
      cookie: a.cookie,
      body: { conversationId, reason: 'harassment', details: 'Repeated pressure', messageIds: [first.id] },
    });
    assert.equal(report.status, 201);
    const reportId = (report.body.report as Json).id as string;

    const foreign = await call('POST', '/api/messages/reports', {
      cookie: a.cookie,
      body: { conversationId, reason: 'spam', details: '', messageIds: [NIL_UUID] },
    });
    assert.equal(foreign.status, 400);
    assert.equal(foreign.body.code, 'INVALID_SELECTION');

    const reporterView = await call('GET', '/api/moderation/reports', { cookie: a.cookie });
    assert.equal(reporterView.status, 403, 'the reporter cannot read the moderation queue');
    const anonymous = await call('GET', '/api/moderation/reports');
    assert.equal(anonymous.status, 401);

    const queue = await call('GET', '/api/moderation/reports', { cookie: moderator.cookie });
    assert.equal(queue.status, 200);
    const found = (queue.body.reports as Json[]).find((r) => r.id === reportId);
    assert.ok(found, 'the moderator sees the report');
    assert.equal(found.reason, 'harassment');
    assert.equal(((found.evidence as Json[])[0]).body, first.body, 'the evidence is a copy of the selected message');
  });

  it('routes realtime events only to the two participants of a conversation', async () => {
    const streamA = await EventStream.open(base, a.cookie);
    const streamB = await EventStream.open(base, b.cookie);
    const streamC = await EventStream.open(base, c.cookie);
    assert.equal(streamA.status, 200);
    assert.equal(streamB.status, 200);
    assert.equal(streamC.status, 200);
    for (const stream of [streamA.stream, streamB.stream, streamC.stream]) {
      if (stream) streams.push(stream);
    }
    const alexStream = streamA.stream!;
    const benStream = streamB.stream!;
    const caseyStream = streamC.stream!;
    await alexStream.waitFor((e) => e.event === 'ready');

    const sent = await call('POST', `/api/messages/conversations/${conversationId}/messages`, {
      cookie: a.cookie,
      body: { clientId: 'client-live-00001', body: 'Live message' },
    });
    assert.equal(sent.status, 201);

    const onBen = await benStream.waitFor((e) => e.event === 'message' && (e.data.message as Json).body === 'Live message');
    assert.equal((onBen.data.conversation as Json).id, conversationId);
    const onAlex = await alexStream.waitFor((e) => e.event === 'message' && (e.data.message as Json).body === 'Live message');
    assert.equal(((onAlex.data.message as Json).clientId as string), 'client-live-00001');

    await sleep(500);
    const leaked = caseyStream.events.some((e) => JSON.stringify(e.data).includes(conversationId) || JSON.stringify(e.data).includes('Live message'));
    assert.equal(leaked, false, 'a non-participant never receives the conversation');
  });

  it('ends a session\'s streams on logout and refuses the old cookie afterwards', async () => {
    const opened = await EventStream.open(base, a.cookie);
    assert.equal(opened.status, 200);
    streams.push(opened.stream!);
    await opened.stream!.waitFor((e) => e.event === 'ready');

    const logout = await call('POST', '/api/auth/logout', { cookie: a.cookie, body: {} });
    assert.equal(logout.status, 200);
    await opened.stream!.waitForEnd();

    const after = await call('GET', '/api/messages/conversations', { cookie: a.cookie });
    assert.equal(after.status, 401);
  });

  it('replaces the previous session on sign-in and ends that session\'s streams', async () => {
    const opened = await EventStream.open(base, b.cookie);
    assert.equal(opened.status, 200);
    streams.push(opened.stream!);
    await opened.stream!.waitFor((e) => e.event === 'ready');

    // The browser still holds the old cookie when signing in again, so the API can end that session.
    const login = await call('POST', '/api/auth/login', { cookie: b.cookie, body: { email: b.email, password: PASSWORD } });
    assert.equal(login.status, 200);
    const fresh = sessionCookieFrom(login.headers);
    assert.ok(fresh && fresh !== b.cookie);

    await opened.stream!.waitForEnd();
    const old = await call('GET', '/api/messages/conversations', { cookie: b.cookie });
    assert.equal(old.status, 401);
    const current = await call('GET', '/api/messages/conversations', { cookie: fresh });
    assert.equal(current.status, 200);
    b = { ...b, cookie: fresh };
  });

  it('refuses requests from origins that are not allowed', async () => {
    const host = new URL(base).host;
    const same = await call('GET', '/api/messages/conversations', { cookie: b.cookie, headers: { origin: `http://${host}` } });
    assert.equal(same.status, 200);
    const foreign = await call('GET', '/api/messages/conversations', { cookie: b.cookie, headers: { origin: 'https://evil.example' } });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.body.code, 'ORIGIN_NOT_ALLOWED');
  });

  it('pages through long threads: newest first, then older pages in order', async () => {
    const pairStart = await signupAccount(base, 'customer', 'paging');
    const pairEnd = await signupAccount(base, 'creator', 'pager');
    for (let i = 0; i < 35; i += 1) {
      const reply = await call('POST', `/api/messages/with/${pairEnd.id}/messages`, {
        cookie: pairStart.cookie,
        body: { clientId: `client-page-${String(i).padStart(4, '0')}`, body: `Message ${i + 1}` },
      });
      assert.equal(reply.status, 201, `message ${i + 1}`);
    }
    const inbox = await call('GET', '/api/messages/conversations', { cookie: pairEnd.cookie });
    const threadId = (inbox.body.conversations as Json[])[0].id as string;

    const newest = await call('GET', `/api/messages/conversations/${threadId}/messages`, { cookie: pairEnd.cookie });
    const newestMessages = newest.body.messages as Json[];
    assert.equal(newestMessages.length, 30);
    assert.equal(newest.body.hasMore, true);
    assert.equal(newestMessages[29].body, 'Message 35');
    const seqs = newestMessages.map((m) => m.seq as number);
    assert.deepEqual(seqs, [...seqs].sort((x, y) => x - y), 'messages are in stable ascending order');

    const older = await call('GET', `/api/messages/conversations/${threadId}/messages?before=${seqs[0]}`, { cookie: pairEnd.cookie });
    const olderMessages = older.body.messages as Json[];
    assert.equal(olderMessages.length, 5);
    assert.equal(older.body.hasMore, false);
    assert.equal(olderMessages[0].body, 'Message 1');
    assert.equal(olderMessages[4].body, 'Message 5');

    const badPage = await call('GET', `/api/messages/conversations/${threadId}/messages?before=abc`, { cookie: pairEnd.cookie });
    assert.equal(badPage.status, 400);
  });
});

describe('private messaging stream revocation', () => {
  let harness: Harness;
  let base: string;

  before(async () => {
    // Re-check open streams every 100 ms, so the test does not wait for the 30-second production interval.
    harness = await startHarness(undefined, 100);
    base = harness.base;
  });

  after(async () => {
    await stopHarness(harness);
  });

  it('ends a live stream when its session is revoked on the server', async () => {
    const user = await signupAccount(base, 'customer', 'revoked');
    const opened = await EventStream.open(base, user.cookie);
    assert.equal(opened.status, 200);
    const stream = opened.stream!;
    try {
      await stream.waitFor((event) => event.event === 'ready');
      // Revoke the session directly, as a sign-out elsewhere or an administrator would.
      harness.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
      await stream.waitFor((event) => event.event === 'session-ended', 3000);
      await stream.waitForEnd(3000);
    } finally {
      stream.close();
    }
  });

  it('ends a live stream when its session has expired', async () => {
    const user = await signupAccount(base, 'customer', 'expired');
    const opened = await EventStream.open(base, user.cookie);
    assert.equal(opened.status, 200);
    const stream = opened.stream!;
    try {
      await stream.waitFor((event) => event.event === 'ready');
      harness.db.prepare('UPDATE sessions SET expires_at = ? WHERE user_id = ?').run('2000-01-01T00:00:00.000Z', user.id);
      await stream.waitFor((event) => event.event === 'session-ended', 3000);
      await stream.waitForEnd(3000);
      const after = await request(base, 'GET', '/api/messages/conversations', { cookie: user.cookie });
      assert.equal(after.status, 401);
    } finally {
      stream.close();
    }
  });
});

describe('private messaging limits', () => {
  let harness: Harness;
  let base: string;

  before(async () => {
    harness = await startHarness({ sendsPerMinute: 2, conversationStartsPerHour: 1, streamsPerUser: 1 });
    base = harness.base;
  });

  after(async () => {
    await stopHarness(harness);
  });

  it('limits how many messages an account can send in a minute, with a retry hint', async () => {
    const sender = await signupAccount(base, 'customer', 'sender');
    const target = await signupAccount(base, 'creator', 'target');
    const first = await request(base, 'POST', `/api/messages/with/${target.id}/messages`, {
      cookie: sender.cookie,
      body: { clientId: 'client-limit-0001', body: 'one' },
    });
    assert.equal(first.status, 201);
    const second = await request(base, 'POST', `/api/messages/conversations/${(first.body.conversation as Json).id}/messages`, {
      cookie: sender.cookie,
      body: { clientId: 'client-limit-0002', body: 'two' },
    });
    assert.equal(second.status, 201);
    const third = await request(base, 'POST', `/api/messages/conversations/${(first.body.conversation as Json).id}/messages`, {
      cookie: sender.cookie,
      body: { clientId: 'client-limit-0003', body: 'three' },
    });
    assert.equal(third.status, 429);
    assert.equal(third.body.code, 'RATE_LIMITED');
    assert.match(third.body.error as string, /Try again in \d+ seconds/);
    assert.ok(Number(third.headers.get('retry-after')) >= 1);
  });

  it('limits how many new conversations an account can start', async () => {
    const starter = await signupAccount(base, 'customer', 'starter');
    const one = await signupAccount(base, 'creator', 'first');
    const two = await signupAccount(base, 'creator', 'second');
    const ok = await request(base, 'POST', `/api/messages/with/${one.id}/messages`, {
      cookie: starter.cookie,
      body: { clientId: 'client-start-0001', body: 'hello one' },
    });
    assert.equal(ok.status, 201);
    const refused = await request(base, 'POST', `/api/messages/with/${two.id}/messages`, {
      cookie: starter.cookie,
      body: { clientId: 'client-start-0002', body: 'hello two' },
    });
    assert.equal(refused.status, 429);
    assert.match(refused.body.error as string, /new conversations/);
    const status = await request(base, 'GET', `/api/messages/with/${two.id}`, { cookie: starter.cookie });
    assert.equal(status.body.conversationId, null, 'a refused start leaves no conversation behind');
  });

  it('limits open message streams per account', async () => {
    const listener = await signupAccount(base, 'creator', 'listener');
    const first = await EventStream.open(base, listener.cookie);
    assert.equal(first.status, 200);
    const second = await EventStream.open(base, listener.cookie);
    assert.equal(second.status, 429);
    first.stream!.close();
  });
});

describe('private messaging protections', () => {
  let harness: Harness;
  let base: string;

  before(async () => {
    harness = await startHarness({ reportsPerHour: 2 });
    base = harness.base;
  });

  after(async () => {
    await stopHarness(harness);
  });

  it('refuses a sign-up with a reviewer address, so the address cannot be claimed ahead of its owner', async () => {
    const reply = await request(base, 'POST', '/api/auth/signup/customer', {
      body: {
        name: 'Impostor',
        email: MODERATOR_EMAIL,
        password: PASSWORD,
        confirmPassword: PASSWORD,
        customerType: 'individual',
        businessName: '',
        neighborhood: 'Silver Lake',
        interests: ['Social content'],
        bio: 'Trying to claim a reviewer address.',
        acceptTerms: true,
      },
    });
    assert.equal(reply.status, 409);
    assert.equal(reply.body.code, 'EMAIL_RESERVED');
    const staff = await request(base, 'POST', '/api/auth/login', { body: { email: MODERATOR_EMAIL, password: PASSWORD } });
    assert.equal(staff.status, 200);
    const queue = await request(base, 'GET', '/api/moderation/reports', { cookie: sessionCookieFrom(staff.headers) });
    assert.equal(queue.status, 200);
  });

  it('treats a malformed session cookie as signed out rather than failing the request', async () => {
    const config = await request(base, 'GET', '/api/config', { cookie: 'ps_session=%E0%A4%A' });
    assert.equal(config.status, 200);
    const inbox = await request(base, 'GET', '/api/messages/conversations', { cookie: 'ps_session=%E0%A4%A' });
    assert.equal(inbox.status, 401);
  });

  it('ends the other sessions and streams of an account when its password changes', async () => {
    const owner = await signupAccount(base, 'customer', 'rotating');
    const login = await request(base, 'POST', '/api/auth/login', { body: { email: owner.email, password: PASSWORD } });
    assert.equal(login.status, 200);
    const elsewhere = sessionCookieFrom(login.headers) as string;
    const opened = await EventStream.open(base, elsewhere);
    assert.equal(opened.status, 200);
    const stream = opened.stream!;
    try {
      await stream.waitFor((event) => event.event === 'ready');
      const change = await request(base, 'POST', '/api/me/password', {
        cookie: owner.cookie,
        body: { currentPassword: PASSWORD, newPassword: 'Changed-Password-2026', confirmPassword: 'Changed-Password-2026' },
      });
      assert.equal(change.status, 200, JSON.stringify(change.body));
      await stream.waitForEnd(3000);
      const stale = await request(base, 'GET', '/api/messages/conversations', { cookie: elsewhere });
      assert.equal(stale.status, 401);
      const current = await request(base, 'GET', '/api/messages/conversations', { cookie: owner.cookie });
      assert.equal(current.status, 200);
    } finally {
      stream.close();
    }
  });

  it('stops a revoked session receiving messages at once, without waiting for the periodic check', async () => {
    const sender = await signupAccount(base, 'customer', 'sender-revoke');
    const recipient = await signupAccount(base, 'creator', 'recipient-revoke');
    const opened = await EventStream.open(base, recipient.cookie);
    assert.equal(opened.status, 200);
    const stream = opened.stream!;
    try {
      await stream.waitFor((event) => event.event === 'ready');
      harness.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(recipient.id);
      const sent = await request(base, 'POST', `/api/messages/with/${recipient.id}/messages`, {
        cookie: sender.cookie,
        body: { clientId: 'client-revoked-01', body: 'Sent after the session was revoked' },
      });
      assert.equal(sent.status, 201);
      await stream.waitForEnd(1500);
      assert.equal(stream.events.some((event) => JSON.stringify(event.data).includes('Sent after the session was revoked')), false);
    } finally {
      stream.close();
    }
  });

  it('rejects a whitespace-heavy message quickly instead of stalling the server', async () => {
    const left = await signupAccount(base, 'customer', 'spacer');
    const right = await signupAccount(base, 'creator', 'spaced');
    const started = Date.now();
    const reply = await request(base, 'POST', `/api/messages/with/${right.id}/messages`, {
      cookie: left.cookie,
      body: { clientId: 'client-spaces-0001', body: `a${' '.repeat(30_000)}b` },
    });
    const elapsed = Date.now() - started;
    assert.equal(reply.status, 400);
    assert.equal(reply.body.code, 'MESSAGE_TOO_LONG');
    assert.ok(elapsed < 1000, `the request took ${elapsed} ms`);
  });

  it('limits how many reports one account can file, and pages the moderator queue', async () => {
    const reporter = await signupAccount(base, 'customer', 'reporter-page');
    const other = await signupAccount(base, 'creator', 'reported-page');
    const first = await request(base, 'POST', `/api/messages/with/${other.id}/messages`, {
      cookie: reporter.cookie,
      body: { clientId: 'client-report-00001', body: 'Please review this message' },
    });
    assert.equal(first.status, 201);
    const conversationId = (first.body.conversation as Json).id as string;
    const messageId = (first.body.message as Json).id as string;
    for (let i = 0; i < 2; i += 1) {
      const filed = await request(base, 'POST', '/api/messages/reports', {
        cookie: reporter.cookie,
        body: { conversationId, reason: 'spam', details: `Report ${i + 1}`, messageIds: [messageId] },
      });
      assert.equal(filed.status, 201, JSON.stringify(filed.body));
      await sleep(5);
    }
    const refused = await request(base, 'POST', '/api/messages/reports', {
      cookie: reporter.cookie,
      body: { conversationId, reason: 'spam', details: 'One too many', messageIds: [messageId] },
    });
    assert.equal(refused.status, 429);
    assert.equal(refused.body.code, 'RATE_LIMITED');

    const staff = await request(base, 'POST', '/api/auth/login', { body: { email: MODERATOR_EMAIL, password: PASSWORD } });
    const staffCookie = sessionCookieFrom(staff.headers);
    const firstPage = await request(base, 'GET', '/api/moderation/reports?limit=1', { cookie: staffCookie });
    assert.equal(firstPage.status, 200);
    const page1 = firstPage.body as { reports: Json[]; nextBefore: string | null };
    assert.equal(page1.reports.length, 1);
    assert.ok(page1.nextBefore, 'a second page exists');
    const secondPage = await request(base, 'GET', `/api/moderation/reports?limit=1&before=${encodeURIComponent(page1.nextBefore as string)}`, {
      cookie: staffCookie,
    });
    const page2 = secondPage.body as { reports: Json[]; nextBefore: string | null };
    assert.equal(page2.reports.length, 1);
    assert.notEqual(page2.reports[0].id, page1.reports[0].id);
    const badCursor = await request(base, 'GET', '/api/moderation/reports?before=yesterday', { cookie: staffCookie });
    assert.equal(badCursor.status, 400);
  });
});
