import { expect, test } from '@playwright/test';

test.describe('Homepage and navigation', () => {
  test('mission, LA positioning and the calls to action', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Los Angeles');
    await expect(page.getByText('Los Angeles · Photographers, videographers and clients')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Find LA Photographers & Videographers' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Join a Creative Project' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Post a Creative Project' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Find Clients in Los Angeles' }).first()).toBeVisible();
    await expect(page.getByRole('img', { name: 'Photo Shoot' }).first()).toBeVisible();
  });

  test('each primary call to action leads to a working page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Find LA Photographers & Videographers' }).first().click();
    await expect(page).toHaveURL(/\/discover$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Find Los Angeles photographers');

    await page.goto('/');
    await page.getByRole('link', { name: 'Find Clients in Los Angeles' }).first().click();
    await expect(page).toHaveURL(/\/signup\/creator$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Find clients in Los Angeles');
  });

  test('homepage shows creator previews, featured work and the five-step process', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-creators').getByTestId('creator-card').first()).toBeVisible();
    await expect(page.getByTestId('featured-gallery').locator('img').first()).toBeVisible();
    const steps = page.getByTestId('process-steps').locator('li');
    await expect(steps).toHaveCount(5);
    await expect(page.getByTestId('process-steps')).toContainText('Describe the project');
    await expect(page.getByTestId('process-steps')).toContainText('Agree on expectations');
    await expect(page.getByTestId('process-steps')).toContainText('Book securely');
  });

  test('header and footer links reach the right pages', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: 'Find creators' }).click();
    await expect(page).toHaveURL(/\/discover/);
    await nav.getByRole('link', { name: 'How it works' }).click();
    await expect(page).toHaveURL(/\/how-it-works/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('From idea to delivered work');
    await page.getByRole('contentinfo').getByRole('link', { name: 'Refund and cancellation policy' }).click();
    await expect(page).toHaveURL(/\/policies\/refund-and-cancellation$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Refund and Cancellation Policy');
    await page.getByRole('contentinfo').getByRole('link', { name: 'Terms and Conditions' }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Terms and Conditions');
  });

  test('signed-in creators see the project board and the account menu', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign up' }).first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Find LA projects' })).toHaveCount(0);

    const email = `nav.creator.${Date.now()}@example.com`;
    const res = await request.post('/api/auth/signup/creator', {
      data: {
        name: 'Nav Creator', email, password: 'Test-Password-2026', confirmPassword: 'Test-Password-2026', services: 'photography',
        specialties: ['Editorial'], styles: ['Editorial'], neighborhoods: [], citywide: true, packageService: 'photography',
        packageName: 'Half-day', packageHours: 4, packagePriceCents: 80000, bio: '', seekingClients: true, acceptTerms: true,
      },
    });
    expect(res.status()).toBe(201);
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('Test-Password-2026');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Find LA projects' })).toBeVisible();
    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Profile and portfolio' }).click();
    await expect(page).toHaveURL(/\/account\/profile/);
  });
});

test.describe('Mobile menu', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the menu opens from the hamburger and its links work', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('mobile-menu-trigger').tap();
    const menu = page.getByTestId('mobile-menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('link', { name: 'Find creators' }).tap();
    await expect(page).toHaveURL(/\/discover/);
    await expect(page.getByTestId('mobile-menu')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
