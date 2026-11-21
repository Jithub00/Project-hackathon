import { expect, test, type Page } from '@playwright/test';

/** Document offset of the camera section, read in page coordinates. */
async function sectionTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="camera-sequence"]') as HTMLElement;
    return el.getBoundingClientRect().top + window.scrollY;
  });
}

/** Scrolls so that the pinned section is at the given progress (the pin is 240% of the viewport on desktop). */
async function scrollToProgress(page: Page, top: number, progress: number, pinnedPixels = 2160) {
  await page.evaluate(
    ([y]) => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }),
    [top + progress * pinnedPixels],
  );
}

test.describe('Scroll-controlled camera sequence', () => {
  test('the frames advance with scroll position and reverse smoothly', async ({ page }) => {
    await page.goto('/');
    const section = page.getByTestId('camera-sequence');
    await expect(section).toHaveAttribute('data-motion', 'full');
    await expect(section).toHaveAttribute('data-render', 'frames');
    await expect(section).toHaveAttribute('data-step', '0');
    await expect(page.getByTestId('camera-stage').locator('canvas')).toHaveCount(1);

    const top = await sectionTop(page);
    await scrollToProgress(page, top, 0.4);
    await expect.poll(async () => Number(await section.getAttribute('data-step')), { timeout: 8_000 }).toBe(1);

    await scrollToProgress(page, top, 0.6);
    await expect.poll(async () => Number(await section.getAttribute('data-step')), { timeout: 8_000 }).toBe(2);

    await scrollToProgress(page, top, 0.9);
    await expect.poll(async () => Number(await section.getAttribute('data-step')), { timeout: 8_000 }).toBe(3);
    await expect(page.getByTestId('camera-photo')).toHaveCSS('opacity', '1');
    await expect(page.getByTestId('camera-print')).toHaveCSS('opacity', '1');

    await scrollToProgress(page, top, 0);
    await expect.poll(async () => Number(await section.getAttribute('data-step')), { timeout: 8_000 }).toBe(0);
    await expect(page.getByTestId('camera-photo')).toHaveCSS('opacity', '0');
  });

  test('the capture flash fires once when the threshold is crossed, not for small movements around it', async ({ page }) => {
    await page.goto('/');
    const section = page.getByTestId('camera-sequence');
    await expect(section).toHaveAttribute('data-render', 'frames');
    const top = await sectionTop(page);

    await scrollToProgress(page, top, 0.4);
    await expect.poll(async () => Number(await section.getAttribute('data-step')), { timeout: 8_000 }).toBe(1);
    await expect(section).toHaveAttribute('data-flashes', '0');

    await scrollToProgress(page, top, 0.6);
    await expect(section).toHaveAttribute('data-flashes', '1', { timeout: 8_000 });

    // Small movements back and forth across the threshold must not fire the flash again.
    for (const progress of [0.545, 0.56, 0.548, 0.558, 0.546, 0.556]) {
      await scrollToProgress(page, top, progress);
    }
    await expect(section).toHaveAttribute('data-flashes', '1');

    // Scrolling well back re-arms the flash, and crossing again fires it once more.
    await scrollToProgress(page, top, 0.3);
    await expect.poll(async () => Number(await section.getAttribute('data-step')), { timeout: 8_000 }).toBe(1);
    await scrollToProgress(page, top, 0.6);
    await expect(section).toHaveAttribute('data-flashes', '2', { timeout: 8_000 });
  });

  test('the flash fades on its own timer, even when scrolling stops', async ({ page }) => {
    await page.goto('/');
    const section = page.getByTestId('camera-sequence');
    await expect(section).toHaveAttribute('data-render', 'frames');
    const top = await sectionTop(page);
    await scrollToProgress(page, top, 0.4);
    await expect.poll(async () => Number(await section.getAttribute('data-step')), { timeout: 8_000 }).toBe(1);

    const flash = page.getByTestId('camera-flash');
    await scrollToProgress(page, top, 0.6);
    await expect(section).toHaveAttribute('data-flashes', '1', { timeout: 8_000 });
    // No further scrolling: the overlay peaks briefly, then returns to transparent on its own.
    await expect.poll(async () => Number(await flash.evaluate((el) => getComputedStyle(el).opacity)), { timeout: 1_500 }).toBeGreaterThan(0.05);
    await expect.poll(async () => Number(await flash.evaluate((el) => getComputedStyle(el).opacity)), { timeout: 3_000 }).toBeLessThan(0.01);
  });

  test('reduced motion shows the finished frame and the photograph, statically, with no pinned animation', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto('/');
    const section = page.getByTestId('camera-sequence');
    await expect(section).toHaveAttribute('data-motion', 'reduced');
    await expect(section).toHaveAttribute('data-render', 'static');
    await expect(section.getByTestId('camera-stage').locator('img').first()).toHaveAttribute('src', /frame-119\.webp$/);
    for (let i = 0; i < 4; i += 1) {
      await expect(page.getByTestId(`camera-caption-${i}`)).toBeVisible();
      await expect(page.getByTestId(`camera-caption-${i}`)).toHaveCSS('opacity', '1');
    }
    await expect(page.getByTestId('camera-photo')).toHaveCSS('opacity', '1');
    await expect(page.getByTestId('camera-print')).toHaveCSS('opacity', '1');
    const pinned = await section.evaluate((el) => Boolean(el.parentElement?.classList.contains('pin-spacer')));
    expect(pinned).toBeFalsy();
    await expect(section).toHaveAttribute('data-flashes', '0');
    await context.close();
  });

  test('if the frames cannot load, the poster stays and the captions still follow the scroll', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    // Only the first frame loads; every other frame fails, as if the file server were unreachable.
    await page.route('**/camera/frames/**', (route) =>
      route.request().url().endsWith('frame-000.webp') ? route.continue() : route.abort(),
    );
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    const section = page.getByTestId('camera-sequence');
    await expect(section.getByTestId('camera-stage').locator('img').first()).toHaveAttribute('src', /frame-000\.webp$/);
    const top = await sectionTop(page);
    await scrollToProgress(page, top, 0.6);
    await expect.poll(async () => Number(await section.getAttribute('data-step')), { timeout: 8_000 }).toBe(2);
    expect(errors).toEqual([]);
    await context.close();
  });

  test('phones get a lighter stage without horizontal overflow', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByTestId('camera-sequence')).toHaveAttribute('data-motion', 'compact');
    await expect(page.getByTestId('camera-sequence')).toHaveAttribute('data-render', 'frames');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await context.close();
  });
});
