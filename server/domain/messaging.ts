import { all, get, newId, nowIso, parseJsonArray, run, transaction, type Db } from '../db';
import { conflict, forbidden, HttpError, notFound } from '../http';
import { getUserRow, initialsFor, type UserRow } from './people';
import {
  INBOX_PAGE_SIZE,
  MESSAGING_UNAVAILABLE_COPY,
  previewOf,
  REPORT_MAX_MESSAGES,
  THREAD_PAGE_SIZE,
  checkMessageBody,
  type ConversationSummary,
  type DirectMessage,
  type MessageParticipant,
  type MessagingReason,
  type ReportReason,
} from '../../shared/messaging';

/**
 * Every query below carries the viewer's id in its WHERE clause, so a conversation, message or report outside the
 * viewer's own access is treated as missing. Requests for other people's data get the same 404 as a missing record.
 */

const NOT_AVAILABLE = 'This conversation is not available.';

export interface ConversationRow {
  id: string;
  user_low_id: string;
  user_high_id: string;
  created_at: string;
  latest_seq: number;
  last_message_at: string | null;
}

export interface MessageRow {
  seq: number;
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  client_id: string;
  created_at: string;
}

interface SummaryRow {
  id: string;
  user_low_id: string;
  user_high_id: string;
  created_at: string;
  latest_seq: number;
  last_message_at: string | null;
  other_id: string;
  other_name: string;
  other_role: 'customer' | 'creator';
  last_id: string | null;
  last_seq: number | null;
  last_sender_id: string | null;
  last_body: string | null;
  last_created_at: string | null;
  last_read_seq: number;
  unread_count: number;
}

interface BlockFlags {
  byViewer: boolean;
  byOther: boolean;
}

export function profileUrlFor(role: 'customer' | 'creator', userId: string): string {
  return role === 'creator' ? `/creators/${userId}` : `/customers/${userId}`;
}

export function participantFor(user: Pick<UserRow, 'id' | 'name' | 'role'>): MessageParticipant {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    initials: initialsFor(user.name),
    avatarUrl: null,
    profileUrl: profileUrlFor(user.role, user.id),
  };
}

export function toDirectMessage(row: MessageRow, viewerId: string): DirectMessage {
  const message: DirectMessage = {
    id: row.id,
    seq: row.seq,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  };
  // The client id only goes back to the sender, so their own outgoing bubble can be matched.
  if (row.sender_id === viewerId) message.clientId = row.client_id;
  return message;
}

export function otherParticipantId(row: ConversationRow, viewerId: string): string {
  return row.user_low_id === viewerId ? row.user_high_id : row.user_low_id;
}

function blockFlagsBetween(db: Db, viewerId: string, otherId: string): BlockFlags {
  const rows = all<{ blocker_id: string }>(
    db,
    'SELECT blocker_id FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
    viewerId,
    otherId,
    otherId,
    viewerId,
  );
  return {
    byViewer: rows.some((row) => row.blocker_id === viewerId),
    byOther: rows.some((row) => row.blocker_id === otherId),
  };
}

function blockFlagsForViewer(db: Db, viewerId: string): Map<string, BlockFlags> {
  const rows = all<{ blocker_id: string; blocked_id: string }>(
    db,
    'SELECT blocker_id, blocked_id FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?',
    viewerId,
    viewerId,
  );
  const flags = new Map<string, BlockFlags>();
  for (const row of rows) {
    const otherId = row.blocker_id === viewerId ? row.blocked_id : row.blocker_id;
    const entry = flags.get(otherId) ?? { byViewer: false, byOther: false };
    if (row.blocker_id === viewerId) entry.byViewer = true;
    else entry.byOther = true;
    flags.set(otherId, entry);
  }
  return flags;
}

function messagingFor(flags: BlockFlags | undefined): { canSend: boolean; reason: MessagingReason } {
  if (flags?.byViewer) return { canSend: false, reason: 'blocked-by-you' };
  if (flags?.byOther) return { canSend: false, reason: 'unavailable' };
  return { canSend: true, reason: null };
}

export function findPairConversation(db: Db, a: string, b: string): ConversationRow | undefined {
  const [low, high] = a < b ? [a, b] : [b, a];
  return get<ConversationRow>(db, 'SELECT * FROM dm_conversations WHERE user_low_id = ? AND user_high_id = ?', low, high);
}

