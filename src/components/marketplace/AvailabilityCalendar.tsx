import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

/** Converts YYYY-MM-DD to a local Date (avoids timezone drift). */
export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Availability calendar. Creators mark the specific dates they can take. Booked
 * dates are shown struck through and cannot be selected.
 */
export function AvailabilityCalendar({
  available,
  booked,
  onChange,
  readOnly = false,
  testId = 'availability-calendar',
}: {
  available: string[];
  booked: string[];
  onChange?: (next: string[]) => void;
  readOnly?: boolean;
  testId?: string;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bookedDates = booked.map(parseIso);
  return (
    <div className="flex flex-col gap-4" data-testid={testId}>
      <Calendar
        mode="multiple"
        selected={available.map(parseIso)}
        onSelect={(dates) => {
          if (readOnly || !onChange) return;
          onChange((dates ?? []).map(toIso).sort());
        }}
        disabled={[{ before: today }, ...bookedDates]}
        modifiers={{ booked: bookedDates }}
        modifiersClassNames={{ booked: 'line-through opacity-60' }}
        className="w-full max-w-sm rounded-lg border border-border bg-card p-4"
        aria-label="Specific dates you are available"
      />
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground" aria-label="Calendar key">
        <li className="flex items-center gap-2">
          <span className={cn('inline-block size-3 rounded-sm bg-primary')} aria-hidden /> Available
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-sm border border-white/50 line-through" aria-hidden /> Booked
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-sm border border-border" aria-hidden /> Not offered
        </li>
      </ul>
    </div>
  );
}
