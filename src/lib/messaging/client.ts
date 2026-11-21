import { ApiError } from '@/lib/api';
import type { ConversationSummary, DirectMessage, MessageParticipant, MessagingReason, ReportReason } from '../../../shared/messaging';

/** Network calls for messaging. Responses are never cached, and every request has a timeout. */

const TIMEOUT_MS = 15_000;

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function call<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: controller.signal,
  };
  if (body !== undefined) {
    init.headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  try {
    const response = await fetch(path, init);
    const text = await response.text();
    let data: Record<string, unknown> | null = null;
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      throw new ApiError(
        (data?.error as string) || `Something went wrong (${response.status}). Please try again.`,
        response.status,
        (data?.code as string) || 'ERROR',
        (data?.fieldErrors as Record<string, string>) || {},
      );
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("We couldn't reach Photo Shoot. Check your connection and try again.", 0, 'NETWORK');
  } finally {
    window.clearTimeout(timer);
  }
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** Network failures, timeouts, rate limits and server errors can be retried with the same client id. */
export function isRetryable(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status === 429 || error.status >= 500);
}

export interface InboxResponse {
  conversations: ConversationSummary[];
  hasMore: boolean;
  nextBefore: number | null;
  unreadTotal: number;
}

export interface MessagesPage {
  messages: DirectMessage[];
  hasMore: boolean;
  latestSeq: number;
}

export interface SendResponse {
  created: boolean;
  conversationCreated: boolean;
  conversation: ConversationSummary;
  message: DirectMessage;
}

export interface WithUserResponse {
  recipient: MessageParticipant;
  conversationId: string | null;
  messaging: { canSend: boolean; reason: MessagingReason };
}

export interface ConversationResponse {
  conversation: ConversationSummary;
}

export interface ReadResponse {
  conversation: ConversationSummary;
  unreadTotal: number;
}

export interface BlockResponse {
  blocked: boolean;
  conversation: ConversationSummary | null;
}

export interface ReportInput {
  conversationId: string;
  reason: ReportReason;
  details: string;
  messageIds: string[];
}

export const messagingApi = {
  inbox: (before?: number) =>
    call<InboxResponse>('GET', `/api/messages/conversations${before === undefined ? '' : `?before=${before}`}`),
  conversation: (conversationId: string) =>
    call<ConversationResponse>('GET', `/api/messages/conversations/${encodeURIComponent(conversationId)}`),
  messages: (conversationId: string, options: { before?: number; after?: number } = {}) => {
    const params = new URLSearchParams();
    if (options.before !== undefined) params.set('before', String(options.before));
    if (options.after !== undefined) params.set('after', String(options.after));
    const query = params.toString();
    return call<MessagesPage>('GET', `/api/messages/conversations/${encodeURIComponent(conversationId)}/messages${query ? `?${query}` : ''}`);
  },
  sendToConversation: (conversationId: string, clientId: string, body: string) =>
    call<SendResponse>('POST', `/api/messages/conversations/${encodeURIComponent(conversationId)}/messages`, { clientId, body }),
  sendToPeer: (userId: string, clientId: string, body: string) =>
    call<SendResponse>('POST', `/api/messages/with/${encodeURIComponent(userId)}/messages`, { clientId, body }),
  withUser: (userId: string) => call<WithUserResponse>('GET', `/api/messages/with/${encodeURIComponent(userId)}`),
  markRead: (conversationId: string, throughSeq: number) =>
    call<ReadResponse>('PUT', `/api/messages/conversations/${encodeURIComponent(conversationId)}/read`, { throughSeq }),
  block: (userId: string) => call<BlockResponse>('POST', '/api/messages/blocks', { userId }),
  unblock: (userId: string) => call<BlockResponse>('DELETE', `/api/messages/blocks/${encodeURIComponent(userId)}`),
  report: (input: ReportInput) => call<{ report: { id: string; createdAt: string } }>('POST', '/api/messages/reports', input),
};