/** Loads a conversation only when the viewer is one of its two participants. */
export function conversationForViewer(db: Db, viewerId: string, conversationId: string): ConversationRow {
  const row = get<ConversationRow>(
    db,
    'SELECT * FROM dm_conversations WHERE id = ? AND (user_low_id = ? OR user_high_id = ?)',
    conversationId,
    viewerId,
    viewerId,
  );
  if (!row) throw notFound(NOT_AVAILABLE);
  return row;
}

function createConversation(db: Db, a: string, b: string): ConversationRow {
  const [low, high] = a < b ? [a, b] : [b, a];
  // The unique pair constraint means a concurrent insert for the same pair cannot create a second thread.
  db.prepare(
    'INSERT INTO dm_conversations (id, user_low_id, user_high_id, created_at, latest_seq, last_message_at) VALUES (?, ?, ?, ?, 0, NULL) ON CONFLICT (user_low_id, user_high_id) DO NOTHING',
  ).run(newId(), low, high, nowIso());
  const row = findPairConversation(db, low, high);
  if (!row) throw new Error('The conversation could not be created.');
  return row;
}

function summaryRows(db: Db, viewerId: string, where: string, params: unknown[], limit: number): SummaryRow[] {
  return all<SummaryRow>(
    db,
    `SELECT c.id, c.user_low_id, c.user_high_id, c.created_at, c.latest_seq, c.last_message_at,
            ou.id AS other_id, ou.name AS other_name, ou.role AS other_role,
            lm.id AS last_id, lm.seq AS last_seq, lm.sender_id AS last_sender_id,
            lm.body AS last_body, lm.created_at AS last_created_at,
            COALESCE(r.last_read_seq, 0) AS last_read_seq,
            (SELECT COUNT(*) FROM dm_messages um
              WHERE um.conversation_id = c.id AND um.seq > COALESCE(r.last_read_seq, 0) AND um.sender_id <> ?) AS unread_count
       FROM dm_conversations c
       JOIN users ou ON ou.id = CASE WHEN c.user_low_id = ? THEN c.user_high_id ELSE c.user_low_id END
       LEFT JOIN dm_reads r ON r.conversation_id = c.id AND r.user_id = ?
       LEFT JOIN dm_messages lm ON lm.seq = c.latest_seq
      WHERE (c.user_low_id = ? OR c.user_high_id = ?) ${where}
      ORDER BY c.latest_seq DESC
      LIMIT ?`,
    viewerId,
    viewerId,
    viewerId,
    viewerId,
    viewerId,
    ...params,
    limit,
  );
}

function summaryFromRow(row: SummaryRow, flags: BlockFlags | undefined): ConversationSummary {
  return {
    id: row.id,
    other: {
      id: row.other_id,
      name: row.other_name,
      role: row.other_role,
      initials: initialsFor(row.other_name),
      avatarUrl: null,
      profileUrl: profileUrlFor(row.other_role, row.other_id),
    },
    latestSeq: row.latest_seq,
    lastActivityAt: row.last_message_at ?? row.created_at,
    lastMessage:
      row.last_id === null
        ? null
        : {
            id: row.last_id,
            seq: row.last_seq ?? 0,
            senderId: row.last_sender_id ?? '',
            preview: previewOf(row.last_body ?? ''),
            createdAt: row.last_created_at ?? '',
          },
    unreadCount: row.unread_count,
    lastReadSeq: row.last_read_seq,
    messaging: messagingFor(flags),
  };
}

export function unreadTotalFor(db: Db, viewerId: string): number {
  const row = get<{ total: number }>(
    db,
    `SELECT COUNT(*) AS total FROM dm_messages m
       JOIN dm_conversations c ON c.id = m.conversation_id
       LEFT JOIN dm_reads r ON r.conversation_id = c.id AND r.user_id = ?
      WHERE (c.user_low_id = ? OR c.user_high_id = ?) AND m.sender_id <> ? AND m.seq > COALESCE(r.last_read_seq, 0)`,
    viewerId,
    viewerId,
    viewerId,
    viewerId,
  );
  return row?.total ?? 0;
}

