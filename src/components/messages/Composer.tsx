import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { MESSAGE_COUNTER_FROM, MESSAGE_MAX_CHARS, messageLength } from '../../../shared/messaging';

interface ComposerProps {
  canSend: boolean;
  notice: string | null;
  onSend: (body: string) => void;
}

/**
 * Multiline message field with an explicit Send button. Enter sends on desktop, Shift+Enter starts a new line,
 * and Enter during input-method composition is left alone so unfinished text is not sent.
 */
export function Composer({ canSend, notice, onSend }: ComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const helpId = useId();

  const length = messageLength(text);
  const overBy = length - MESSAGE_MAX_CHARS;
  const blank = text.trim().length === 0;
  const sendable = canSend && !blank && overBy <= 0;

  const submit = () => {
    if (!sendable) return;
    const body = text;
    setText('');
    onSend(body);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  return (
    <form onSubmit={handleSubmit} className="flex shrink-0 flex-col gap-2 border-t border-border bg-background p-3 md:p-4" aria-label="Write a message" data-testid="composer">
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground" data-testid="composer-notice">
          {notice}
        </p>
      ) : null}
      <div className="flex items-end gap-3">
        <Label htmlFor={inputId} className="sr-only">
          Message
        </Label>
        <Textarea
          id={inputId}
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a message…"
          rows={2}
          disabled={!canSend}
          aria-invalid={overBy > 0 || undefined}
          aria-describedby={helpId}
          data-testid="composer-input"
          className="min-h-11 max-h-40 flex-1 resize-none bg-surface-raised text-[15px]"
        />
        <Button type="submit" disabled={!sendable} className="h-11 shrink-0 gap-2 rounded-full px-5" data-testid="send-message">
          <Send aria-hidden />
          Send
        </Button>
      </div>
      <div className="flex min-h-5 items-center justify-between gap-3 text-xs">
        <span id={helpId} className="hidden text-muted-foreground md:inline">
          Enter sends · Shift+Enter starts a new line
        </span>
        {length >= MESSAGE_COUNTER_FROM ? (
          <span
            aria-live="polite"
            data-testid="message-counter"
            className={cn('ml-auto tabular-nums', overBy > 0 ? 'font-semibold text-brand-red-text' : 'text-muted-foreground')}
          >
            {length.toLocaleString('en-US')} / {MESSAGE_MAX_CHARS.toLocaleString('en-US')}
          </span>
        ) : null}
      </div>
      {overBy > 0 ? (
        <p role="alert" className="text-sm font-medium text-brand-red-text">
          Remove {overBy.toLocaleString('en-US')} {overBy === 1 ? 'character' : 'characters'} to send this message.
        </p>
      ) : null}
    </form>
  );
}
