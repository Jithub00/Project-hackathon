import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FieldError } from '@/components/site/ui-bits';
import { BIO_MAX_WORDS, countWords } from '../../../shared/biography';
import { cn } from '@/lib/utils';

/**
 * Biography textarea with a live counter. Text is never truncated: when the limit
 * is exceeded the counter turns red, a clear message appears, and saving is blocked.
 */
export function WordCountField({
  id,
  label,
  value,
  onChange,
  rows = 9,
  placeholder,
  hint,
  error,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  testId?: string;
}) {
  const words = countWords(value);
  const over = words > BIO_MAX_WORDS;
  const message = over
    ? `Your biography is ${words} words. Remove ${words - BIO_MAX_WORDS} ${words - BIO_MAX_WORDS === 1 ? 'word' : 'words'} to save. Your text has not been changed.`
    : null;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-sm font-semibold">{label}</Label>
      <Textarea
        id={id}
        name="bio"
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={over || Boolean(error)}
        aria-describedby={`${id}-hint ${id}-count`}
        data-testid={testId ?? 'bio-input'}
        className="min-h-40 resize-y bg-card text-base leading-relaxed"
      />
      <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
        <p id={`${id}-hint`} className="max-w-xl text-muted-foreground">{hint}</p>
        <p
          id={`${id}-count`}
          data-testid="word-count"
          aria-live="polite"
          className={cn('shrink-0 tabular-nums', over ? 'font-bold text-brand-red-text' : 'text-muted-foreground')}
        >
          {words} / {BIO_MAX_WORDS} words
        </p>
      </div>
      {message ? (
        <p role="alert" data-testid="bio-too-long" className="text-sm font-semibold text-brand-red-text">
          {message}
        </p>
      ) : null}
      <FieldError message={error} />
    </div>
  );
}