/** Inbox page, newest activity first. Pass `before` (a previous nextBefore) to load older conversations. */
export function listConversations(db: Db, viewerId: string, options: { before?: number; limit?: number } = {}) {
  const limit = options.limit ?? INBOX_PAGE_SIZE;
  const rows =
    options.before === undefined
      ? summaryRows(db, viewerId, '', [], limit + 1)
      : summaryRows(db, viewerId, 'AND c.latest_seq < ?', [options.before], limit + 1);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const flags = blockFlagsForViewer(db, viewerId);
  const oldest = page[page.length - 1];
  return {
    conversations: page.map((row) => summaryFromRow(row, flags.get(row.other_id))),
    hasMore,
    nextBefore: hasMore && oldest ? oldest.latest_seq : null,
    unreadTotal: unreadTotalFor(db, viewerId),
  };
}

export function conversationSummary(db: Db, viewerId: string, conversationId: string): ConversationSummary {
  const row = summaryRows(db, viewerId, 'AND c.id = ?', [conversationId], 1)[0];
  if (!row) throw notFound(NOT_AVAILABLE);
  return summaryFromRow(row, blockFlagsBetween(db, viewerId, row.other_id));
}

export function unreadSummary(db: Db, viewerId: string) {
  const { conversations, unreadTotal } = listConversations(db, viewerId, { limit: 500 });
  return {
    total: unreadTotal,
    byConversation: Object.fromEntries(conversations.map((conversation) => [conversation.id, conversation.unreadCount])),
  };
}

/** Pages through a thread. Without a cursor it returns the newest messages. Results are always in ascending order. */
export function listMessages(
  db: Db,
  viewerId: string,
  conversationId: string,
  options: { before?: number; after?: number; limit?: number } = {},
) {
  const conversation = conversationForViewer(db, viewerId, conversationId);
  const limit = options.limit ?? THREAD_PAGE_SIZE;
  let rows: MessageRow[];
  let hasMore: boolean;
  if (options.after !== undefined) {
    const fetched = all<MessageRow>(
      db,
      'SELECT * FROM dm_messages WHERE conversation_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?',
      conversation.id,
      options.after,
      limit + 1,
    );
    hasMore = fetched.length > limit;
    rows = fetched.slice(0, limit);
  } else {
    const fetched =
      options.before === undefined
        ? all<MessageRow>(db, 'SELECT * FROM dm_messages WHERE conversation_id = ? ORDER BY seq DESC LIMIT ?', conversation.id, limit + 1)
        : all<MessageRow>(
            db,
            'SELECT * FROM dm_messages WHERE conversation_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?',
            conversation.id,
            options.before,
            limit + 1,
          );
    hasMore = fetched.length > limit;
    rows = fetched.slice(0, limit).reverse();
  }
  return {
    messages: rows.map((row) => toDirectMessage(row, viewerId)),
    hasMore,
    latestSeq: conversation.latest_seq,
  };
}

export interface SendOutcome {
  /** True when this request replayed a message that was already saved. Nothing new was stored or published. */
  duplicate: boolean;
  conversationCreated: boolean;
  conversationId: string;
  senderId: string;
  recipientId: string;
  row: MessageRow;
}

export type SendTarget = { conversationId: string } | { recipientId: string };

/**
 * Saves one message. The sender comes from the verified session, never from the request body.
 * A repeated (sender, clientId) pair returns the message that was already saved, so retries and double-clicks never duplicate.
 * A new conversation is created in the same transaction as its first message.
 */
