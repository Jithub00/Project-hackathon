import { useEffect } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import type { NoticeItem } from '@/lib/messaging/store';
import { useMessagingSelector, useMessagingStore } from '@/lib/messaging/hooks';

const NOTICE_MS = 8000;

/** In-app notifications for incoming messages the viewer is not currently reading. Rendered only for a signed-in viewer. */
export function MessageNotices() {
  const notices = useMessagingSelector((state) => state.notices);
  const store = useMessagingStore();
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-24 z-50 flex flex-col items-stretch gap-3 md:inset-x-auto md:bottom-6 md:right-6 md:top-auto md:w-96"
      data-testid="message-notices"
    >
      {notices.map((notice) => (
        <NoticeCard key={notice.id} notice={notice} onDismiss={() => store.dismissNotice(notice.id)} />
      ))}
    </div>
  );
}

function NoticeCard({ notice, onDismiss }: { notice: NoticeItem; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, NOTICE_MS);
    return () => window.clearTimeout(timer);
    // The timer is tied to the notice, not to the dismiss callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice.id]);

  return (
    <div
      className="pointer-events-auto rounded-lg border border-white/20 bg-popover p-4 shadow-2xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2"
      data-testid="message-notice"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-red-text">New message</p>
      <p className="mt-1 text-sm font-bold">{notice.senderName}</p>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{notice.preview}</p>
      <div className="mt-3 flex gap-2">
        <Button asChild size="sm" onClick={onDismiss}>
          <Link to={`/messages/${notice.conversationId}`}>Open</Link>
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
