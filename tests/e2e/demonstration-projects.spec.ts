import { expect, test, type Page, type Request } from '@playwright/test';
import { DEMO_PASSWORD, loginUi } from './helpers';

const SLUGS = [
  'independent-clothing-brand-launch',
  'neighborhood-cafe-content-refresh',
  'independent-music-performance-video',
  'architecture-and-interiors-showcase',
];

/** Collects every request that could change server state. Sample interactions must produce none. */
function trackWrites(page: Page): Request[] {
  const writes: Request[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request);
  });
  return writes;
}

/** Collects the API paths the page asks for. */
function trackApi(page: Page): string[] {
  const paths: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) paths.push(`${request.method()} ${url.pathname}`);
  });
  return paths;
}

test.describe('Join a Creative Project: demonstration briefs', () => {
  test('four demonstration projects are labelled and show the budget, role and schedule labels', async ({ page }) => {
    await page.goto('/opportunities');
    const cards = page.getByTestId('demonstration-card');
    await expect(cards).toHaveCount(4);
    await expect(page.getByTestId('demonstration-count')).toHaveText('4 demonstration projects');

    for (let index = 0; index < 4; index += 1) {
      const card = cards.nth(index);
      await expect(card.getByTestId('demonstration-badge')).toHaveText('Demonstration Project');
      await expect(card).toContainText('Total project budget');
      await expect(card).toContainText('Includes editing');
      await expect(card.getByRole('link', { name: 'View Project' })).toBeVisible();
    }

    const clothing = cards.filter({ hasText: 'Independent Clothing Brand Launch' });
    await expect(clothing).toContainText('Arts District, Los Angeles');
    await expect(clothing).toContainText('Total project budget $1,400');
    await expect(clothing).toContainText('Pay for photographer: $650');
    await expect(clothing).toContainText('Pay for videographer: $750');
    await expect(clothing).toContainText('Saturday, December 5, 2026');
    await expect(clothing).toContainText('10:00 AM – 2:00 PM PST');
    await expect(clothing).toContainText('4 hours');

    const cafe = cards.filter({ hasText: 'Neighborhood Café Content Refresh' });
    await expect(cafe).toContainText('Total project budget $600');
    await expect(cafe).toContainText('Photographer, paid from the total budget');
  });

  test('each View Project link opens its own demonstration page', async ({ page }) => {
    await page.goto('/opportunities');
    const links = page.getByTestId('demonstration-card').getByRole('link', { name: 'View Project' });
    // The board is lazy-loaded, so wait for the four links before reading them (evaluateAll does not wait).
    await expect(links).toHaveCount(4);
    const hrefs = await links.evaluateAll((elements) => elements.map((link) => link.getAttribute('href')));
    expect(hrefs).toEqual(SLUGS.map((slug) => `/opportunities/demo/${slug}`));
  });

  test('the location, role and budget filters narrow the demonstration projects', async ({ page }) => {
    await page.goto('/opportunities');
    const cards = page.getByTestId('demonstration-card');
    await expect(cards).toHaveCount(4);

    await page.getByTestId('board-neighborhood').click();
    await page.getByRole('option', { name: 'Echo Park', exact: true }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Neighborhood Café Content Refresh');

    await page.getByTestId('reset-filters').click();
    await expect(cards).toHaveCount(4);

    await page.getByTestId('board-role').click();
    await page.getByRole('option', { name: 'Photographer and videographer', exact: true }).click();
    await expect(cards).toHaveCount(2);

    await page.getByTestId('board-budget').click();
    await page.getByRole('option', { name: 'Over $1,500', exact: true }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Architecture and Interiors Showcase');

    await page.getByTestId('board-neighborhood').click();
    await page.getByRole('option', { name: 'Echo Park', exact: true }).click();
    await expect(cards).toHaveCount(0);
    await expect(page.getByTestId('no-demonstration-projects')).toBeVisible();

    await page.getByTestId('reset-filters').click();
    await expect(cards).toHaveCount(4);
  });

  test('the budget bands split the projects by total budget', async ({ page }) => {
    await page.goto('/opportunities');
    const cards = page.getByTestId('demonstration-card');
    await page.getByTestId('board-budget').click();
    await page.getByRole('option', { name: 'Under $1,000', exact: true }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Neighborhood Café Content Refresh');

    await page.getByTestId('board-budget').click();
    await page.getByRole('option', { name: '$1,000 to $1,500', exact: true }).click();
    await expect(cards).toHaveCount(2);
  });

  test('View Project opens the full brief in Los Angeles time, with the proposed terms', async ({ page }) => {
    await page.goto('/opportunities');
    await page.getByTestId('demonstration-card').filter({ hasText: 'Independent Clothing Brand Launch' }).getByRole('link', { name: 'View Project' }).click();
    await expect(page).toHaveURL(/\/opportunities\/demo\/independent-clothing-brand-launch$/);
    await expect(page.getByTestId('demonstration-title')).toHaveText('Independent Clothing Brand Launch');

    for (const heading of [
      'Overview and creative goals',
      'Demonstration customer',
      'Shoot location and schedule',
      'Roles and compensation',
      'Deliverables',
      'Requested visual style',
      'Equipment',
      'Travel and expenses',
      'Requested content usage',
      'Proposed project terms',
      'What applicants submit',
    ]) {
      await expect(page.getByRole('heading', { level: 2, name: heading, exact: true })).toBeVisible();
    }

    await expect(page.getByText('Fictional customer, for demonstration only')).toBeVisible();
    await expect(page.getByText('Sable Ridge Apparel')).toBeVisible();
    await expect(page.getByText('Saturday, December 5, 2026').first()).toBeVisible();
    await expect(page.getByText('10:00 AM – 2:00 PM PST').first()).toBeVisible();
    await expect(page.getByText('Proposed terms, to be agreed before booking.')).toBeVisible();
    await expect(page.getByTestId('demo-total-budget')).toHaveText('$1,400');
    await expect(page.getByTestId('demonstration-badge').first()).toHaveText('Demonstration Project');

    const main = page.getByRole('main');
    await expect(main.getByRole('button', { name: /book|pay|checkout/i })).toHaveCount(0);
  });

  test('every demonstration project has a working page with its own title', async ({ page }) => {
    for (const slug of SLUGS) {
      await page.goto(`/opportunities/demo/${slug}`);
      await expect(page.getByTestId('demonstration-title')).toBeVisible();
      await expect(page.getByTestId('demonstration-badge').first()).toHaveText('Demonstration Project');
    }
  });

  test('the music listing gives the videographer payment terms and responsibilities', async ({ page }) => {
    await page.goto('/opportunities/demo/independent-music-performance-video');
    await expect(page.getByTestId('demonstration-title')).toHaveText('Independent Music Performance Video');
    await expect(page.getByText('Payment terms', { exact: true })).toBeVisible();
    await expect(page.getByText('Payment schedule is to be agreed before booking.')).toBeVisible();
    await expect(page.getByText('On the day: operate cameras and lighting for the full performance and for close-ups, and record scratch audio.')).toBeVisible();
  });

  test('an unknown demonstration address explains that the project is not available', async ({ page }) => {
    await page.goto('/opportunities/demo/not-a-real-project');
    await expect(page.getByTestId('demonstration-not-found')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to the project board' })).toBeVisible();
  });

  test('a sample application is labelled as not sent and makes no request that changes anything', async ({ page }) => {
    const writes = trackWrites(page);
    await page.goto('/opportunities/demo/neighborhood-cafe-content-refresh');
    await page.getByTestId('sample-apply').click();

    const dialog = page.getByTestId('sample-application-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('sample-not-sent')).toHaveText('Sample application — not sent');
    await dialog.getByLabel('Portfolio link').fill('https://example.com/portfolio');
    await dialog.getByLabel('Available for the shoot window and deadline').click();
    await dialog.getByTestId('sample-complete-button').click();

    await expect(page.getByTestId('sample-complete')).toContainText('Sample complete. Nothing was sent.');
    expect(writes.map((request) => `${request.method()} ${new URL(request.url()).pathname}`)).toEqual([]);
  });

  test('signed-out visitors see the demonstration briefs, and the live API is not called', async ({ page }) => {
    const api = trackApi(page);
    await page.goto('/opportunities');
    await expect(page.getByTestId('demonstration-card')).toHaveCount(4);
    await expect(page.getByTestId('live-calls-signed-out')).toBeVisible();
    expect(api.filter((entry) => entry.includes('/api/opportunities'))).toEqual([]);
  });

  test('a signed-in creator sees the live open calls beside the demonstration briefs', async ({ page }) => {
    await loginUi(page, 'marisol@example.com', DEMO_PASSWORD);
    await page.goto('/opportunities');
    await expect(page.getByTestId('demonstration-card')).toHaveCount(4);
    await expect(page.getByTestId('open-calls-count')).toBeVisible();
    await expect(page.getByTestId('live-calls-signed-out')).toHaveCount(0);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('cards stack in one column without sideways scrolling', async ({ page }) => {
      await page.goto('/opportunities');
      const cards = page.getByTestId('demonstration-card');
      await expect(cards).toHaveCount(4);
      const boxes = await Promise.all([0, 1, 2, 3].map((index) => cards.nth(index).boundingBox()));
      for (const box of boxes) {
        if (!box) throw new Error('A demonstration card is missing from the page.');
        expect(box.width).toBeGreaterThan(300);
      }
      for (let index = 1; index < boxes.length; index += 1) {
        expect(boxes[index]!.y).toBeGreaterThanOrEqual(boxes[index - 1]!.y + boxes[index - 1]!.height);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test('a demonstration page fits the phone width', async ({ page }) => {
      await page.goto('/opportunities/demo/architecture-and-interiors-showcase');
      await expect(page.getByTestId('demonstration-title')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
});
