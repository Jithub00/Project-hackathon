import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { FRAME_COUNT, frameIndexFor, frameUrl, type FrameVariant } from './sequence';

export interface FrameStageHandle {
  setProgress: (progress: number) => void;
  flash: () => void;
}

interface FrameStageProps {
  variant: FrameVariant;
}

/** Decoded frames kept in memory. A desktop frame decodes to about 5 MB, so the cache is kept small. */
const DECODED_LIMIT: Record<FrameVariant, number> = { desktop: 14, mobile: 36 };
/** Frames decoded either side of the current one, so scrolling rarely waits for the network. */
const AHEAD_BEHIND = 3;

/**
 * Where the capture flash and the lens reflection sit, as percentages of the stage. Projected from the Blender camera
 * by camera-pipeline/blender/anchors.py, so they match the rendered frames.
 */
const FLASH_AT = { x: '53.05%', y: '29.6%' };
const LENS_AT = { x: '50%', y: '50%' };

/**
 * The camera, drawn from rendered frames. The page calls setProgress with scroll progress and the stage draws the
 * matching frame. Frames load in a window around the current one, and only a bounded number are decoded at once.
 */
export const FrameStage = forwardRef<FrameStageHandle, FrameStageProps>(function FrameStage({ variant }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const reflectionRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<FrameStageHandle | null>(null);
  const [drawn, setDrawn] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      setProgress: (progress: number) => handleRef.current?.setProgress(progress),
      flash: () => handleRef.current?.flash(),
    }),
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const cache = new Map<number, ImageBitmap>(); // insertion order is recency: the first entry is the least recent.
    const inflight = new Map<number, Promise<ImageBitmap | null>>();
    let alive = true;
    let current = 0;
    let lastPainted = -1;
    let warmed = false;

    const paint = (bitmap: ImageBitmap) => {
      const context = canvas.getContext('2d');
      if (!context) return;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      setDrawn(true);
    };

    const trim = () => {
      while (cache.size > DECODED_LIMIT[variant]) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.get(oldest)?.close();
        cache.delete(oldest);
      }
    };

    const load = (index: number): Promise<ImageBitmap | null> => {
      const hit = cache.get(index);
      if (hit) {
        cache.delete(index);
        cache.set(index, hit); // touch: this frame is now the most recent
        return Promise.resolve(hit);
      }
      const pending = inflight.get(index);
      if (pending) return pending;
      const request = fetch(frameUrl(variant, index), { cache: 'force-cache' })
        .then((response) => {
          if (!response.ok) throw new Error(`frame ${index} returned ${response.status}`);
          return response.blob();
        })
        .then((blob) => createImageBitmap(blob))
        .then((bitmap) => {
          inflight.delete(index);
          if (!alive) {
            bitmap.close();
            return null;
          }
          cache.set(index, bitmap);
          trim();
          return bitmap;
        })
        .catch(() => {
          inflight.delete(index);
          return null;
        });
      inflight.set(index, request);
      return request;
    };

    const clampIndex = (index: number) => Math.min(FRAME_COUNT - 1, Math.max(0, index));

    const show = (index: number) => {
      current = index;
      const exact = cache.get(index);
      if (exact) {
        lastPainted = index;
        paint(exact);
      } else {
        // Paint the nearest decoded frame so the stage never goes blank while the exact frame loads.
        for (let distance = 1; distance <= 6; distance += 1) {
          const near = cache.get(index - distance) ?? cache.get(index + distance);
          if (near) {
            paint(near);
            break;
          }
        }
      }
      void load(index).then((bitmap) => {
        if (bitmap && alive && current === index && lastPainted !== index) {
          lastPainted = index;
          paint(bitmap);
        }
      });
      for (let offset = 1; offset <= AHEAD_BEHIND; offset += 1) {
        void load(clampIndex(index + offset));
        void load(clampIndex(index - offset));
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, variant === 'desktop' ? 2 : 1.5);
      const width = Math.max(1, Math.round(container.clientWidth * dpr));
      const height = Math.max(1, Math.round(container.clientHeight * dpr));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      const bitmap = cache.get(lastPainted);
      if (bitmap) paint(bitmap);
    };

    const warm = async () => {
      // Fetches the encoded frames into the browser's HTTP cache, one at a time, without decoding them.
      for (let index = 0; index < FRAME_COUNT && alive; index += 1) {
        if (!cache.has(index)) {
          await fetch(frameUrl(variant, index), { cache: 'force-cache' }).then((response) => response.blob()).catch(() => undefined);
        }
      }
    };

    const setProgress = (progress: number) => {
      const index = frameIndexFor(progress);
      if (index !== current || lastPainted !== index) show(index);
    };

    const flash = () => {
      const timing = { easing: 'linear', fill: 'none' } as const;
      flashRef.current?.animate?.(
        [{ opacity: 0 }, { opacity: 0.42, offset: 0.14 }, { opacity: 0 }],
        { ...timing, duration: 520 },
      );
      reflectionRef.current?.animate?.(
        [{ opacity: 0 }, { opacity: 0.22, offset: 0.16 }, { opacity: 0 }],
        { ...timing, duration: 560 },
      );
    };

    handleRef.current = { setProgress, flash };
    resize();
    show(0);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    // Start loading only when the stage is near the screen, so a far-away section costs nothing.
    const intersection = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || warmed) return;
        warmed = true;
        show(current);
        window.setTimeout(() => {
          void warm();
        }, 600);
      },
      { rootMargin: '150% 0px' },
    );
    intersection.observe(container);

    return () => {
      alive = false;
      handleRef.current = null;
      resizeObserver.disconnect();
      intersection.disconnect();
      cache.forEach((bitmap) => bitmap.close());
      cache.clear();
    };
  }, [variant]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <img
        src={frameUrl(variant, 0)}
        alt=""
        aria-hidden="true"
        decoding="async"
        className={cn('absolute inset-0 h-full w-full object-contain transition-opacity duration-700', drawn ? 'opacity-0' : 'opacity-100')}
      />
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
      {/* Lens reflection: a brief, narrow streak in the coating colours, across the front element. */}
      <div
        ref={reflectionRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0"
        style={{
          mixBlendMode: 'screen',
          background: `radial-gradient(ellipse 30% 4% at ${LENS_AT.x} ${LENS_AT.y}, rgba(120, 170, 255, 0.55), rgba(180, 120, 255, 0.25) 45%, rgba(0, 0, 0, 0) 75%)`,
        }}
      />
      {/* Capture flash: a small glow from the pop-up flash head, never a full-screen white flash. */}
      <div
        ref={flashRef}
        data-testid="camera-flash"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0"
        style={{
          mixBlendMode: 'screen',
          background: `radial-gradient(circle at ${FLASH_AT.x} ${FLASH_AT.y}, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.35) 6%, rgba(255, 255, 255, 0) 18%)`,
        }}
      />
    </div>
  );
});
