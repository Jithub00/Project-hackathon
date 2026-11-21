import { cn } from '@/lib/utils';
import { linkify } from './linkify';

export function MessageBubble({ body, mine }: { body: string; mine: boolean }) {
  return (
    <div
      className={cn(
        'max-w-[min(85%,36rem)] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed [overflow-wrap:anywhere]',
        mine ? 'rounded-br-md bg-primary text-white' : 'rounded-bl-md border border-white/15 bg-surface-raised text-foreground',
      )}
    >
      {linkify(body)}
    </div>
  );
}
