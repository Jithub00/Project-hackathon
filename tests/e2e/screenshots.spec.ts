import { expect, test, type Page } from '@playwright/test';
import { DEMO_PASSWORD, loginUi } from './helpers';

/**
 * Captures full-page screenshots of representative screens at desktop, tablet and phone widths
 * into screenshots/ for layout review. Each page must also render with no runtime errors and no
 * failed resources (for example a missing sample image).
 */

const SIZES = [
  { name: '1440', width: 1440, height: 900, mobile: false },
  { name: '768', width: 768, height: 1024, mobile: false },
  { name: '390', width: 390, height: 844, mobile: true },
];

const PUBLIC_PAGES = [
  { slug: 'home', path: '/' },
  { slug: 'discover', path: '/discover' },
  { slug: 'match', path: '/match' },
  { slug: 'how-it-works', path: '/how-it-works' },
  { slug: 'policies', path: '/policies' },
  { slug: 'login', path: '/login' },
  { slug: 'signup-creator', path: '/signup/creator' },
];

function trackProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().includes('/api/auth/me')) {
      problems.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  return problems;
}

for (const size of SIZES) {
  test.describe(`layout at ${size.name}px`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile });

    for (const pageDef of PUBLIC_PAGES) {
      test(`${pageDef.slug} renders cleanly`, async ({ page }) => {
        const problems = trackProblems(page);
        await page.goto(pageDef.path);
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: `screenshots/${pageDef.slug}-${size.name}.png`, fullPage: true });
        expect(problems, problems.join('\n')).toEqual([]);
      });
    }

    test('creator profile renders cleanly', async ({ page, request }) => {
      const list = await (await request.get('/api/creators?neighborhood=Arts%20District')).json();
      const marisol = list.creators.find((c: { name: string }) => c.name === 'Marisol Vega');
      expect(marisol).toBeTruthy();
      const problems = trackProblems(page);
      await page.goto(`/creators/${marisol.id}`);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `screenshots/creator-profile-${size.name}.png`, fullPage: true });
      expect(problems, problems.join('\n')).toEqual([]);
    });

    test('customer dashboard and project workspace render cleanly', async ({ page }) => {
      const problems = trackProblems(page);
      await loginUi(page, 'realty@example.com', DEMO_PASSWORD);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `screenshots/dashboard-${size.name}.png`, fullPage: true });
      await page.getByTestId('project-row').filter({ hasText: 'Los Feliz walkthrough film and stills' }).getByRole('link').first().click();
      await expect(page.getByTestId('next-step')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `screenshots/workspace-${size.name}.png`, fullPage: true });
      expect(problems, problems.join('\n')).toEqual([]);
    });
  });
}
