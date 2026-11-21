import { expect, test } from '@playwright/test';

async function openCreator(page: import('@playwright/test').Page, name: string) {
  await page.goto('/discover');
  await page.getByRole('link', { name, exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
}

test.describe('Creator profile tabs', () => {
  test('Biography, Photography and Videography tabs show the right content and selected state', async ({ page }) => {
    await openCreator(page, 'Marisol Vega');
    const bio = page.getByRole('tab', { name: /Biography/ });
    const photo = page.getByTestId('tab-photography');
    const video = page.getByTestId('tab-videography');

    await expect(bio).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('panel-biography')).toContainText('photograph products');

    await photo.click();
    await expect(photo).toHaveAttribute('aria-selected', 'true');
    await expect(bio).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByTestId('photo-grid').getByTestId('portfolio-item')).toHaveCount(4);
    await expect(page.getByTestId('photo-grid').getByTestId('portfolio-item').first()).toContainText('Downtown at night');

    await video.click();
    await expect(video).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('video-empty')).toContainText('No videography uploaded yet');
  });

  test('tabs support the keyboard: arrow keys move between tabs and activate them', async ({ page }) => {
    await openCreator(page, 'Marisol Vega');
    await page.getByRole('tab', { name: /Biography/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('tab-photography')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('photo-grid')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('tab-videography')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: /Biography/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('a videographer with no photography shows a clear empty state', async ({ page }) => {
    await openCreator(page, 'Devon Park');
    await page.getByTestId('tab-photography').click();
    await expect(page.getByTestId('photo-empty')).toContainText('No photography uploaded yet');
    await page.getByTestId('tab-videography').click();
    await expect(page.getByTestId('video-grid').getByTestId('portfolio-item')).toHaveCount(3);
    await expect(page.getByTestId('video-grid').getByTestId('portfolio-item').first()).toContainText('Video preview');
  });

  test('reviews sit beneath the profile information and portfolio', async ({ page }) => {
    await openCreator(page, 'Marisol Vega');
    const tabs = await page.getByTestId('profile-tabs').boundingBox();
    const reviews = await page.locator('#reviews-heading').boundingBox();
    expect(tabs && reviews && reviews.y > tabs.y + tabs.height - 1).toBeTruthy();
  });

  test('tabs respond to touch on a phone-sized screen', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await openCreator(page, 'Marisol Vega');
    await page.getByTestId('tab-photography').tap();
    await expect(page.getByTestId('tab-photography')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('photo-grid')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await context.close();
  });
});
