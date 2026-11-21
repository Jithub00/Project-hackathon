import { expect, test, type Locator, type Page } from '@playwright/test';
import { apiSignupCreator } from './helpers';

/** The creator card that contains this creator's name. */
function cardFor(page: Page, name: string): Locator {
  return page.getByTestId('creator-card').filter({ hasText: name }).first();
}

async function expectActiveDot(card: Locator, index: number) {
  await expect(card.getByTestId('portfolio-dot').nth(index)).toHaveAttribute('aria-current', 'true');
}

/** Drags across the carousel with real touch events (Chromium DevTools protocol). */
async function swipe(page: Page, target: Locator, distance: number) {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  const client = await page.context().newCDPSession(page);
  const x = (box as { x: number; width: number }).x + (box as { x: number; width: number }).width * 0.75;
  const y = (box as { y: number; height: number }).y + (box as { y: number; height: number }).height / 2;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 12; step += 1) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (distance * step) / 12, y }] });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.describe('Creator card portfolio preview (desktop)', () => {
  test('shows the first three photos in saved order, cycles with arrows and dots, and never opens the profile', async ({ page }) => {
    await page.goto('/discover?neighborhood=Venice');
    const card = cardFor(page, 'Theo Lindqvist');
    await expect(card.getByTestId('portfolio-carousel')).toBeVisible();
    await expect(card.getByTestId('portfolio-slide')).toHaveCount(3);
    await expect(card.getByTestId('portfolio-dot')).toHaveCount(3);
    await expect(card.getByTestId('portfolio-slide').nth(0).locator('img')).toHaveAttribute('alt', 'Courtyard, late afternoon');
    await expect(card.getByTestId('portfolio-slide').nth(2).locator('img')).toHaveAttribute('alt', 'Dinner service bokeh');
    await expectActiveDot(card, 0);
    await expect(card.getByTestId('portfolio-prev')).toBeDisabled();

    await card.getByTestId('portfolio-next').click();
    await expectActiveDot(card, 1);
    await card.getByTestId('portfolio-dot').nth(2).click();
    await expectActiveDot(card, 2);
    await expect(card.getByTestId('portfolio-next')).toBeDisabled();
    await card.getByTestId('portfolio-prev').click();
    await expectActiveDot(card, 1);

    // Arrow and dot clicks stay on the discovery page.
    await expect(page).toHaveURL(/\/discover\?neighborhood=Venice$/);

    // The View profile button is still there and still opens the profile.
    await card.getByRole('link', { name: /View profile of Theo Lindqvist/ }).click();
    await expect(page).toHaveURL(/\/creators\/[0-9a-f-]{36}$/);
  });

  test('keyboard: the focused carousel moves with the arrow keys', async ({ page }) => {
    await page.goto('/discover?neighborhood=Venice');
    const card = cardFor(page, 'Theo Lindqvist');
    await card.getByTestId('portfolio-carousel').focus();
    await expect(card.getByTestId('portfolio-carousel')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expectActiveDot(card, 1);
    await page.keyboard.press('ArrowRight');
    await expectActiveDot(card, 2);
    await page.keyboard.press('ArrowLeft');
    await expectActiveDot(card, 1);
    await expect(page).toHaveURL(/\/discover\?neighborhood=Venice$/);
  });

  test('each card has its own carousel', async ({ page }) => {
    await page.goto('/discover');
    const marisol = cardFor(page, 'Marisol Vega');
    const theo = cardFor(page, 'Theo Lindqvist');
    await marisol.getByTestId('portfolio-next').click();
    await expectActiveDot(marisol, 1);
    await expectActiveDot(theo, 0);
    await theo.getByTestId('portfolio-dot').nth(2).click();
    await expectActiveDot(theo, 2);
    await expectActiveDot(marisol, 1);
  });

  test('the first three photos are shown even when a creator has more', async ({ page }) => {
    await page.goto('/discover');
    const marisol = cardFor(page, 'Marisol Vega');
    await expect(marisol.getByTestId('portfolio-slide')).toHaveCount(3);
    await expect(marisol.getByTestId('portfolio-slide').nth(2).locator('img')).toHaveAttribute('alt', 'Light study, abstract');
    await expect(marisol.getByText('Capitol Records at sunset')).toHaveCount(0);
  });

  test('two photos show two dots and navigation', async ({ page }) => {
    await page.goto('/discover');
    const sunny = cardFor(page, 'Sunny Okafor');
    await expect(sunny.getByTestId('portfolio-slide')).toHaveCount(2);
    await expect(sunny.getByTestId('portfolio-dot')).toHaveCount(2);
    await sunny.getByTestId('portfolio-next').click();
    await expectActiveDot(sunny, 1);
  });

  test('a single photo shows no navigation', async ({ page, request }) => {
    const solo = await apiSignupCreator(request, { name: 'Solo Frame Studio', neighborhoods: ['Venice'], citywide: false });
    expect(solo.id).toBeTruthy();
    const upload = await request.post('/api/me/portfolio', {
      data: { kind: 'photo', title: 'Single frame study', contribution: '', projectLabel: '', mediaUrl: '/images/samples/abstract-02.jpg', posterUrl: null },
    });
    expect(upload.status()).toBe(201);

    await page.goto('/discover?neighborhood=Venice');
    const card = cardFor(page, 'Solo Frame Studio');
    await expect(card.getByTestId('portfolio-slide')).toHaveCount(1);
    await expect(card.getByTestId('portfolio-dot')).toHaveCount(0);
    await expect(card.getByTestId('portfolio-prev')).toHaveCount(0);
    await expect(card.getByTestId('portfolio-next')).toHaveCount(0);
  });

  test('no photos shows the placeholder and no carousel', async ({ page }) => {
    await page.goto('/discover');
    const devon = cardFor(page, 'Devon Park');
    await expect(devon.getByTestId('portfolio-empty')).toContainText('No portfolio photos yet');
    await expect(devon.getByTestId('portfolio-carousel')).toHaveCount(0);
    await expect(devon.getByTestId('portfolio-next')).toHaveCount(0);
  });

  test('nothing autoplays', async ({ page }) => {
    await page.goto('/discover');
    const marisol = cardFor(page, 'Marisol Vega');
    await expectActiveDot(marisol, 0);
    await page.waitForTimeout(4000);
    await expectActiveDot(marisol, 0);
  });

  test('reduced motion: the carousel still moves, without animation', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto('/discover?neighborhood=Venice');
    const card = cardFor(page, 'Theo Lindqvist');
    await card.getByTestId('portfolio-next').click();
    await expect(card.getByTestId('portfolio-dot').nth(1)).toHaveAttribute('aria-current', 'true', { timeout: 2000 });
    await context.close();
  });
});

test.describe('Creator card portfolio preview (phone)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('swiping and tapping move through the photos without opening the profile', async ({ page }) => {
    await page.goto('/discover');
    const marisol = cardFor(page, 'Marisol Vega');
    const carousel = marisol.getByTestId('portfolio-carousel');
    await carousel.scrollIntoViewIfNeeded();
    await expectActiveDot(marisol, 0);

    await swipe(page, carousel, -180);
    await expectActiveDot(marisol, 1);
    await expect(page).toHaveURL(/\/discover$/);

    await swipe(page, carousel, 180);
    await expectActiveDot(marisol, 0);

    await marisol.getByTestId('portfolio-next').tap();
    await expectActiveDot(marisol, 1);
    await marisol.getByTestId('portfolio-dot').nth(2).tap();
    await expectActiveDot(marisol, 2);
    await expect(page).toHaveURL(/\/discover$/);
  });

  test('the navigation controls meet the touch target size', async ({ page }) => {
    await page.goto('/discover');
    const marisol = cardFor(page, 'Marisol Vega');
    const next = await marisol.getByTestId('portfolio-next').boundingBox();
    expect(next && next.width >= 44 && next.height >= 44).toBeTruthy();
  });
});
