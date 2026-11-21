import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Composer } from '@/components/messages/Composer';
import { ConversationMenu } from '@/components/messages/ConversationMenu';
import { MessageBubble } from '@/components/messages/MessageBubble';
import { ErrorAlert, InitialsAvatar, LoadingBlock } from '@/components/site/ui-bits';
import { useMessagingSelector, useMessagingStore, useThread } from '@/lib/messaging/hooks';
import { conversationThreadKey, peerThreadKey, type OutgoingMessage } from '@/lib/messaging/store';
import { dayKeyFor, dayLabel, isDocumentVisible, timeLabel, useDocumentVisible } from '@/lib/messaging/util';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { cn } from '@/lib/utils';
import { MESSAGING_UNAVAILABLE_COPY, type DirectMessage } from '../../../shared/messaging';

const ROLE_LABEL = { creator: 'Creator', customer: 'Customer' } as const;

/** Within this distance of the newest message, the reader counts as being at the bottom. */
const BOTTOM_THRESHOLD_PX = 80;

type TimelineItem =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'message'; key: string; message: DirectMessage; mine: boolean; showSent: boolean }
  | { kind: 'outgoing'; key: string; outgoing: OutgoingMessage };

interface ThreadPanelProps {
  /** Set for an existing conversation. */
  conversationId: string | null;
  /** Set when composing a first message to a profile. */
  peerUserId: string | null;
}

/**
 * One conversation: header, message list and composer. Read positions advance only while the newest message is on
 * screen and the window is visible. Scrolling up keeps the view where it is and shows a "New messages" button instead.
 */
