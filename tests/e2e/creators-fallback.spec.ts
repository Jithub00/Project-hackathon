import { expect, test } from '@playwright/test';

// The example list shows the creators who are taking new clients (see public/demo-data/creators.json).
const EXAMPLE_CREATORS_SHOWN = 7;

test.describe('creators when the live server does not answer', () => {
  test('the creators list shows the example creators with a notice', async ({ page }) => {
    await page.route('**/api/creators**', (route) => route.fulfill({ status: 404, contentType: 'text/html', body: '<h1>Not Found</h1>' }));
    await page.goto('/discover');
    await expect(page.getByTestId('sample-creators-notice')).toContainText('example creators bundled with the site');
    await expect(page.getByTestId('creator-card')).toHaveCount(EXAMPLE_CREATORS_SHOWN);
    await expect(page.getByTestId('results-count')).toContainText('Los Angeles creator');
  });

  test('a creator profile falls back to the example profile', async ({ page }) => {
    await page.route('**/api/creators**', (route) => route.fulfill({ status: 404, contentType: 'text/html', body: '<h1>Not Found</h1>' }));
    await page.goto('/discover');
    const firstCard = page.getByTestId('creator-card').first();
    await expect(firstCard).toBeVisible();
    await firstCard.getByRole('link').first().click();
    await expect(page).toHaveURL(/\/creators\/[0-9a-f-]+$/);
    await expect(page.getByTestId('sample-profile-notice')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('a JSON error from the live server is shown, not replaced by the examples', async ({ page }) => {
    await page.route('**/api/creators**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'The database is busy.', code: 'BUSY' }) }),
    );
    await page.goto('/discover');
    await expect(page.getByTestId('results-count')).toHaveText('Creators unavailable');
    await expect(page.getByRole('alert')).toContainText('The database is busy.');
    await expect(page.getByTestId('sample-creators-notice')).toHaveCount(0);
  });
});
