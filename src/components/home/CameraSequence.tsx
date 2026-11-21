import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Button } from '@/components/ui/button';
import { FrameStage, type FrameStageHandle } from './camera/FrameStage';
import { FRAME_COUNT, clampProgress, frameUrl, initialFlashArmed, nextFlash, photoRevealAt, stepAt, type FrameVariant } from './camera/sequence';

gsap.registerPlugin(ScrollTrigger);

const PHOTO_URL = '/images/samples/la-05-griffith-observatory-dusk.jpg';
/** Reduced-motion visitors see the finished frame, with the photograph revealed. */
const STATIC_PROGRESS = 0.92;

const STEPS = [
  {
    title: 'Frame the subject',
    body: 'Every shoot starts with a clear subject and the right light. Describe the project and choose a Los Angeles neighbourhood.',
  },
  {
    title: 'Lock focus',
    body: 'Budget, dates and deliverables come into focus together, so the team you assemble is built around the brief.',
  },
  {
    title: 'Capture the moment',
    body: 'Everyone approves the same agreement. The deposit confirms the booking and the day is on the calendar.',
  },
  {
    title: 'Reveal the work',
    body: 'Files arrive on schedule with the included revisions. Both sides leave reviews from the completed booking.',
  },
];

/**
 * Scroll-controlled camera. A ScrollTrigger tween is pinned to the viewport and scrubbed by scroll position, so the
 * frames move forward and backward smoothly and hold still when scrolling stops. The capture flash is timed rather
 * than scrubbed, so it finishes even if scrolling stops. Reduced-motion visitors see the finished frame with no pin.
 */
export function CameraSequence() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<FrameStageHandle>(null);
  const [variant] = useState<FrameVariant>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches ? 'mobile' : 'desktop',
  );
  const [reduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const photo = section.querySelector<HTMLElement>('[data-testid="camera-photo"]');
    const print = section.querySelector<HTMLElement>('[data-testid="camera-print"]');
    const captions = Array.from(section.querySelectorAll<HTMLElement>('[data-caption]'));
    const flashState = { armed: true, count: 0 };

    // Writes progress to the page: captions, progress line, the reveal of the photograph, and the frame.
    const apply = (value: number) => {
      const p = clampProgress(value);
      const step = stepAt(p);
      if (section.dataset.step !== String(step)) section.dataset.step = String(step);
      section.dataset.progress = p.toFixed(3);
      section.style.setProperty('--progress', p.toFixed(3));
      captions.forEach((caption, index) => {
        caption.dataset.active = index === step ? 'true' : 'false';
      });
      const reveal = photoRevealAt(p);
      if (photo) {
        photo.style.opacity = String(reveal);
        photo.style.transform = `translateX(${(1 - reveal) * 28}px) rotate(${(-1.5 * reveal).toFixed(2)}deg)`;
      }
      if (print) print.style.opacity = String(reveal);
      stageRef.current?.setProgress(p);

      const decision = nextFlash(flashState.armed, p);
      flashState.armed = decision.armed;
      if (decision.fire) {
        flashState.count += 1;
        section.dataset.flashes = String(flashState.count);
        stageRef.current?.flash();
      }
    };

    const mm = gsap.matchMedia();
    mm.add(
      {
        reduce: '(prefers-reduced-motion: reduce)',
        desktop: '(prefers-reduced-motion: no-preference) and (min-width: 1024px)',
        compact: '(prefers-reduced-motion: no-preference) and (max-width: 1023px)',
      },
      (context) => {
        const conditions = context.conditions as { reduce?: boolean; desktop?: boolean; compact?: boolean };
        if (conditions.reduce) {
          section.dataset.motion = 'reduced';
          // The finished frame is shown without the capture flash: reduced motion never flashes.
          flashState.armed = false;
          apply(STATIC_PROGRESS);
          return;
        }
        const full = Boolean(conditions.desktop);
        section.dataset.motion = full ? 'full' : 'compact';

        const state = { progress: 0 };
        flashState.armed = initialFlashArmed(0);
        apply(0);
        gsap.to(state, {
          progress: 1,
          ease: 'none',
          onUpdate: () => apply(state.progress),
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: full ? '+=240%' : '+=170%',
            scrub: 0.6,
            pin: true,
            // The page's <main> is a flex column, where GSAP would otherwise drop the pin spacer.
            pinSpacing: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });
      },
    );

    const refresh = () => ScrollTrigger.refresh();
    const frame = window.requestAnimationFrame(refresh);
    window.addEventListener('load', refresh);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('load', refresh);
      mm.revert();
    };
  }, [variant]);

  return (
    <section
      ref={sectionRef}
      aria-label="Scroll sequence: frame, focus, capture and reveal"
      data-testid="camera-sequence"
      data-step="0"
      data-motion="static"
      data-render={reduced ? 'static' : 'frames'}
      data-flashes="0"
      className="relative flex min-h-[100dvh] w-full items-center overflow-hidden border-y border-border bg-black"
      style={{ ['--progress' as string]: 0 }}
    >
      <div className="mx-auto grid w-full max-w-7xl items-center gap-6 px-5 py-6 md:gap-12 md:px-8 md:py-20 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <div className="order-2 flex flex-col gap-5 md:gap-8 lg:order-1">
          <p className="eyebrow">The shot, step by step</p>
          <h2 className="text-4xl font-black uppercase leading-[0.95] tracking-tight md:text-6xl">
            From first frame to <span className="text-brand-red-text">final print</span>
          </h2>

          <div className="cam-captions relative flex flex-col gap-8">
            {STEPS.map((step, index) => (
              <div
                key={step.title}
                data-caption={index}
                data-active={index === 0 ? 'true' : 'false'}
                data-testid={`camera-caption-${index}`}
                className="cam-caption flex flex-col gap-3"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-red-text">
                  0{index + 1} · {step.title}
                </p>
                <p className="max-w-md text-lg leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div className="relative h-px w-full overflow-hidden bg-white/15" aria-hidden>
              <div className="absolute inset-y-0 left-0 h-px w-full origin-left bg-primary" style={{ transform: 'scaleX(var(--progress, 0))' }} />
            </div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground" data-testid="scroll-hint">
              Scroll to take the shot
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/discover">Find LA Photographers &amp; Videographers</Link>
            </Button>
          </div>
        </div>

        <div className="order-1 relative mx-auto w-full max-w-xl lg:order-2">
          <div data-testid="camera-stage" className="relative mx-auto aspect-square w-full max-w-[17.5rem] overflow-hidden bg-black md:max-w-xl">
            {reduced ? (
              <img
                src={frameUrl(variant, FRAME_COUNT - 1)}
                alt=""
                aria-hidden="true"
                decoding="async"
                className="absolute inset-0 h-full w-full object-contain"
              />
            ) : (
              <FrameStage ref={stageRef} variant={variant} />
            )}
            <figure
              data-testid="camera-photo"
              className="absolute bottom-[4%] right-[4%] w-[40%] bg-white p-2 shadow-2xl"
              style={{ opacity: reduced ? 1 : 0 }}
            >
              <img
                src={PHOTO_URL}
                alt="Sample print: Griffith Observatory at dusk"
                decoding="async"
                className="aspect-[4/3] w-full object-cover"
              />
            </figure>
          </div>
          <p
            data-testid="camera-print"
            className="mt-2 text-center text-xs uppercase tracking-[0.16em] text-muted-foreground md:mt-4"
            style={{ opacity: reduced ? 1 : 0 }}
          >
            Sample print · Griffith Observatory at dusk, Los Angeles
          </p>
        </div>
      </div>
    </section>
  );
}
