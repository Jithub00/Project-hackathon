import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { get, nowIso, type Db } from '../db';
import { HttpError, parseBody, route } from '../http';
import { readCookie, requireUser, SESSION_COOKIE, sessionKeyFor, userFromToken, type AuthUser } from '../auth';
import * as messaging from '../domain/messaging';
import { MessageHub, sseFrame } from '../messaging/hub';
import { requireAllowedOrigin } from '../messaging/origin';
import type { MessagingGuards } from '../messaging/limits';
import {
  CLIENT_ID_PATTERN,
  INBOX_PAGE_SIZE,
  REPORT_DETAILS_MAX_CHARS,
  REPORT_MAX_MESSAGES,
  REPORT_REASONS,
  THREAD_PAGE_SIZE,
} from '../../shared/messaging';

export interface MessagingDeps {
  db: Db;
  hub: MessageHub;
  guards: MessagingGuards;
  allowedOrigins: readonly string[];
  /** How often an open stream re-checks its session. Defaults to 30 seconds. Shortened by tests. */
  streamRevalidateMs?: number;
}

const STREAM_HEARTBEAT_MS = 25_000;
const STREAM_REVALIDATE_MS = 30_000;
const MAX_INT = Number.MAX_SAFE_INTEGER;

const sendSchema = z
  .object({
    clientId: z.string().regex(CLIENT_ID_PATTERN, 'Message reference is not valid.'),
    body: z.string({ error: 'Write a message before sending.' }),
  })
  .strict();

const readSchema = z
  .object({
    throughSeq: z.number().int().min(0).max(MAX_INT),
  })
  .strict();

const blockSchema = z
  .object({
    userId: z.string().min(1).max(64),
  })
  .strict();

const reportSchema = z
  .object({
    conversationId: z.string().min(1).max(64),
    reason: z.enum(REPORT_REASONS, { error: 'Choose a reason for the report.' }),
    details: z.string().max(REPORT_DETAILS_MAX_CHARS, `Keep the explanation under ${REPORT_DETAILS_MAX_CHARS} characters.`).default(''),
    messageIds: z
      .array(z.string().min(1).max(64))
      .min(1, 'Select at least one message.')
      .max(REPORT_MAX_MESSAGES, `Select up to ${REPORT_MAX_MESSAGES} messages.`),
  })
  .strict();

function viewerOf(req: Request): AuthUser {
  return req.user as AuthUser;
}

function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie');
  next();
}

/** Reads an optional integer query parameter. Anything outside the range is rejected rather than clamped. */
function intParam(raw: unknown, range: { min: number; max: number }): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  if (typeof raw !== 'string' || !Number.isInteger(value) || value < range.min || value > range.max) {
    throw new HttpError(400, 'That page request is not valid.', 'VALIDATION');
  }
  return value;
}

function consume(res: Response, limiter: MessagingGuards['sends'], key: string, message: string): void {
  const result = limiter.attempt(key);
  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfterSeconds));
    throw new HttpError(429, `${message} Try again in ${result.retryAfterSeconds} seconds.`, 'RATE_LIMITED');
  }
}

function publishNewMessage(deps: MessagingDeps, outcome: messaging.SendOutcome): void {
  for (const viewerId of [outcome.senderId, outcome.recipientId]) {
    deps.hub.publish([viewerId], 'message', {
      conversation: messaging.conversationSummary(deps.db, viewerId, outcome.conversationId),
      unreadTotal: messaging.unreadTotalFor(deps.db, viewerId),
      message: messaging.toDirectMessage(outcome.row, viewerId),
    });
  }
}

function publishConversationState(deps: MessagingDeps, conversation: messaging.ConversationRow | undefined): void {
  if (!conversation) return;
  for (const viewerId of [conversation.user_low_id, conversation.user_high_id]) {
    deps.hub.publish([viewerId], 'conversation', {
      conversation: messaging.conversationSummary(deps.db, viewerId, conversation.id),
      unreadTotal: messaging.unreadTotalFor(deps.db, viewerId),
    });
  }
}

function sendHandler(deps: MessagingDeps, target: (req: Request) => messaging.SendTarget) {
  return route((req, res) => {
    const viewer = viewerOf(req);
    const input = parseBody(sendSchema, req.body);
    consume(res, deps.guards.sends, viewer.id, 'You are sending messages quickly.');
    const outcome = messaging.sendDirectMessage(deps.db, viewer.id, target(req), input, () =>
      consume(res, deps.guards.starts, viewer.id, 'You have started several new conversations recently.'),
    );
    const created = !outcome.duplicate;
    // Only a newly saved message is published. A replayed request gets the stored message back without an event.
    if (created) publishNewMessage(deps, outcome);
    res.status(created ? 201 : 200).json({
      created,
      conversationCreated: outcome.conversationCreated,
      conversation: messaging.conversationSummary(deps.db, viewer.id, outcome.conversationId),
      message: messaging.toDirectMessage(outcome.row, viewer.id),
    });
  });
}

