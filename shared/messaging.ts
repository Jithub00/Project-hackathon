import type { Role } from './types';

/** Shared rules and wire types for private messaging. Used by the API, the realtime stream and the inbox UI. */

export const MESSAGE_MAX_CHARS = 5000;
/** The counter appears once a message reaches this length. */
export const MESSAGE_COUNTER_FROM = 4000;
/** Largest request body accepted on /api/messages (5,000 characters of UTF-8 plus JSON overhead). */
export const MESSAGE_REQUEST_LIMIT_BYTES = 32 * 1024;
export const THREAD_PAGE_SIZE = 30;
export const INBOX_PAGE_SIZE = 40;
export const PREVIEW_MAX_CHARS = 140;
/** Client-generated idempotency keys: letters, digits and hyphens, 8 to 64 characters. */
export const CLIENT_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export const REPORT_REASONS = ['harassment', 'spam', 'scam', 'unsafe', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Harassment or threats',
  spam: 'Spam or unwanted promotion',
  scam: 'Scam or a payment request outside Photo Shoot',
  unsafe: 'Unsafe or sexual content',
  other: 'Something else',
};
export const REPORT_DETAILS_MAX_CHARS = 1000;
export const REPORT_MAX_MESSAGES = 10;

/** Neutral copy used for both blocked directions, so the other person is not told who blocked whom. */
export const MESSAGING_UNAVAILABLE_COPY = 'Messaging is not available in this conversation.';

/**
 * Why a person cannot be messaged right now.
 * - self: the viewer's own profile.
 * - blocked-by-you: the viewer blocked the other person (the viewer can unblock).
 * - unavailable: a block exists in the other direction, shown neutrally.
 */
export type MessagingReason = 'self' | 'blocked-by-you' | 'unavailable' | null;

export interface MessageParticipant {
  id: string;
  name: string;
  role: Role;
  initials: string;
  /** Null until profile photo uploads exist; the UI then shows initials. */
  avatarUrl: string | null;
  profileUrl: string;
}

export interface ConversationSummary {
  id: string;
  other: MessageParticipant;
  /** Sequence number of the newest message. Inbox order follows this value. */
  latestSeq: number;
  lastActivityAt: string;
  lastMessage: { id: string; seq: number; senderId: string; preview: string; createdAt: string } | null;
  unreadCount: number;
  lastReadSeq: number;
  messaging: { canSend: boolean; reason: MessagingReason };
}

export interface DirectMessage {
  id: string;
  seq: number;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  /** Present only on the sender's own messages, so their outgoing bubble can be reconciled. */
  clientId?: string;
}

export interface MessageBodyProblem {
  code: 'EMPTY_MESSAGE' | 'MESSAGE_TOO_LONG' | 'INVALID_CHARACTERS';
  message: string;
}

// Control characters are rejected on purpose. Tabs and line breaks stay allowed.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Converts line endings to \n and trims the outer whitespace. Internal line breaks are kept. */
export function normalizeMessageBody(raw: string): string {
  // trim() uses the same whitespace set as \s and runs in linear time. A pattern such as /\s+$/ backtracks
  // quadratically on long runs of spaces, which let one request hold the server for seconds.
  return raw.replace(/\r\n?/g, '\n').trim();
}

/** Counts characters as code points, so an emoji counts as one character. */
export function messageLength(text: string): number {
  return Array.from(text).length;
}

export function checkMessageBody(raw: string): ({ ok: true; body: string } | ({ ok: false } & MessageBodyProblem)) {
  const body = normalizeMessageBody(raw);
  if (body.length === 0) {
    return { ok: false, code: 'EMPTY_MESSAGE', message: 'Write a message before sending.' };
  }
  const over = messageLength(body) - MESSAGE_MAX_CHARS;
  if (over > 0) {
    return {
      ok: false,
      code: 'MESSAGE_TOO_LONG',
      message: `Messages can be up to ${MESSAGE_MAX_CHARS.toLocaleString('en-US')} characters. Remove ${over.toLocaleString('en-US')} ${over === 1 ? 'character' : 'characters'} to send.`,
    };
  }
  if (CONTROL_CHARACTERS.test(body)) {
    return { ok: false, code: 'INVALID_CHARACTERS', message: 'This message contains characters that cannot be sent.' };
  }
  return { ok: true, body };
}

/** A single-line preview for inbox rows and notifications. */
export function previewOf(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  const characters = Array.from(collapsed);
  if (characters.length <= PREVIEW_MAX_CHARS) return collapsed;
  return `${characters.slice(0, PREVIEW_MAX_CHARS).join('')}…`;
}
