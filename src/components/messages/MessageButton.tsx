import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/lib/app-context';
import { isUnauthorized, messagingApi } from '@/lib/messaging/client';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

export interface MessageButtonProps {
  participantId: string;
  participantName: string;
  className?: string;
}

/**
 * "Message" pill for a profile. It renders only for a confirmed signed-in viewer, never on their own profile,
 * and renders nothing while sign-in is still being checked.
 */
export function MessageButton(props: MessageButtonProps) {
  const { user, ready } = useApp();
  if (!ready || !user || user.id === props.participantId) return null;
  return <SignedInMessageButton key={props.participantId} {...props} />;
}

function SignedInMessageButton({ participantId, participantName, className }: MessageButtonProps) {
  const navigate = useNavigate();
  const status = useApi(() => messagingApi.withUser(participantId), [participantId]);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const unavailableId = useId();
  const unavailable = status.data !== null && !status.data.messaging.canSend;

  const open = async () => {
    setOpening(true);
    setOpenError(null);
    try {
      // Look the conversation up again on click, so the button always opens the current thread.
      const result = await messagingApi.withUser(participantId);
      if (!result.messaging.canSend) {
        setOpening(false);
        status.reload();
        return;
      }
      navigate(result.conversationId ? `/messages/${result.conversationId}` : `/messages/new/${participantId}`);
    } catch (error) {
      setOpening(false);
      if (isUnauthorized(error)) return;
      setOpenError("We couldn't open this conversation. Try again.");
    }
  };

  return (
    <div className={cn('flex flex-col items-start gap-2', className)}>
      <Button
        type="button"
        onClick={() => void open()}
        disabled={unavailable || opening}
        aria-label={`Message ${participantName}`}
        aria-busy={opening || undefined}
        aria-describedby={unavailable ? unavailableId : undefined}
        data-testid="message-button"
        className="h-11 min-w-11 gap-2.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-none transition-[background-color,transform] duration-200 ease-out hover:bg-primary-hover focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.98] disabled:bg-white/12 disabled:text-white/75 disabled:opacity-100"
      >
        {opening ? (
          <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <MessageCircle aria-hidden />
        )}
        <span>Message</span>
      </Button>
      {unavailable ? (
        <p id={unavailableId} className="text-xs text-muted-foreground" data-testid="message-unavailable">
          Messaging is not available for this profile right now.
        </p>
      ) : null}
      {openError ? (
        <p role="alert" className="text-xs font-medium text-brand-red-text">
          {openError}
        </p>
      ) : null}
    </div>
  );
}
