/**
 * Frame sequence rules for the camera section. Pure functions with no DOM, so the behaviour is unit tested.
 *
 * Scroll progress runs from 0 (top of the pinned section) to 1 (end of the pin). Frame i is the render at progress
 * i / (FRAME_COUNT - 1), so the frame for any progress is round(progress * (FRAME_COUNT - 1)).
 */

/** Frames rendered in Blender (camera-pipeline/blender/sequence.py), frame-000 to frame-119. */
export const FRAME_COUNT = 120;

/** The capture moment: crossing this progress upward fires the flash once. */
export const CAPTURE_THRESHOLD = 0.55;
/** The flash is armed again only after progress drops below this, so small movements around the threshold do not repeat it. */
export const CAPTURE_REARM = 0.48;

/** The photograph is revealed between these progress values. */
export const PHOTO_START = 0.65;
export const PHOTO_END = 0.9;

/** The flash is brief: a fast rise and a short fade. It runs on a timer, so it finishes even if scrolling stops. */
export const FLASH_RISE_MS = 70;
export const FLASH_FALL_MS = 430;

/** Where each caption starts: opening, focus, capture and reveal. */
export const STEP_STARTS = [0, 0.25, 0.55, 0.65] as const;

export type FrameVariant = 'desktop' | 'mobile';

/** Which caption (0 to 3) is active at this progress. */
export function stepAt(progress: number): number {
  const p = clampProgress(progress);
  let step = 0;
  STEP_STARTS.forEach((start, index) => {
    if (p >= start) step = index;
  });
  return step;
}

export function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

export function frameIndexFor(progress: number, count: number = FRAME_COUNT): number {
  return Math.round(clampProgress(progress) * (count - 1));
}

export function frameUrl(variant: FrameVariant, index: number): string {
  return `/camera/frames/${variant}/frame-${String(index).padStart(3, '0')}.webp`;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 0 before the photograph is revealed, 1 once it is fully shown. */
export function photoRevealAt(progress: number): number {
  return smoothstep(PHOTO_START, PHOTO_END, clampProgress(progress));
}

export interface FlashDecision {
  fire: boolean;
  armed: boolean;
}

/**
 * Decides whether the capture flash fires for the current progress. It fires once when progress crosses the threshold
 * upward, then stays disarmed until progress falls below the re-arm level.
 */
export function nextFlash(armed: boolean, progress: number): FlashDecision {
  const p = clampProgress(progress);
  if (armed && p >= CAPTURE_THRESHOLD) return { fire: true, armed: false };
  if (!armed && p < CAPTURE_REARM) return { fire: false, armed: true };
  return { fire: false, armed };
}

/** Whether a flash that starts at the current progress should be armed. A page opened past the threshold is not. */
export function initialFlashArmed(progress: number): boolean {
  return clampProgress(progress) < CAPTURE_THRESHOLD;
}

/** Flash strength from 0 to 1, for a time in milliseconds since the flash fired. */
export function flashStrength(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  if (elapsedMs < FLASH_RISE_MS) return elapsedMs / FLASH_RISE_MS;
  const fall = (elapsedMs - FLASH_RISE_MS) / FLASH_FALL_MS;
  if (fall >= 1) return 0;
  return 1 - smoothstep(0, 1, fall);
}
