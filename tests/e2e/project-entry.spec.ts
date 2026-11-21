import { expect, test, type Page } from '@playwright/test';
import { DEMO_PASSWORD, loginUi } from './helpers';

const HERO_LINKS = [
  'Find LA Photographers & Videographers',
  'Join a Creative Project',
  'Post a Creative Project',
  'Find Clients in Los Angeles',
];

/** Bounding boxes of the homepage hero's calls to action, in the order they appear. */
async function heroBoxes(page: Page) {
  const boxes = await Promise.all(HERO_LINKS.map((name) => page.getByRole('link', { name, exact: true }).first().boundingBox()));
  return boxes.map((box) => {
    if (!box) throw new Error('A hero call to action is missing from the page.');
    return box;
  });
}

/**
 * Signs in on the sign-in page the visitor was sent to, so the `next` parameter is kept. (loginUi opens /login afresh,
 * which would drop it.)
 */
async function signInHere(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
}

test.describe('Homepage project actions', () => {
  test('on desktop the four calls to action sit in one row with even spacing', async ({ page }) => {
    await page.goto('/');
    const boxes = await heroBoxes(page);
    expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
    for (const box of boxes) expect(Math.round(box.height)).toBe(48);
    for (let index = 1; index < boxes.length; index += 1) {
      const gap = boxes[index].x - (boxes[index - 1].x + boxes[index - 1].width);
      expect(Math.abs(gap - 16)).toBeLessThanOrEqual(2);
    }
  });

  test('a signed-out visitor who joins a project sees the demonstration briefs, then signs in for live calls', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Join a Creative Project' }).first().click();
    await expect(page).toHaveURL(/\/opportunities$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Find creative projects in Los Angeles');
    await expect(page.getByTestId('demonstration-card')).toHaveCount(4);
    await page.getByTestId('live-calls-signed-out').getByRole('link', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fopportunities$/);
    await signInHere(page, 'marisol@example.com', DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/opportunities$/);
    await expect(page.getByTestId('open-calls-count')).toBeVisible();
  });

  test('a signed-out visitor who posts a project signs in, then reaches the project form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Post a Creative Project' }).first().click();
    await expect(page).toHaveURL(/\/login\?next=%2Fprojects%2Fnew$/);
    await signInHere(page, 'realty@example.com', DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/projects\/new$/);
    await expect(page.getByRole('heading', { name: '1. Describe the project' })).toBeVisible();
    await expect(page.getByTestId('project-title')).toBeVisible();
  });

  test('the create-account link keeps the destination through sign-up', async ({ page }) => {
    await page.goto('/login?next=%2Fprojects%2Fnew');
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page).toHaveURL(/\/signup\?next=%2Fprojects%2Fnew$/);
    await page.getByTestId('choose-customer').click();
    await expect(page).toHaveURL(/\/signup\/customer\?next=%2Fprojects%2Fnew$/);
  });

  test('a creator who opens the project form is pointed to the project board', async ({ page }) => {
    await loginUi(page, 'marisol@example.com', DEMO_PASSWORD);
    await page.goto('/projects/new');
    await expect(page.getByText('Projects are posted from customer accounts')).toBeVisible();
    await page.getByRole('link', { name: 'Join a creative project' }).click();
    await expect(page).toHaveURL(/\/opportunities$/);
  });

  test('a client on the project board sees the demonstration briefs and is pointed to the project form for live calls', async ({ page }) => {
    await loginUi(page, 'realty@example.com', DEMO_PASSWORD);
    await page.goto('/opportunities');
    await expect(page.getByTestId('demonstration-card')).toHaveCount(4);
    await expect(page.getByTestId('live-calls-customer')).toContainText('Live open calls are for creators');
    await page.getByTestId('live-calls-customer').getByRole('link', { name: 'Post a creative project' }).click();
    await expect(page).toHaveURL(/\/projects\/new$/);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('the calls to action stack one above another, each as wide as the content', async ({ page }) => {
      await page.goto('/');
      const boxes = await heroBoxes(page);
      for (let index = 1; index < boxes.length; index += 1) {
        expect(boxes[index].y).toBeGreaterThanOrEqual(boxes[index - 1].y + boxes[index - 1].height);
      }
      for (const box of boxes) expect(box.width).toBeGreaterThan(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
});
