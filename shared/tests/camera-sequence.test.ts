import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CAPTURE_REARM,
  CAPTURE_THRESHOLD,
  FLASH_FALL_MS,
  FLASH_RISE_MS,
  FRAME_COUNT,
  flashStrength,
  frameIndexFor,
  frameUrl,
  initialFlashArmed,
  nextFlash,
  photoRevealAt,
  stepAt,
} from '../../src/components/home/camera/sequence.ts';

describe('caption steps', () => {
  it('maps progress to the four captions at the chapter boundaries', () => {
    assert.equal(stepAt(-1), 0);
    assert.equal(stepAt(0.249), 0);
    assert.equal(stepAt(0.25), 1);
    assert.equal(stepAt(0.549), 1);
    assert.equal(stepAt(0.55), 2);
    assert.equal(stepAt(0.649), 2);
    assert.equal(stepAt(0.65), 3);
    assert.equal(stepAt(2), 3);
  });
});

/** Runs the flash rule over a series of progress values and returns how many times it fired. */
function countFlashes(progressValues: number[], armedAtStart = initialFlashArmed(0)): number {
  let armed = armedAtStart;
  let fires = 0;
  for (const progress of progressValues) {
    const decision = nextFlash(armed, progress);
    armed = decision.armed;
    if (decision.fire) fires += 1;
  }
  return fires;
}

describe('frame mapping', () => {
  it('has 120 frames, and the first and last frames sit at the ends of the sequence', () => {
    assert.equal(FRAME_COUNT, 120);
    assert.equal(frameIndexFor(0), 0);
    assert.equal(frameIndexFor(1), FRAME_COUNT - 1);
  });

  it('maps progress to the nearest frame and clamps out-of-range values', () => {
    assert.equal(frameIndexFor(0.5), 60);
    assert.equal(frameIndexFor(-3), 0);
    assert.equal(frameIndexFor(7), FRAME_COUNT - 1);
    assert.equal(frameIndexFor(Number.NaN), 0);
  });

  it('moves one frame at a time as progress advances, so every frame is reached', () => {
    const reached = new Set<number>();
    for (let step = 0; step <= 2000; step += 1) reached.add(frameIndexFor(step / 2000));
    assert.equal(reached.size, FRAME_COUNT);
  });

  it('builds zero-padded frame addresses for both sizes', () => {
    assert.equal(frameUrl('desktop', 0), '/camera/frames/desktop/frame-000.webp');
    assert.equal(frameUrl('mobile', 119), '/camera/frames/mobile/frame-119.webp');
  });
});

describe('photograph reveal', () => {
  it('stays hidden until the reveal starts and is fully shown by the end of the sequence', () => {
    assert.equal(photoRevealAt(0.6), 0);
    assert.equal(photoRevealAt(0.65), 0);
    assert.equal(photoRevealAt(0.9), 1);
    assert.equal(photoRevealAt(1), 1);
  });

  it('rises steadily between the start and the end of the reveal', () => {
    let previous = photoRevealAt(0.65);
    for (let step = 0; step <= 100; step += 1) {
      const value = photoRevealAt(0.65 + (0.25 * step) / 100);
      assert.ok(value >= previous - 1e-12, `reveal went backwards at step ${step}`);
      previous = value;
    }
  });
});

describe('capture flash', () => {
  it('fires once when progress crosses the capture threshold upward', () => {
    assert.equal(countFlashes([0.0, 0.2, 0.4, CAPTURE_THRESHOLD, 0.6, 0.8]), 1);
  });

  it('does not fire again when small movements cross the threshold', () => {
    const jitter = [0.54, 0.551, 0.549, 0.553, 0.548, 0.555, 0.546, 0.556, 0.5495, 0.5505];
    assert.equal(countFlashes(jitter, true), 1);
  });

  it('fires again after scrolling back below the re-arm level and forward again', () => {
    assert.equal(countFlashes([0.2, 0.56, 0.5, CAPTURE_REARM - 0.01, 0.56]), 2);
  });

  it('does not fire for a page opened past the threshold', () => {
    assert.equal(initialFlashArmed(0.7), false);
    assert.equal(countFlashes([0.7, 0.72, 0.9], initialFlashArmed(0.7)), 0);
  });

  it('is armed for a page opened before the threshold', () => {
    assert.equal(initialFlashArmed(0), true);
    assert.equal(initialFlashArmed(0.5), true);
  });

  it('rises quickly, fades in a short time, and is over before the photograph is fully revealed', () => {
    assert.equal(flashStrength(0), 0);
    assert.ok(Math.abs(flashStrength(FLASH_RISE_MS) - 1) < 1e-9);
    assert.ok(flashStrength(FLASH_RISE_MS + FLASH_FALL_MS / 2) < 1);
    assert.equal(flashStrength(FLASH_RISE_MS + FLASH_FALL_MS), 0);
    assert.equal(flashStrength(FLASH_RISE_MS + FLASH_FALL_MS + 1000), 0);
    assert.ok(FLASH_RISE_MS + FLASH_FALL_MS < 700, 'a brief flash, not a lingering one');
  });

  it('keeps the flash strength within 0 and 1 and never negative for odd inputs', () => {
    for (let ms = -100; ms <= 1000; ms += 5) {
      const strength = flashStrength(ms);
      assert.ok(strength >= 0 && strength <= 1, `strength ${strength} at ${ms} ms`);
    }
    assert.equal(flashStrength(Number.NaN), 0);
  });

  it('falls smoothly, with no step between neighbouring times', () => {
    let previous = flashStrength(FLASH_RISE_MS);
    for (let ms = FLASH_RISE_MS; ms <= FLASH_RISE_MS + FLASH_FALL_MS; ms += 5) {
      const value = flashStrength(ms);
      assert.ok(Math.abs(value - previous) < 0.05, `flash jumped at ${ms} ms`);
      previous = value;
    }
  });
});