export function sendDirectMessage(
  db: Db,
  senderId: string,
  target: SendTarget,
  input: { clientId: string; body: string },
  onNewConversation?: () => void,
): SendOutcome {
  const checked = checkMessageBody(input.body);
  if (!checked.ok) throw new HttpError(400, checked.message, checked.code);

  return transaction(db, () => {
    const duplicate = get<MessageRow>(db, 'SELECT * FROM dm_messages WHERE sender_id = ? AND client_id = ?', senderId, input.clientId);
    if (duplicate) {
      const existing = get<ConversationRow>(db, 'SELECT * FROM dm_conversations WHERE id = ?', duplicate.conversation_id);
      const matchesTarget =
        'conversationId' in target
          ? target.conversationId === duplicate.conversation_id
          : existing !== undefined && otherParticipantId(existing, senderId) === target.recipientId;
      if (!existing || !matchesTarget || duplicate.body !== checked.body) {
        throw conflict('This message reference was already used for a different message.', 'CLIENT_ID_CONFLICT');
      }
      return {
        duplicate: true,
        conversationCreated: false,
        conversationId: duplicate.conversation_id,
        senderId,
        recipientId: otherParticipantId(existing, senderId),
        row: duplicate,
      };
    }

    let conversation: ConversationRow | undefined;
    let recipientId: string;
    if ('conversationId' in target) {
      conversation = conversationForViewer(db, senderId, target.conversationId);
      recipientId = otherParticipantId(conversation, senderId);
    } else {
      if (target.recipientId === senderId) throw new HttpError(400, 'You cannot send a message to your own account.', 'SELF_MESSAGE');
      const recipient = getUserRow(db, target.recipientId);
      if (!recipient) throw notFound('We could not find that person.');
      recipientId = recipient.id;
      conversation = findPairConversation(db, senderId, recipientId);
    }

    const flags = blockFlagsBetween(db, senderId, recipientId);
    if (flags.byViewer || flags.byOther) throw new HttpError(403, MESSAGING_UNAVAILABLE_COPY, 'MESSAGING_UNAVAILABLE');

    let conversationCreated = false;
    if (!conversation) {
      // Starting a conversation is limited separately. The limit check runs inside the transaction and rolls back on refusal.
      onNewConversation?.();
      conversation = createConversation(db, senderId, recipientId);
      conversationCreated = true;
    }

    const messageId = newId();
    const createdAt = nowIso();
    const inserted = db
      .prepare('INSERT INTO dm_messages (id, conversation_id, sender_id, body, client_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(messageId, conversation.id, senderId, checked.body, input.clientId, createdAt);
    const seq = Number(inserted.lastInsertRowid);
    run(db, 'UPDATE dm_conversations SET latest_seq = ?, last_message_at = ? WHERE id = ?', seq, createdAt, conversation.id);

    return {
      duplicate: false,
      conversationCreated,
      conversationId: conversation.id,
      senderId,
      recipientId,
      row: {
        seq,
        id: messageId,
        conversation_id: conversation.id,
        sender_id: senderId,
        body: checked.body,
        client_id: input.clientId,
        created_at: createdAt,
      },
    };
  });
}

/** Advances the viewer's read position. The position never moves backwards and never passes the newest message. */
export function markThreadRead(db: Db, viewerId: string, conversationId: string, throughSeq: number) {
  const conversation = conversationForViewer(db, viewerId, conversationId);
  const target = Math.min(Math.max(0, Math.floor(throughSeq)), conversation.latest_seq);
  run(
    db,
    `INSERT INTO dm_reads (conversation_id, user_id, last_read_seq, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (conversation_id, user_id)
     DO UPDATE SET last_read_seq = MAX(dm_reads.last_read_seq, excluded.last_read_seq), updated_at = excluded.updated_at`,
    conversation.id,
    viewerId,
    target,
    nowIso(),
  );
  return {
    conversation: conversationSummary(db, viewerId, conversation.id),
    unreadTotal: unreadTotalFor(db, viewerId),
  };
}

/** What the viewer sees for a profile: whether a message can be sent, and the existing conversation if there is one. */
export function messagingStatusWith(db: Db, viewerId: string, targetId: string) {
  const target = getUserRow(db, targetId);
  if (!target) throw notFound('We could not find that profile.');
  if (target.id === viewerId) {
    return { recipient: participantFor(target), conversationId: null, messaging: { canSend: false, reason: 'self' as const } };
  }
  const conversation = findPairConversation(db, viewerId, target.id);
  return {
    recipient: participantFor(target),
    conversationId: conversation?.id ?? null,
    messaging: messagingFor(blockFlagsBetween(db, viewerId, target.id)),
  };
}

export function blockUser(db: Db, viewerId: string, targetId: string): ConversationRow | undefined {
  if (targetId === viewerId) throw new HttpError(400, 'You cannot block your own account.', 'SELF_BLOCK');
  if (!getUserRow(db, targetId)) throw notFound('We could not find that person.');
  run(db, 'INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)', viewerId, targetId, nowIso());
  return findPairConversation(db, viewerId, targetId);
}

export function unblockUser(db: Db, viewerId: string, targetId: string): ConversationRow | undefined {
  run(db, 'DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?', viewerId, targetId);
  return findPairConversation(db, viewerId, targetId);
}

export interface ReportInput {
  conversationId: string;
  reason: ReportReason;
  details: string;
  messageIds: string[];
}

/** Stores a moderation record with a copy of the selected messages. Only moderators can read these records. */
export function createReport(db: Db, reporterId: string, input: ReportInput): { id: string; createdAt: string } {
  const conversation = conversationForViewer(db, reporterId, input.conversationId);
  const ids = [...new Set(input.messageIds)];
  if (ids.length === 0 || ids.length > REPORT_MAX_MESSAGES) {
    throw new HttpError(400, `Select between 1 and ${REPORT_MAX_MESSAGES} messages to report.`, 'INVALID_SELECTION', {
      messageIds: `Select between 1 and ${REPORT_MAX_MESSAGES} messages.`,
    });
  }
  const placeholders = ids.map(() => '?').join(', ');
  const rows = all<MessageRow>(
    db,
    `SELECT * FROM dm_messages WHERE conversation_id = ? AND id IN (${placeholders})`,
    conversation.id,
    ...ids,
  );
  if (rows.length !== ids.length) {
    throw new HttpError(400, 'Some selected messages are no longer in this conversation. Refresh and try again.', 'INVALID_SELECTION', {
      messageIds: 'Refresh the conversation and select the messages again.',
    });
  }
  rows.sort((a, b) => a.seq - b.seq);
  const evidence = rows.map((row) => ({ id: row.id, senderId: row.sender_id, body: row.body, createdAt: row.created_at }));
  const id = newId();
  const createdAt = nowIso();
  run(
    db,
    `INSERT INTO message_reports (id, conversation_id, reporter_id, reported_user_id, reason, details, evidence, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    id,
    conversation.id,
    reporterId,
    otherParticipantId(conversation, reporterId),
    input.reason,
    input.details.trim(),
    JSON.stringify(evidence),
    createdAt,
  );
  return { id, createdAt };
}

export function isModerator(db: Db, userId: string): boolean {
  return Boolean(get(db, 'SELECT 1 FROM moderators WHERE user_id = ?', userId));
}

export function grantModerator(db: Db, userId: string): void {
  run(db, 'INSERT OR IGNORE INTO moderators (user_id, granted_at) VALUES (?, ?)', userId, nowIso());
}

/** Moderator queue, newest first. Pass the previous page's nextBefore to read older reports. */
export function listReportsForModerator(db: Db, moderatorId: string, options: { before?: string; limit?: number } = {}) {
  if (!isModerator(db, moderatorId)) throw forbidden('Only moderators can review reports.');
  const limit = options.limit ?? 50;
  const rows = all<{
    id: string;
    conversation_id: string;
    reporter_id: string;
    reporter_name: string | null;
    reported_user_id: string;
    reported_name: string | null;
    reason: string;
    details: string;
    evidence: string;
    status: string;
    created_at: string;
  }>(
    db,
    `SELECT r.id, r.conversation_id, r.reporter_id, reporter.name AS reporter_name, r.reported_user_id,
            reported.name AS reported_name, r.reason, r.details, r.evidence, r.status, r.created_at
       FROM message_reports r
       LEFT JOIN users reporter ON reporter.id = r.reporter_id
       LEFT JOIN users reported ON reported.id = r.reported_user_id
      WHERE (? IS NULL OR r.created_at < ?)
      ORDER BY r.created_at DESC
      LIMIT ?`,
    options.before ?? null,
    options.before ?? null,
    limit + 1,
  );
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const reports = page.map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    reporter: { id: row.reporter_id, name: row.reporter_name ?? 'Deleted account' },
    reported: { id: row.reported_user_id, name: row.reported_name ?? 'Deleted account' },
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.created_at,
    evidence: parseJsonArray<{ id: string; senderId: string; body: string; createdAt: string }>(row.evidence),
  }));
  return { reports, nextBefore: hasMore && page.length > 0 ? page[page.length - 1].created_at : null };
}
