import { useParams } from 'react-router';
import { ConversationList } from '@/components/messages/ConversationList';
import { ThreadPanel } from '@/components/messages/ThreadPanel';
import { cn } from '@/lib/utils';

/**
 * Inbox and conversation. Desktop shows the list beside the thread. On phones the list comes first, and a thread
 * opens full screen with a Back button. Signed-out visitors never reach this page (RequireAuth in App).
 */
export function Messages() {
  const { conversationId, userId } = useParams();
  const selected = Boolean(conversationId || userId);
  const threadKey = conversationId ?? (userId ? `new-${userId}` : 'none');

  return (
    <div className="mx-auto flex h-[calc(100dvh-6.5rem)] min-h-[18rem] w-full max-w-7xl flex-col md:px-8 md:py-6">
      <div className="flex min-h-0 flex-1 overflow-hidden border-y border-border md:rounded-lg md:border md:bg-card/40">
        <aside
          aria-label="Conversations"
          className={cn('min-h-0 w-full flex-col md:flex md:w-[340px] md:shrink-0 md:border-r md:border-border', selected ? 'hidden' : 'flex')}
        >
          <ConversationList selectedId={conversationId ?? null} />
        </aside>
        <section aria-label="Conversation" className={cn('min-h-0 min-w-0 flex-1 flex-col', selected ? 'flex' : 'hidden md:flex')}>
          {selected ? (
            <ThreadPanel key={threadKey} conversationId={conversationId ?? null} peerUserId={conversationId ? null : (userId ?? null)} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center" data-testid="no-conversation">
              <p className="max-w-xs text-sm text-muted-foreground">Select a conversation to read it here.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
