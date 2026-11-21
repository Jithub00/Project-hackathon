import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cancellationDeadlineMs,
  formatBookingTime,
  hoursBeforeStart,
  qualifiesForAdvanceCancellation,
  scheduledStartMs,
  zonedWallClockToUtcMs,
} from '../cancellation';
import { CANCELLATION_GUARANTEE_HOURS } from '../policy';

const HOUR = 3_600_000;
const utc = (iso: string) => Date.parse(iso);

describe('Los Angeles wall-clock times', () => {
  it('uses Pacific standard time in November and daylight time in July', () => {
    // 9:00 AM Pacific standard time is 17:00 UTC.
    assert.equal(zonedWallClockToUtcMs('2026-11-24', '09:00'), utc('2026-11-24T17:00:00Z'));
    // 9:00 AM Pacific daylight time is 16:00 UTC.
    assert.equal(zonedWallClockToUtcMs('2026-07-01', '09:00'), utc('2026-07-01T16:00:00Z'));
  });

  it('applies the daylight-saving change on the day it happens (8 March 2026)', () => {
    // Before the change at 2:00 AM, the offset is standard time.
    assert.equal(zonedWallClockToUtcMs('2026-03-08', '01:30'), utc('2026-03-08T09:30:00Z'));
    // After the change, the offset is daylight time.
    assert.equal(zonedWallClockToUtcMs('2026-03-08', '03:30'), utc('2026-03-08T10:30:00Z'));
  });

  it('returns null for malformed dates and times instead of guessing', () => {
    assert.equal(zonedWallClockToUtcMs('2026-13-01', '09:00'), null);
    assert.equal(zonedWallClockToUtcMs('2026-11-24', '9am'), null);
    assert.equal(scheduledStartMs(null, '09:00'), null);
    assert.equal(scheduledStartMs('2026-11-24', ''), null);
  });
});

describe('the 72-hour cancellation guarantee', () => {
  const start = utc('2026-11-24T17:00:00Z'); // 9:00 AM Pacific, Tuesday 24 November 2026.

  it('uses 72 hours', () => {
    assert.equal(CANCELLATION_GUARANTEE_HOURS, 72);
    assert.equal(cancellationDeadlineMs(start), utc('2026-11-21T17:00:00Z'));
  });

  it('qualifies at exactly 72 elapsed hours before the scheduled start', () => {
    assert.equal(qualifiesForAdvanceCancellation(utc('2026-11-21T17:00:00Z'), start), true);
    assert.equal(hoursBeforeStart(utc('2026-11-21T17:00:00Z'), start), 72);
  });

  it('does not qualify one millisecond inside the 72 hours', () => {
    assert.equal(qualifiesForAdvanceCancellation(utc('2026-11-21T17:00:00.001Z'), start), false);
  });

  it('qualifies comfortably in advance and never after the start', () => {
    assert.equal(qualifiesForAdvanceCancellation(utc('2026-11-01T00:00:00Z'), start), true);
    assert.equal(qualifiesForAdvanceCancellation(start, start), false);
    assert.equal(qualifiesForAdvanceCancellation(start + HOUR, start), false);
  });

  it('counts real elapsed hours across a daylight-saving change, not calendar days', () => {
    // Saturday 7 March 2026, 9:00 AM Pacific standard time, to Tuesday 10 March 2026, 9:00 AM Pacific daylight time.
    // That is three calendar days, but the clock jumps forward an hour, so only 71 elapsed hours pass.
    const cancelled = utc('2026-03-07T17:00:00Z');
    const shoot = scheduledStartMs('2026-03-10', '09:00');
    assert.notEqual(shoot, null);
    assert.equal(hoursBeforeStart(cancelled, shoot as number), 71);
    assert.equal(qualifiesForAdvanceCancellation(cancelled, shoot as number), false);
  });
});

describe('booking times for people', () => {
  it('shows the Los Angeles time zone label', () => {
    const text = formatBookingTime(utc('2026-11-24T17:00:00Z'));
    assert.match(text, /9:00 AM/);
    assert.match(text, /PST/);
    assert.match(text, /Nov 24, 2026/);
  });
});