/** Every messaging route. Requests without a valid session receive 401 and no data. */
export function createMessagingRouter(deps: MessagingDeps): express.Router {
  const { db, hub } = deps;
  // Every event checks the session first, so a revoked or expired session stops receiving messages immediately.
  hub.setSessionCheck((sessionKey) => Boolean(get(db, 'SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ?', sessionKey, nowIso())));
  const router = express.Router();
  router.use(noStore);
  router.use(requireAllowedOrigin(deps.allowedOrigins));
  router.use(requireUser);

  router.get('/conversations', route((req, res) => {
    const viewer = viewerOf(req);
    res.json(
      messaging.listConversations(db, viewer.id, {
        before: intParam(req.query.before, { min: 1, max: MAX_INT }),
        limit: intParam(req.query.limit, { min: 1, max: 100 }) ?? INBOX_PAGE_SIZE,
      }),
    );
  }));

  router.get('/unread', route((req, res) => {
    res.json(messaging.unreadSummary(db, viewerOf(req).id));
  }));

  router.get('/with/:userId', route((req, res) => {
    res.json(messaging.messagingStatusWith(db, viewerOf(req).id, String(req.params.userId)));
  }));

  router.post('/with/:userId/messages', sendHandler(deps, (req) => ({ recipientId: String(req.params.userId) })));

  router.get('/conversations/:id', route((req, res) => {
    res.json({ conversation: messaging.conversationSummary(db, viewerOf(req).id, String(req.params.id)) });
  }));

  router.get('/conversations/:id/messages', route((req, res) => {
    const viewer = viewerOf(req);
    res.json(
      messaging.listMessages(db, viewer.id, String(req.params.id), {
        before: intParam(req.query.before, { min: 1, max: MAX_INT }),
        after: intParam(req.query.after, { min: 0, max: MAX_INT }),
        limit: intParam(req.query.limit, { min: 1, max: 100 }) ?? THREAD_PAGE_SIZE,
      }),
    );
  }));

  router.post('/conversations/:id/messages', sendHandler(deps, (req) => ({ conversationId: String(req.params.id) })));

  router.put('/conversations/:id/read', route((req, res) => {
    const viewer = viewerOf(req);
    const input = parseBody(readSchema, req.body);
    const result = messaging.markThreadRead(db, viewer.id, String(req.params.id), input.throughSeq);
    // Other tabs of the same account update their unread counts. The read itself is only recorded here.
    hub.publish([viewer.id], 'conversation', { conversation: result.conversation, unreadTotal: result.unreadTotal });
    res.json({ conversation: result.conversation, unreadTotal: result.unreadTotal });
  }));

  router.post('/blocks', route((req, res) => {
    const viewer = viewerOf(req);
    const input = parseBody(blockSchema, req.body);
    const conversation = messaging.blockUser(db, viewer.id, input.userId);
    publishConversationState(deps, conversation);
    res.status(201).json({
      blocked: true,
      conversation: conversation ? messaging.conversationSummary(db, viewer.id, conversation.id) : null,
    });
  }));

  router.delete('/blocks/:userId', route((req, res) => {
    const viewer = viewerOf(req);
    const conversation = messaging.unblockUser(db, viewer.id, String(req.params.userId));
    publishConversationState(deps, conversation);
    res.json({
      blocked: false,
      conversation: conversation ? messaging.conversationSummary(db, viewer.id, conversation.id) : null,
    });
  }));

  router.post('/reports', route((req, res) => {
    const viewer = viewerOf(req);
    const input = parseBody(reportSchema, req.body);
    consume(res, deps.guards.reports, viewer.id, 'You have filed several reports recently.');
    const report = messaging.createReport(db, viewer.id, input);
    res.status(201).json({ report });
  }));

  /**
   * Server-sent events for the signed-in account. The stream is authenticated by the session cookie,
   * carries no conversation id, and receives only events addressed to this account. It ends when the session
   * is revoked or expires (checked every 30 seconds) or when the account logs out.
   */
  router.get('/stream', (req, res) => {
    const viewer = viewerOf(req);
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) throw new HttpError(401, 'Sign in to continue.', 'AUTH_REQUIRED');
    if (hub.countFor(viewer.id) >= deps.guards.limits.streamsPerUser) {
      throw new HttpError(429, 'You have too many message windows open. Close one and try again.', 'RATE_LIMITED');
    }
    const sessionKey = sessionKeyFor(token);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let revalidate: ReturnType<typeof setInterval> | undefined;
    const stopTimers = () => {
      if (heartbeat) clearInterval(heartbeat);
      if (revalidate) clearInterval(revalidate);
    };
    const send = (event: string, data: unknown) => {
      if (!res.writableEnded) res.write(sseFrame(event, data));
    };
    const end = () => {
      stopTimers();
      if (!res.writableEnded) res.end();
    };

    const connectionId = hub.open({ userId: viewer.id, sessionKey, send, end });
    res.write('retry: 4000\n\n');
    send('ready', { serverTime: nowIso() });

    heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': keep-alive\n\n');
    }, STREAM_HEARTBEAT_MS);
    revalidate = setInterval(() => {
      const current = userFromToken(db, token);
      if (current?.id === viewer.id) return;
      hub.remove(connectionId);
      send('session-ended', {});
      end();
    }, deps.streamRevalidateMs ?? STREAM_REVALIDATE_MS);

    res.on('close', () => {
      hub.remove(connectionId);
      stopTimers();
    });
  });

  return router;
}

/** Moderation review. Available only to accounts with a moderators record. Everyone else gets 403. */
export function createModerationRouter(deps: { db: Db; allowedOrigins: readonly string[] }): express.Router {
  const router = express.Router();
  router.use(noStore);
  router.use(requireAllowedOrigin(deps.allowedOrigins));
  router.use(requireUser);
  router.get('/reports', route((req, res) => {
    const rawBefore = typeof req.query.before === 'string' && req.query.before !== '' ? req.query.before : undefined;
    if (rawBefore !== undefined && !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(rawBefore)) {
      throw new HttpError(400, 'That page request is not valid.', 'VALIDATION');
    }
    const limit = intParam(req.query.limit, { min: 1, max: 100 }) ?? 50;
    res.json(messaging.listReportsForModerator(deps.db, viewerOf(req).id, { before: rawBefore, limit }));
  }));
  return router;
}