export function ThreadPanel({ conversationId, peerUserId }: ThreadPanelProps) {
  const key = conversationId ? conversationThreadKey(conversationId) : peerThreadKey(peerUserId ?? '');
  const thread = useThread(key);
  const viewerId = useMessagingSelector((state) => state.viewerId);
  const store = useMessagingStore();
  const navigate = useNavigate();
  const visible = useDocumentVisible();
  const reducedMotion = usePrefersReducedMotion();

  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const initialScrollDone = useRef(false);
  const lastNewestSeq = useRef(0);
  const lastOutgoingCount = useRef(0);
  const renderedHeight = useRef(0);
  const scrollAnchor = useRef<{ key: string; offset: number } | null>(null);
  const lastReadSent = useRef(0);

  // Open the conversation, or look up the conversation a profile would open.
  useEffect(() => {
    if (conversationId) {
      store.setActiveConversation(conversationId);
      void store.openConversation(conversationId);
      return () => store.setActiveConversation(null);
    }
    if (peerUserId) {
      let active = true;
      void store.openPeer(peerUserId).then((existingId) => {
        if (active && existingId) navigate(`/messages/${existingId}`, { replace: true });
      });
      return () => {
        active = false;
        store.releaseThread(peerThreadKey(peerUserId));
      };
    }
    return undefined;
  }, [conversationId, peerUserId, store, navigate]);

  const threadReady = thread?.status === 'ready';
  const messages = thread?.messages;
  const outgoing = thread?.outgoing;
  const newestSeq = messages && messages.length > 0 ? messages[messages.length - 1].seq : 0;
  const lastReadKnown = thread?.lastReadSeq ?? 0;

  // Tracks whether the newest message is on screen. The observer is set up once the list is mounted.
  useEffect(() => {
    const list = listRef.current;
    const bottom = bottomRef.current;
    if (!list || !bottom || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const nowAtBottom = entries.some((entry) => entry.isIntersecting);
        setAtBottom(nowAtBottom);
        if (nowAtBottom) setUnseen(0);
      },
      { root: list, threshold: 0 },
    );
    observer.observe(bottom);
    return () => observer.disconnect();
  }, [key]);

  // Scroll handling: open at the newest message, follow new messages when already at the bottom,
  // count unseen incoming messages otherwise, and keep the reader's place when older messages load.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !thread || thread.status !== 'ready') return;
    // The height the list had when it last settled. With the current scroll position, it shows whether the reader
    // was at the newest message before this update. Checking the geometry avoids racing the intersection observer.
    const previousHeight = renderedHeight.current;
    renderedHeight.current = list.scrollHeight;
    if (scrollAnchor.current) {
      if (thread.loadingOlder) return;
      const { key: anchorKey, offset } = scrollAnchor.current;
      scrollAnchor.current = null;
      // Move by however far the anchored row has shifted, so the reader stays on the same message.
      const row = list.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(anchorKey)}"]`);
      if (row) {
        const shifted = row.getBoundingClientRect().top - list.getBoundingClientRect().top;
        list.scrollTop += shifted - offset;
      }
      return;
    }
    const outgoingCount = thread.outgoing.length;
    if (!initialScrollDone.current) {
      list.scrollTop = list.scrollHeight;
      initialScrollDone.current = true;
    } else {
      const lastMessage = thread.messages[thread.messages.length - 1];
      const newOwn =
        outgoingCount > lastOutgoingCount.current || (newestSeq > lastNewestSeq.current && lastMessage?.senderId === viewerId);
      const newIncoming = newestSeq > lastNewestSeq.current && !newOwn;
      const wasAtBottom = previousHeight - list.scrollTop - list.clientHeight < BOTTOM_THRESHOLD_PX;
      if (newOwn || wasAtBottom) {
        list.scrollTop = list.scrollHeight;
        setUnseen(0);
      } else if (newIncoming) {
        setUnseen((count) => count + 1);
      }
    }
    lastNewestSeq.current = newestSeq;
    lastOutgoingCount.current = outgoingCount;
  }, [thread, viewerId, newestSeq]);

  // Mark messages read only when the newest one is actually on screen in a visible window.
  useEffect(() => {
    if (!conversationId || !threadReady || !atBottom || !visible) return undefined;
    if (newestSeq <= Math.max(lastReadSent.current, lastReadKnown)) return undefined;
    const timer = window.setTimeout(() => {
      const list = listRef.current;
      const nearNewest = list !== null && list.scrollHeight - list.scrollTop - list.clientHeight < BOTTOM_THRESHOLD_PX;
      if (!isDocumentVisible() || !nearNewest) return;
      lastReadSent.current = newestSeq;
      void store.markRead(conversationId, newestSeq);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [conversationId, threadReady, atBottom, visible, newestSeq, lastReadKnown, store]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    let lastDay = '';
    const saved = messages ?? [];
    const lastOwn = [...saved].reverse().find((message) => message.senderId === viewerId);
    for (const message of saved) {
      const day = dayKeyFor(message.createdAt);
      if (day !== lastDay) {
        // Keyed by the day itself, so the separator stays the same element when older messages are added above it.
        items.push({ kind: 'day', key: `day-${day}`, label: dayLabel(message.createdAt) });
        lastDay = day;
      }
      items.push({
        kind: 'message',
        key: message.id,
        message,
        mine: message.senderId === viewerId,
        showSent: lastOwn?.id === message.id,
      });
    }
    for (const pending of outgoing ?? []) {
      const day = dayKeyFor(pending.createdAt);
      if (day !== lastDay) {
        items.push({ kind: 'day', key: `day-${day}`, label: dayLabel(pending.createdAt) });
        lastDay = day;
      }
      items.push({ kind: 'outgoing', key: pending.clientId, outgoing: pending });
    }
    return items;
  }, [messages, outgoing, viewerId]);

  const openSavedConversation = (savedId: string | null) => {
    if (savedId && !conversationId) navigate(`/messages/${savedId}`, { replace: true });
  };

  const handleSend = (body: string) => {
    void store.send(key, body).then(openSavedConversation);
  };

  const handleRetry = (clientId: string) => {
    void store.retry(key, clientId).then(openSavedConversation);
  };

  const handleLoadOlder = () => {
    const list = listRef.current;
    if (!list || !conversationId || !thread || !thread.hasOlder || thread.loadingOlder) return;
    scrollAnchor.current = captureAnchor(list);
    void store.loadOlder(conversationId);
  };

  const jumpToNewest = () => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
    setUnseen(0);
  };

  const retryOpen = () => {
    if (conversationId) {
      void store.openConversation(conversationId);
    } else if (peerUserId) {
      void store.openPeer(peerUserId).then(openSavedConversation);
    }
  };

  const peer = thread?.peer ?? null;
  const messaging = thread?.messaging ?? null;
  const unavailable = messaging !== null && !messaging.canSend;
  const blockedByViewer = messaging?.reason === 'blocked-by-you';
  const notice = !messaging || messaging.canSend
    ? null
    : blockedByViewer
      ? `You blocked ${peer?.name ?? 'this person'}. Unblock them to send messages.`
      : MESSAGING_UNAVAILABLE_COPY;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={peer ? `Conversation with ${peer.name}` : 'New message'} data-testid="thread">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 md:px-5">
        <Link
          to="/messages"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:text-foreground md:hidden"
          aria-label="Back to conversations"
          data-testid="thread-back"
        >
          <ArrowLeft aria-hidden />
        </Link>
        {peer ? (
          <>
            <InitialsAvatar initials={peer.initials} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black uppercase tracking-tight">
                <Link to={peer.profileUrl} className="rounded-sm hover:text-brand-red-text focus-visible:outline-2 focus-visible:outline-white">
                  {peer.name}
                </Link>
              </p>
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {ROLE_LABEL[peer.role]} ·{' '}
                <Link to={peer.profileUrl} className="underline underline-offset-4 hover:text-foreground">
                  View profile
                </Link>
              </p>
            </div>
            <ConversationMenu
              peer={peer}
              conversationId={conversationId}
              blockedByViewer={blockedByViewer}
              messages={thread?.messages ?? []}
              viewerId={viewerId}
            />
          </>
        ) : (
          <p className="text-sm font-black uppercase tracking-tight">New message</p>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={listRef}
          role="log"
          aria-label={peer ? `Messages with ${peer.name}` : 'Messages'}
          aria-live="polite"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [overflow-anchor:none] md:px-6"
          data-testid="message-list"
        >
          {!thread || thread.status === 'loading' ? <LoadingBlock label="Opening conversation" /> : null}
          {thread?.status === 'error' ? (
            <ErrorAlert message={thread.error ?? 'We could not open this conversation.'} onRetry={retryOpen} />
          ) : null}
          {thread?.status === 'ready' ? (
            <>
              {thread.hasOlder ? (
                <div className="flex justify-center pb-4">
                  <Button type="button" variant="outline" size="sm" onClick={handleLoadOlder} disabled={thread.loadingOlder} data-testid="load-older">
                    {thread.loadingOlder ? 'Loading…' : 'Load older messages'}
                  </Button>
                </div>
              ) : null}
              {timeline.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Say hello.</p> : null}
              <ul className="flex flex-col gap-3">
                {timeline.map((item) => (
                  <TimelineRow
                    key={item.key}
                    item={item}
                    onRetry={handleRetry}
                    onDismiss={(clientId) => store.dismissOutgoing(key, clientId)}
                  />
                ))}
              </ul>
            </>
          ) : null}
          <div ref={bottomRef} aria-hidden className="h-px" />
        </div>

        {unseen > 0 ? (
          <button
            type="button"
            onClick={jumpToNewest}
            className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-lg transition-colors duration-200 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            data-testid="new-messages"
          >
            New messages ↓
          </button>
        ) : null}
      </div>

      {thread?.status === 'ready' ? <Composer canSend={!unavailable} notice={notice} onSend={handleSend} /> : null}
    </section>
  );
}

/** The first row that is at least partly visible, with its offset from the top of the list. */
function captureAnchor(list: HTMLElement): { key: string; offset: number } | null {
  const listTop = list.getBoundingClientRect().top;
  // Messages only: day separators sit above the first message, so they do not move when older messages are added.
  for (const row of Array.from(list.querySelectorAll<HTMLElement>('[data-row="message"][data-anchor]'))) {
    const rect = row.getBoundingClientRect();
    if (rect.bottom > listTop) return { key: row.dataset.anchor ?? '', offset: rect.top - listTop };
  }
  return null;
}

function TimelineRow({
  item,
  onRetry,
  onDismiss,
}: {
  item: TimelineItem;
  onRetry: (clientId: string) => void;
  onDismiss: (clientId: string) => void;
}) {
  if (item.kind === 'day') {
    return (
      <li role="presentation" data-anchor={item.key} className="flex items-center gap-3 py-2">
        <span aria-hidden className="h-px flex-1 bg-border" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{item.label}</span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </li>
    );
  }
  if (item.kind === 'message') {
    return (
      <li data-anchor={item.key} data-row="message" className={cn('flex flex-col gap-1', item.mine ? 'items-end' : 'items-start')} data-testid="message" data-direction={item.mine ? 'outgoing' : 'incoming'}>
        <MessageBubble body={item.message.body} mine={item.mine} />
        <p className="px-1 text-[11px] text-muted-foreground">
          <time dateTime={item.message.createdAt}>{timeLabel(item.message.createdAt)}</time>
          {item.showSent ? <span> · Sent</span> : null}
        </p>
      </li>
    );
  }
  const pending = item.outgoing;
  return (
    <li data-anchor={item.key} className="flex flex-col items-end gap-1" data-testid="outgoing-message" data-status={pending.status}>
      <MessageBubble body={pending.body} mine />
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 px-1 text-[11px]">
        {pending.status === 'sending' ? (
          <span className="text-muted-foreground" role="status">
            Sending…
          </span>
        ) : (
          <>
            <span className="font-semibold text-brand-red-text">Not sent</span>
            {pending.error ? <span className="text-brand-red-text">{pending.error}</span> : null}
            <Button type="button" variant="outline" size="sm" className="min-h-11 md:min-h-7" onClick={() => onRetry(pending.clientId)} data-testid="retry-message">
              Retry
            </Button>
            <Button type="button" variant="ghost" size="sm" className="min-h-11 md:min-h-7" onClick={() => onDismiss(pending.clientId)}>
              Remove
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
