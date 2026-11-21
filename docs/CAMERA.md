# The camera sequence

The homepage has a pinned, scroll-driven camera. As the visitor scrolls, a compact mirrorless camera with a kit lens turns to face them, focuses, takes a photograph, and reveals a Los Angeles print. Scrolling back reverses the sequence, and stopping holds the frame.

The camera is a set of 120 Blender renders, played back in step with the scroll. The scene, the scripts and the licences are in [`camera-pipeline/`](../camera-pipeline/README.md).

## What the visitor sees

| Scroll progress | Caption | What happens |
| --- | --- | --- |
| 0 to 25% | Frame the subject | The camera settles from a three-quarter view as the studio light comes up. |
| 25 to 55% | Lock focus | The camera turns to face the viewer. Inside the lens, the focus group moves a little. |
| 55 to 65% | Capture the moment | The shutter button presses, the pop-up flash rises and a brief flash fires once. |
| 65 to 100% | Reveal the work | The camera slides aside, and the sample print comes forward on the right. |

The captions and the chapter boundaries come from the same values (`STEP_STARTS` in `src/components/home/camera/sequence.ts`).

## How it plays

- **Frames.** `public/camera/frames/desktop/` (1152 px) and `public/camera/frames/mobile/` (640 px) hold `frame-000.webp` to `frame-119.webp`. Frame `i` is the render at progress `i / 119`, so the frame for any scroll position is `round(progress × 119)`.
- **Scroll.** A GSAP ScrollTrigger tween is pinned to the viewport (240% of the viewport on desktop, 170% on phones) and scrubbed (`scrub: 0.6`). Each update asks the stage for the matching frame.
- **Drawing.** `FrameStage.tsx` draws the frame to a canvas. If the exact frame has not loaded yet, the nearest loaded frame is drawn, so the stage never goes blank.
- **Loading.** The poster (frame 0) shows at once. Frames load in a window of three either side of the current one, and the encoded frames are warmed into the browser cache once the section is near the screen.
- **Memory.** Only a bounded number of frames are decoded at once: 14 on desktop and 36 on phones. Each decoded desktop frame is about 5 MB, so the rest stay encoded.
- **Flash.** The capture flash is a timed overlay, not a scrubbed one. It fires once when progress crosses 55% upward, and it re-arms only after progress falls below 48%, so small movements around the threshold do not repeat it. The flash rises in 70 ms and fades in 430 ms, on its own timer, so it finishes even if scrolling stops. It is a small glow at the flash head, with a faint streak across the lens. It is never a full-screen flash.
- **Photograph.** The sample print is a DOM element. It fades in and settles between 65% and 90% of the progress.

## Fallbacks and accessibility

- **Reduced motion.** There is no pinning and no animation. The finished frame is shown once, with the photograph revealed, and all four captions are visible. No flash fires.
- **Frames unavailable.** If frames fail to load, the poster stays on screen, and the captions and the scroll keep working.
- **Captions.** The four captions remain the readable description of the sequence, and the stage itself is decorative (`aria-hidden`).

## Verification

- **Unit (15 tests).** `shared/tests/camera-sequence.test.ts` covers the frame mapping, the photograph reveal curve, the capture flash (firing once, the jitter around the threshold, re-arming, a page opened past the threshold, and the flash envelope), and the caption steps.
- **End to end.** `tests/e2e/motion.spec.ts` covers the frames advancing with the scroll in both directions, the flash firing once and not on small movements, the flash fading with scrolling stopped, reduced motion, the poster remaining when frames fail, and the phone layout without horizontal overflow.
- **Visual.** The master renders were checked frame by frame at the key points (reveal, focus, capture, reveal) against the two reference photographs. The website was checked at desktop and phone sizes.

## Regenerating the frames

Follow [`camera-pipeline/README.md`](../camera-pipeline/README.md): render the 1152 px master frames with `blender/sequence.py`, then run `tools/export_frames.py` to write the WebP frames into `public/camera/frames/`.

## Known limits

- **Not photorealistic in the strict sense.** The model is built from primitives. It reads as a studio render, and its surfaces, seams and glass are simplified compared with a scan or an artist-made asset.
- **Flash emission is not rendered.** The flash and the lens reflection are a timed overlay, placed from the Blender camera projection (`camera-pipeline/blender/anchors.py`).
- **Not measured on real devices.** Frame rate, decode time and memory have not been profiled on phones.
- **Download size.** The desktop frames total about the size the export script reports, and the first view downloads the frames it needs as the visitor scrolls. Phones use the 640 px set.
