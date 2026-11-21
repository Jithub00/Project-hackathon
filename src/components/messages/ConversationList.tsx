import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { ErrorAlert, InitialsAvatar, LoadingBlock } from '@/components/site/ui-bits';
import { useMessagingSelector, useMessagingStore } from '@/lib/messaging/hooks';
import { listTimeLabel } from '@/lib/messaging/util';
import { cn } from '@/lib/utils';
import type { ConversationSummary } from '../../../shared/messaging';

const ROLE_LABEL = { creator: 'Creator', customer: 'Customer' } as const;

export function ConversationList({ selectedId }: { selectedId: string | null }) {
  const inbox = useMessagingSelector((state) => state.inbox);
  const unreadTotal = useMessagingSelector((state) => state.unreadTotal);
  const viewerId = useMessagingSelector((state) => state.viewerId);
  const store = useMessagingStore();

  return (
    <section aria-labelledby="inbox-title" className="flex min-h-0 flex-1 flex-col" data-testid="inbox">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h1 id="inbox-title" className="text-xl font-black uppercase tracking-tight">
          Messages
        </h1>
        {unreadTotal > 0 ? (
          <span
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 text-xs font-bold text-white"
            data-testid="inbox-unread-total"
          >
            <span aria-hidden>{unreadTotal > 99 ? '99+' : unreadTotal}</span>
            <span className="sr-only">{unreadTotal} unread</span>
          </span>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {inbox.status === 'idle' || inbox.status === 'loading' ? <LoadingBlock label="Loading conversations" /> : null}

        {inbox.status === 'error' ? (
          <div className="p-5">
            <ErrorAlert message={inbox.error ?? 'We could not load your conversations.'} onRetry={() => void store.loadInbox()} />
          </div>
        ) : null}

        {inbox.status === 'ready' && inbox.items.length === 0 ? <InboxEmpty /> : null}

        {inbox.items.length > 0 ? (
          <ul aria-label="Conversations" className="divide-y divide-border">
            {inbox.items.map((item) => (
              <li key={item.id}>
                <ConversationRow item={item} viewerId={viewerId} selected={item.id === selectedId} />
              </li>
            ))}
          </ul>
        ) : null}

        {inbox.status === 'ready' && inbox.error ? (
          <div className="p-5">
            <ErrorAlert message={inbox.error} onRetry={() => void store.loadMoreInbox()} />
          </div>
        ) : null}

        {inbox.hasMore ? (
          <div className="p-4">
            <Button type="button" variant="outline" size="sm" onClick={() => void store.loadMoreInbox()} disabled={inbox.loadingMore}>
              {inbox.loadingMore ? 'Loading…' : 'Load older conversations'}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function InboxEmpty() {
  return (
    <div className="flex flex-col items-start gap-4 p-6" data-testid="inbox-empty">
      <p className="text-sm font-semibold uppercase tracking-[0.12em]">No conversations yet</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Your conversations will appear here. Visit a creator or customer profile and select Message to get started.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link to="/discover">Find creators</Link>
      </Button>
    </div>
  );
}

function ConversationRow({ item, viewerId, selected }: { item: ConversationSummary; viewerId: string | null; selected: boolean }) {
  const mine = item.lastMessage !== null && item.lastMessage.senderId === viewerId;
  const preview = item.lastMessage ? `${mine ? 'You: ' : ''}${item.lastMessage.preview}` : 'No messages yet';
  const unread = item.unreadCount;
  return (
    <Link
      to={`/messages/${item.id}`}
      aria-current={selected ? 'page' : undefined}
      data-testid="conversation-item"
      data-conversation-id={item.id}
      className={cn(
        'flex min-h-18 items-start gap-3 px-5 py-4 transition-colors duration-200 hover:bg-surface-hover focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-white',
        selected && 'bg-surface-raised',
      )}
    >
      <InitialsAvatar initials={item.other.initials} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn('truncate text-sm', unread > 0 ? 'font-black' : 'font-bold')}>{item.other.name}</span>
          <time dateTime={item.lastActivityAt} className="shrink-0 text-[11px] text-muted-foreground">
            {listTimeLabel(item.lastActivityAt)}
          </time>
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          <span>{ROLE_LABEL[item.other.role]}</span>
          {item.messaging.reason ? <span>· Unavailable</span> : null}
        </span>
        <span className={cn('mt-1 block truncate text-sm', unread > 0 ? 'text-foreground' : 'text-muted-foreground')}>{preview}</span>
      </span>
      {unread > 0 ? (
        <span
          className="mt-1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white"
          data-testid="conversation-unread"
        >
          <span aria-hidden>{unread > 99 ? '99+' : unread}</span>
          <span className="sr-only">{unread} unread messages</span>
        </span>
      ) : null}
    </Link>
  );
}
