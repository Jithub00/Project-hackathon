import { errorMessage } from '@/lib/api';
import {
  checkMessageBody,
  previewOf,
  type ConversationSummary,
  type DirectMessage,
  type MessageParticipant,
  type MessagingReason,
} from '../../../shared/messaging';
import { isRetryable, isUnauthorized, messagingApi, type ReportInput, type SendResponse } from './client';
import { isDocumentVisible, newClientId } from './util';

/**
 * Client-side state for private messaging. It lives in memory only and is reset whenever the signed-in account
 * changes, so nothing from a previous session can reappear. Responses that arrive after a reset are discarded.
 */

export const conversationThreadKey = (conversationId: string): string => `conv:${conversationId}`;
export const peerThreadKey = (userId: string): string => `with:${userId}`;

export interface OutgoingMessage {
  clientId: string;
  body: string;
  createdAt: string;
  status: 'sending' | 'failed';
  error: string | null;
  retryable: boolean;
}

export interface ThreadState {
  key: string;
  conversationId: string | null;
  peerUserId: string | null;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  peer: MessageParticipant | null;
  messaging: { canSend: boolean; reason: MessagingReason } | null;
  messages: DirectMessage[];
  latestSeq: number;
  lastReadSeq: number;
  hasOlder: boolean;
  loadingOlder: boolean;
  olderError: string | null;
  outgoing: OutgoingMessage[];
}

export interface InboxState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: ConversationSummary[];
  hasMore: boolean;
  nextBefore: number | null;
  loadingMore: boolean;
  error: string | null;
}

export interface NoticeItem {
  id: string;
  conversationId: string;
  senderName: string;
  preview: string;
}

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface MessagingState {
  viewerId: string | null;
  connection: ConnectionState;
  unreadTotal: number;
  inbox: InboxState;
  threads: Record<string, ThreadState>;
  notices: NoticeItem[];
  activeConversationId: string | null;
}

export interface MessageEventPayload {
  conversation: ConversationSummary;
  unreadTotal: number;
  message: DirectMessage;
}

export interface ConversationEventPayload {
  conversation: ConversationSummary;
  unreadTotal: number;
}

type Listener = () => void;

const EMPTY_INBOX: InboxState = { status: 'idle', items: [], hasMore: false, nextBefore: null, loadingMore: false, error: null };

function emptyState(viewerId: string | null): MessagingState {
  return {
    viewerId,
    connection: 'idle',
    unreadTotal: 0,
    inbox: EMPTY_INBOX,
    threads: {},
    notices: [],
    activeConversationId: null,
  };
}

function newThread(key: string, init: Partial<ThreadState> = {}): ThreadState {
  return {
    key,
    conversationId: null,
    peerUserId: null,
    status: 'loading',
    error: null,
    peer: null,
    messaging: null,
    messages: [],
    latestSeq: 0,
    lastReadSeq: 0,
    hasOlder: false,
    loadingOlder: false,
    olderError: null,
    outgoing: [],
    ...init,
  };
}

