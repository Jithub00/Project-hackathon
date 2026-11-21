import { BOOKING_TIME_ZONE, CANCELLATION_GUARANTEE_HOURS } from './policy';

/**
 * Time rules for the 72-hour cancellation guarantee. Shared by the server (which decides) and the browser (which shows
 * the deadline). Elapsed time is measured between two instants, so daylight-saving changes count as real hours.
 */

const HOUR_MS = 60 * 60 * 1000;
export const GUARANTEE_MS = CANCELLATION_GUARANTEE_HOURS * HOUR_MS;

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    partsFormatters.set(zone, formatter);
  }
  return formatter;
}

/** Offset, in milliseconds, of a time zone's wall clock from UTC at one instant (negative west of Greenwich). */
export function zoneOffsetMs(utcMs: number, zone: string = BOOKING_TIME_ZONE): number {
  const wholeSeconds = Math.floor(utcMs / 1000) * 1000;
  const parts = partsFormatter(zone).formatToParts(new Date(wholeSeconds));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const wallClockAsUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour') % 24, value('minute'), value('second'));
  return wallClockAsUtc - wholeSeconds;
}

/**
 * Converts a wall-clock date (YYYY-MM-DD) and time (HH:MM) in the booking time zone to a UTC instant.
 * Returns null for malformed input. Two passes settle the offset on either side of a daylight-saving change.
 */
export function zonedWallClockToUtcMs(date: string, time: string, zone: string = BOOKING_TIME_ZONE): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstPass = wallAsUtc - zoneOffsetMs(wallAsUtc, zone);
  return wallAsUtc - zoneOffsetMs(firstPass, zone);
}

/** Scheduled start of a shoot as a UTC instant, or null when the agreed brief has no usable date and start time. */
export function scheduledStartMs(shootDate: string | null | undefined, shootStartTime: string | null | undefined): number | null {
  if (!shootDate || !shootStartTime) return null;
  return zonedWallClockToUtcMs(shootDate, shootStartTime);
}

/** The latest moment a cancellation still qualifies: exactly 72 elapsed hours before the scheduled start. */
export function cancellationDeadlineMs(startMs: number): number {
  return startMs - GUARANTEE_MS;
}

/** True when the cancellation is at least 72 elapsed hours before the scheduled start. Exactly 72 hours qualifies. */
export function qualifiesForAdvanceCancellation(cancelledAtMs: number, startMs: number): boolean {
  return startMs - cancelledAtMs >= GUARANTEE_MS;
}

/** Elapsed hours from the cancellation to the scheduled start. Negative once the start has passed. */
export function hoursBeforeStart(cancelledAtMs: number, startMs: number): number {
  return (startMs - cancelledAtMs) / HOUR_MS;
}

const displayFormatters = new Map<string, Intl.DateTimeFormat>();
/** A booking time for people, for example "Tue, Nov 24, 2026, 9:00 AM PST". Always in Los Angeles time by default. */
export function formatBookingTime(ms: number, zone: string = BOOKING_TIME_ZONE): string {
  let formatter = displayFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    displayFormatters.set(zone, formatter);
  }
  return formatter.format(new Date(ms));
}

export function toIsoInstant(ms: number): string {
  return new Date(ms).toISOString();
}
