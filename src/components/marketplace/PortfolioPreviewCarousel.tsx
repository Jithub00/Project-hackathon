import { useEffect, useMemo, useState } from 'react';
import { Camera } from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { cn } from '@/lib/utils';
import type { PortfolioPreviewItem } from '../../../shared/types';

interface PortfolioPreviewCarouselProps {
  creatorName: string;
  /** The creator's first photos, already in their saved order (at most three). */
  photos: PortfolioPreviewItem[];
}

/**
 * Portfolio preview for a creator card. One photo at a time in a fixed landscape frame.
 * Arrows, dots, keyboard arrows and touch swiping all move between photos. Each card has its
 * own Embla instance, so moving one creator's photos never moves another's. Nothing autoplays.
 * The carousel sits outside any link, so arrows and swipes never open the profile.
 */
export function PortfolioPreviewCarousel({ creatorName, photos }: PortfolioPreviewCarouselProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);
  const count = photos.length;

  const options = useMemo(
    () => ({ align: 'start' as const, loop: false, duration: reducedMotion ? 0 : 25 }),
    [reducedMotion],
  );

  useEffect(() => {
    if (!api) return;
    const sync = () => setIndex(api.selectedScrollSnap());
    sync();
    api.on('select', sync);
    api.on('reInit', sync);
    return () => {
      api.off('select', sync);
      api.off('reInit', sync);
    };
  }, [api]);

  if (count === 0) {
    return (
      <div
        data-testid="portfolio-empty"
        className="flex aspect-[3/2] w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border-strong bg-surface-raised text-center"
      >
        <Camera className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-semibold">No portfolio photos yet</p>
      </div>
    );
  }

  const showNavigation = count > 1;

  return (
    <div className="flex flex-col gap-3" data-testid="portfolio-preview" data-count={count}>
      <Carousel
        setApi={setApi}
        opts={options}
        tabIndex={0}
        aria-label={`${creatorName}: portfolio photos`}
        data-testid="portfolio-carousel"
        className="select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      >
        <CarouselContent className="ml-0 touch-pan-y">
          {photos.map((photo, i) => (
            <CarouselItem key={photo.id} className="pl-0" aria-label={`Photo ${i + 1} of ${count}`} data-testid="portfolio-slide">
              <div className="relative aspect-[3/2] w-full overflow-hidden rounded-md border border-border bg-surface-raised">
                <img
                  src={photo.mediaUrl}
                  alt={photo.title}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        {showNavigation ? (
          <>
            <CarouselPrevious
              data-testid="portfolio-prev"
              className="left-2 inset-y-0 my-auto size-8 border-white/30 bg-black/70 text-white backdrop-blur-sm transition-colors duration-200 hover:border-primary hover:bg-primary hover:text-white"
            />
            <CarouselNext
              data-testid="portfolio-next"
              className="right-2 inset-y-0 my-auto size-8 border-white/30 bg-black/70 text-white backdrop-blur-sm transition-colors duration-200 hover:border-primary hover:bg-primary hover:text-white"
            />
          </>
        ) : null}
      </Carousel>
      {showNavigation ? (
        <div className="flex items-center justify-center gap-1" role="group" aria-label={`Choose a photo of ${creatorName}`}>
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => api?.scrollTo(i)}
              aria-label={`Show photo ${i + 1} of ${count}`}
              aria-current={i === index ? 'true' : undefined}
              data-testid="portfolio-dot"
              className="flex h-6 w-6 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300 ease-out',
                  i === index ? 'w-4 bg-primary' : 'w-1.5 bg-white/40 hover:bg-white/70',
                )}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