/** Sorted by sequence number. A message seen twice (from a response and from the stream) appears once. */
export function mergeMessages(existing: DirectMessage[], incoming: DirectMessage[]): DirectMessage[] {
  const byId = new Map<string, DirectMessage>();
  for (const message of existing) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

function mergeInbox(existing: ConversationSummary[], incoming: ConversationSummary[]): ConversationSummary[] {
  const byId = new Map<string, ConversationSummary>();
  for (const item of existing) byId.set(item.id, item);
  for (const item of incoming) {
    const current = byId.get(item.id);
    if (!current || current.latestSeq <= item.latestSeq) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => b.latestSeq - a.latestSeq);
}

function withThread(state: MessagingState, key: string, change: (thread: ThreadState) => ThreadState): MessagingState {
  const thread = state.threads[key];
  if (!thread) return state;
  return { ...state, threads: { ...state.threads, [key]: change(thread) } };
}

function putThread(state: MessagingState, key: string, change: (thread: ThreadState | undefined) => ThreadState): MessagingState {
  return { ...state, threads: { ...state.threads, [key]: change(state.threads[key]) } };
}

function omitThread(state: MessagingState, key: string): MessagingState {
  const threads = { ...state.threads };
  delete threads[key];
  return { ...state, threads };
}

function parseEventData<T>(event: Event): T | null {
  try {
    return JSON.parse((event as MessageEvent<string>).data) as T;
  } catch {
    return null;
  }
}

export class MessagingStore {
  private state: MessagingState = emptyState(null);
  private readonly listeners = new Set<Listener>();
  private source: EventSource | null = null;
  private generation = 0;
  private hasConnected = false;
  private unauthorizedHandler: (() => void) | null = null;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): MessagingState => this.state;

  setUnauthorizedHandler(handler: (() => void) | null): void {
    this.unauthorizedHandler = handler;
  }

  /** Starts messaging for an account, or stops it and clears everything when the account is null or changes. */
  setViewer(viewerId: string | null): void {
    if (viewerId === this.state.viewerId) return;
    this.generation += 1;
    this.disconnect();
    this.hasConnected = false;
    this.update(() => emptyState(viewerId));
    if (viewerId) {
      this.connect();
      void this.loadInbox();
    }
  }

  setActiveConversation(conversationId: string | null): void {
    this.update((s) => (s.activeConversationId === conversationId ? s : { ...s, activeConversationId: conversationId }));
  }

  dismissNotice(id: string): void {
    this.update((s) => ({ ...s, notices: s.notices.filter((notice) => notice.id !== id) }));
  }

  /* ---------------- Inbox ---------------- */

  async loadInbox(): Promise<void> {
    const generation = this.generation;
    this.update((s) => ({ ...s, inbox: { ...s.inbox, status: s.inbox.items.length > 0 ? s.inbox.status : 'loading', error: null } }));
    try {
      const data = await messagingApi.inbox();
      if (generation !== this.generation) return;
      this.update((s) => {
        const items = mergeInbox(s.inbox.items, data.conversations);
        // Keep the older-page cursor only while the loaded list has not gone beyond this first page.
        const atPageEdge = data.conversations[data.conversations.length - 1]?.latestSeq === items[items.length - 1]?.latestSeq;
        return {
          ...s,
          unreadTotal: data.unreadTotal,
          inbox: {
            ...s.inbox,
            status: 'ready',
            items,
            hasMore: atPageEdge ? data.hasMore : s.inbox.hasMore,
            nextBefore: atPageEdge ? data.nextBefore : s.inbox.nextBefore,
            error: null,
          },
        };
      });
    } catch (error) {
      if (generation !== this.generation) return;
      if (isUnauthorized(error)) {
        this.handleUnauthorized();
        return;
      }
      this.update((s) => ({
        ...s,
        inbox: { ...s.inbox, status: s.inbox.items.length > 0 ? 'ready' : 'error', error: errorMessage(error) },
      }));
    }
  }

  async loadMoreInbox(): Promise<void> {
    const { inbox } = this.state;
    if (!inbox.hasMore || inbox.loadingMore || inbox.nextBefore === null) return;
    const generation = this.generation;
    const before = inbox.nextBefore;
    this.update((s) => ({ ...s, inbox: { ...s.inbox, loadingMore: true } }));
    try {
      const data = await messagingApi.inbox(before);
      if (generation !== this.generation) return;
      this.update((s) => ({
        ...s,
        inbox: {
          ...s.inbox,
          items: mergeInbox(s.inbox.items, data.conversations),
          hasMore: data.hasMore,
          nextBefore: data.nextBefore,
          loadingMore: false,
          error: null,
        },
      }));
    } catch (error) {
      if (generation !== this.generation) return;
      if (isUnauthorized(error)) {
        this.handleUnauthorized();
        return;
      }
      this.update((s) => ({ ...s, inbox: { ...s.inbox, loadingMore: false, error: errorMessage(error) } }));
    }
  }

  /* ---------------- Threads ---------------- */

  async openConversation(conversationId: string): Promise<void> {
    const key = conversationThreadKey(conversationId);
    const generation = this.generation;
    this.update((s) =>
      putThread(s, key, (current) => ({
        ...(current ?? newThread(key, { conversationId })),
        status: current?.status === 'ready' ? 'ready' : 'loading',
        error: null,
      })),
    );
    try {
      const [detail, page] = await Promise.all([messagingApi.conversation(conversationId), messagingApi.messages(conversationId)]);
      if (generation !== this.generation) return;
      this.update((s) =>
        putThread(s, key, (current) => ({
          ...(current ?? newThread(key, { conversationId })),
          status: 'ready',
          error: null,
          peer: detail.conversation.other,
          messaging: detail.conversation.messaging,
          lastReadSeq: detail.conversation.lastReadSeq,
          messages: mergeMessages(current?.messages ?? [], page.messages),
          latestSeq: page.latestSeq,
          hasOlder: page.hasMore,
        })),
      );
      this.applyConversation(detail.conversation, this.state.unreadTotal);
    } catch (error) {
      if (generation !== this.generation) return;
      if (isUnauthorized(error)) {
        this.handleUnauthorized();
        return;
      }
      this.update((s) =>
        putThread(s, key, (current) => ({
          ...(current ?? newThread(key, { conversationId })),
          status: 'error',
          error: errorMessage(error),
        })),
      );
    }
  }

  /** Looks up a profile's conversation. Returns the id when one exists, so the page can open it instead. */
  async openPeer(userId: string): Promise<string | null> {
    const key = peerThreadKey(userId);
    const generation = this.generation;
    this.update((s) => putThread(s, key, (current) => ({ ...(current ?? newThread(key, { peerUserId: userId })), status: 'loading', error: null })));
    try {
      const data = await messagingApi.withUser(userId);
      if (generation !== this.generation) return null;
      if (data.conversationId) {
        this.update((s) => omitThread(s, key));
        return data.conversationId;
      }
      this.update((s) =>
        putThread(s, key, (current) => ({
          ...(current ?? newThread(key, { peerUserId: userId })),
          status: 'ready',
          error: null,
          peer: data.recipient,
          messaging: data.messaging,
        })),
      );
      return null;
    } catch (error) {
      if (generation !== this.generation) return null;
      if (isUnauthorized(error)) this.handleUnauthorized();
      else
        this.update((s) =>
          putThread(s, key, (current) => ({
            ...(current ?? newThread(key, { peerUserId: userId })),
            status: 'error',
            error: errorMessage(error),
          })),
        );
      return null;
    }
  }

  async loadOlder(conversationId: string): Promise<void> {
    const key = conversationThreadKey(conversationId);
    const thread = this.state.threads[key];
    const oldest = thread?.messages[0]?.seq;
    if (!thread || !thread.hasOlder || thread.loadingOlder || oldest === undefined) return;
    const generation = this.generation;
    this.update((s) => withThread(s, key, (t) => ({ ...t, loadingOlder: true, olderError: null })));
    try {
      const page = await messagingApi.messages(conversationId, { before: oldest });
      if (generation !== this.generation) return;
      this.update((s) =>
        withThread(s, key, (t) => ({
          ...t,
          messages: mergeMessages(t.messages, page.messages),
          hasOlder: page.hasMore,
          loadingOlder: false,
        })),
      );
    } catch (error) {
      if (generation !== this.generation) return;
      if (isUnauthorized(error)) {
        this.handleUnauthorized();
        return;
      }
      this.update((s) => withThread(s, key, (t) => ({ ...t, loadingOlder: false, olderError: errorMessage(error) })));
    }
  }

  /** Forgets a profile lookup once the composer closes, unless messages are still waiting to be sent from it. */
  releaseThread(key: string): void {
    const thread = this.state.threads[key];
    if (!thread || !key.startsWith('with:') || thread.outgoing.length > 0) return;
    this.update((s) => omitThread(s, key));
  }

  /* ---------------- Sending ---------------- */

  /** Queues a message and sends it. Returns the conversation id once the server has saved the message. */
  async send(key: string, body: string): Promise<string | null> {
    const checked = checkMessageBody(body);
    if (!checked.ok) return null;
    const clientId = newClientId();
    const outgoing: OutgoingMessage = {
      clientId,
      body: checked.body,
      createdAt: new Date().toISOString(),
      status: 'sending',
      error: null,
      retryable: false,
    };
    this.update((s) => withThread(s, key, (t) => ({ ...t, outgoing: [...t.outgoing, outgoing] })));
    return this.attemptSend(key, clientId);
  }

  /** Sends the same message again. The client id is reused, so the server cannot store it twice. */
  async retry(key: string, clientId: string): Promise<string | null> {
    return this.attemptSend(key, clientId);
  }

  dismissOutgoing(key: string, clientId: string): void {
    this.update((s) => withThread(s, key, (t) => ({ ...t, outgoing: t.outgoing.filter((o) => o.clientId !== clientId) })));
  }

  private async attemptSend(key: string, clientId: string): Promise<string | null> {
    const thread = this.state.threads[key];
    const outgoing = thread?.outgoing.find((item) => item.clientId === clientId);
    if (!thread || !outgoing) return null;
    const generation = this.generation;
    this.patchOutgoing(key, clientId, { status: 'sending', error: null, retryable: false });
    try {
      const result = thread.conversationId
        ? await messagingApi.sendToConversation(thread.conversationId, clientId, outgoing.body)
        : await messagingApi.sendToPeer(thread.peerUserId ?? '', clientId, outgoing.body);
      if (generation !== this.generation) return null;
      this.commitSent(key, clientId, result);
      return result.conversation.id;
    } catch (error) {
      if (generation !== this.generation) return null;
      if (isUnauthorized(error)) {
        this.patchOutgoing(key, clientId, { status: 'failed', error: 'Sign in again to send this message.', retryable: false });
        this.handleUnauthorized();
        return null;
      }
      this.patchOutgoing(key, clientId, { status: 'failed', error: errorMessage(error), retryable: isRetryable(error) });
      return null;
    }
  }

  /** Moves a saved message into its conversation and removes the matching outgoing bubble. */
  private commitSent(sourceKey: string, clientId: string, result: SendResponse): void {
    const targetKey = conversationThreadKey(result.conversation.id);
    this.applyConversation(result.conversation, this.state.unreadTotal);
    this.update((s) => {
      const cleared = withThread(s, sourceKey, (t) => ({ ...t, outgoing: t.outgoing.filter((o) => o.clientId !== clientId) }));
      return putThread(cleared, targetKey, (current) => {
        const base = current ?? newThread(targetKey, { conversationId: result.conversation.id });
        return {
          ...base,
          conversationId: result.conversation.id,
          status: 'ready',
          error: null,
          peer: result.conversation.other,
          messaging: result.conversation.messaging,
          messages: mergeMessages(base.messages, [result.message]),
          latestSeq: Math.max(base.latestSeq, result.message.seq),
          outgoing: base.outgoing.filter((o) => o.clientId !== clientId),
        };
      });
    });
  }

  private patchOutgoing(key: string, clientId: string, patch: Partial<OutgoingMessage>): void {
    this.update((s) =>
      withThread(s, key, (t) => ({
        ...t,
        outgoing: t.outgoing.map((o) => (o.clientId === clientId ? { ...o, ...patch } : o)),
      })),
    );
  }

  /* ---------------- Read positions, blocks and reports ---------------- */

  /** Records that messages up to throughSeq were displayed. The server ignores positions that move backwards. */
  async markRead(conversationId: string, throughSeq: number): Promise<void> {
    const generation = this.generation;
    try {
      const result = await messagingApi.markRead(conversationId, throughSeq);
      if (generation !== this.generation) return;
      this.applyConversation(result.conversation, result.unreadTotal);
    } catch (error) {
      if (generation !== this.generation) return;
      if (isUnauthorized(error)) this.handleUnauthorized();
    }
  }

  async setBlocked(userId: string, blocked: boolean): Promise<void> {
    const generation = this.generation;
    try {
      const result = blocked ? await messagingApi.block(userId) : await messagingApi.unblock(userId);
      if (generation !== this.generation) return;
      if (result.conversation) this.applyConversation(result.conversation, this.state.unreadTotal);
    } catch (error) {
      if (isUnauthorized(error)) this.handleUnauthorized();
      throw error;
    }
  }

  async report(input: ReportInput): Promise<void> {
    try {
      await messagingApi.report(input);
    } catch (error) {
      if (isUnauthorized(error)) this.handleUnauthorized();
      throw error;
    }
  }

  /* ---------------- Realtime ---------------- */

  private connect(): void {
    const generation = this.generation;
    const source = new EventSource('/api/messages/stream');
    this.source = source;
    this.update((s) => ({ ...s, connection: 'connecting' }));
    const current = () => generation === this.generation && this.source === source;

    source.addEventListener('ready', () => {
      if (!current()) return;
      this.update((s) => ({ ...s, connection: 'open' }));
      // After a reconnect, fetch anything that was sent while the stream was down. Nothing is duplicated.
      if (this.hasConnected) void this.resync();
      this.hasConnected = true;
    });
    source.addEventListener('message', (event) => {
      if (!current()) return;
      const payload = parseEventData<MessageEventPayload>(event);
      if (payload) this.applyMessageEvent(payload);
    });
    source.addEventListener('conversation', (event) => {
      if (!current()) return;
      const payload = parseEventData<ConversationEventPayload>(event);
      if (payload) this.applyConversation(payload.conversation, payload.unreadTotal);
    });
    source.addEventListener('session-ended', () => {
      if (!current()) return;
      this.disconnect();
      this.update((s) => ({ ...s, connection: 'closed' }));
      this.handleUnauthorized();
    });
    source.onerror = () => {
      if (!current()) return;
      if (source.readyState === EventSource.CLOSED) {
        // The server refused the stream, which means the session is gone.
        this.disconnect();
        this.update((s) => ({ ...s, connection: 'closed' }));
        this.handleUnauthorized();
        return;
      }
      this.update((s) => ({ ...s, connection: 'reconnecting' }));
    };
  }

  private disconnect(): void {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
  }

  private async resync(): Promise<void> {
    await this.loadInbox();
    const open = Object.values(this.state.threads).filter((t) => t.conversationId !== null && t.status === 'ready');
    await Promise.all(open.map((t) => this.syncThread(t.conversationId ?? '')));
  }

  private async syncThread(conversationId: string): Promise<void> {
    const key = conversationThreadKey(conversationId);
    const thread = this.state.threads[key];
    if (!thread) return;
    const newest = thread.messages.length > 0 ? thread.messages[thread.messages.length - 1].seq : 0;
    const generation = this.generation;
    try {
      const page = await messagingApi.messages(conversationId, { after: newest });
      if (generation !== this.generation) return;
      this.update((s) =>
        withThread(s, key, (t) => ({ ...t, messages: mergeMessages(t.messages, page.messages), latestSeq: page.latestSeq })),
      );
    } catch (error) {
      if (generation !== this.generation) return;
      if (isUnauthorized(error)) this.handleUnauthorized();
    }
  }

  private applyMessageEvent(payload: MessageEventPayload): void {
    const { conversation, message } = payload;
    this.applyConversation(conversation, payload.unreadTotal);
    const key = conversationThreadKey(conversation.id);
    this.update((s) =>
      withThread(s, key, (t) => ({
        ...t,
        messages: mergeMessages(t.messages, [message]),
        outgoing: message.clientId ? t.outgoing.filter((o) => o.clientId !== message.clientId) : t.outgoing,
        latestSeq: Math.max(t.latestSeq, message.seq),
      })),
    );
    // A notice is only needed when the message is not being displayed in an active window.
    const isIncoming = message.senderId !== this.state.viewerId;
    const displayed = this.state.activeConversationId === conversation.id && isDocumentVisible();
    if (isIncoming && !displayed) {
      this.pushNotice({
        id: newClientId(),
        conversationId: conversation.id,
        senderName: conversation.other.name,
        preview: previewOf(message.body),
      });
    }
  }

  /** Stores the latest summary for a conversation, keeping the newer one if an older copy arrives late. */
  private applyConversation(summary: ConversationSummary, unreadTotal: number): void {
    const key = conversationThreadKey(summary.id);
    this.update((s) => {
      const existing = s.inbox.items.find((item) => item.id === summary.id);
      const items = existing && existing.latestSeq > summary.latestSeq ? s.inbox.items : mergeInbox(s.inbox.items, [summary]);
      const withInbox = { ...s, unreadTotal, inbox: { ...s.inbox, items } };
      return withThread(withInbox, key, (t) => ({
        ...t,
        peer: summary.other,
        messaging: summary.messaging,
        lastReadSeq: Math.max(t.lastReadSeq, summary.lastReadSeq),
      }));
    });
  }

  private pushNotice(notice: NoticeItem): void {
    this.update((s) => ({ ...s, notices: [...s.notices.slice(-2), notice] }));
  }

  private handleUnauthorized(): void {
    this.unauthorizedHandler?.();
  }

  private update(change: (state: MessagingState) => MessagingState): void {
    const next = change(this.state);
    if (next === this.state) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}
