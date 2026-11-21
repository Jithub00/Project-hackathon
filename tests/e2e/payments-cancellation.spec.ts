import { expect, test, type Page } from '@playwright/test';
import { DEMO_PASSWORD, loginUi } from './helpers';

const WALKTHROUGH = 'Los Feliz walkthrough film and stills';

async function openWalkthrough(page: Page) {
  await loginUi(page, 'realty@example.com', DEMO_PASSWORD);
  await page.getByTestId('project-row').filter({ hasText: WALKTHROUGH }).getByRole('link').first().click();
  await expect(page.getByTestId('status-badge').first()).toHaveText('Booked');
}

test.describe('Refunds and cancellations in the demonstration environment', () => {
  test('a booked project shows the full refund that cancelling inside the guarantee would issue', async ({ page }) => {
    await openWalkthrough(page);
    await page.getByTestId('tab-payments').click();
    await expect(page.getByTestId('payment-list')).toContainText('Demonstration (no money moves)');
    // The seeded shoot is nine days away, so the 72-hour guarantee applies: the whole $1,004.40 paid, deposit and fee included.
    await expect(page.getByTestId('refund-preview')).toContainText('a full $1,004.40');
    await expect(page.getByTestId('refund-preview')).toContainText('100% of what you paid');
    await expect(page.getByTestId('cancellation-deadline')).toContainText('72-hour deadline');
    await expect(page.getByTestId('cancellation-deadline')).toContainText('(Los Angeles time)');
    await expect(page.getByTestId('booking-record')).toContainText('Refund and Cancellation Policy version');
  });

  test('a refund request states its reason, needs a description, and can be withdrawn', async ({ page }) => {
    await openWalkthrough(page);
    await page.getByTestId('tab-payments').click();
    await page.getByTestId('open-refund-request').click();
    // Before any work is delivered, the quality reason is not offered.
    await expect(page.getByRole('radio', { name: 'Delivered work below the quality' })).toHaveCount(0);
    await page.getByRole('radio', { name: 'Agreed work not delivered' }).click();

    const submit = page.getByTestId('submit-refund-request');
    await expect(submit).toBeDisabled();
    await page.getByTestId('refund-description').fill('Too short');
    await expect(submit).toBeDisabled();
    await page.getByTestId('refund-description').fill('The creator has not yet delivered any of the agreed shoot.');
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByTestId('flash')).toContainText('Your refund request has been submitted');
    await page.getByTestId('tab-payments').click();
    const request = page.getByTestId('refund-request').filter({ hasText: 'Agreed work not delivered' });
    await expect(request.getByTestId('refund-status')).toHaveText('Submitted');
    await expect(page.getByTestId('payment-list')).toContainText('deposit');

    await request.getByTestId('withdraw-request').click();
    await expect(page.getByTestId('flash')).toContainText('The request has been withdrawn');
    await page.getByTestId('tab-payments').click();
    await expect(page.getByTestId('refund-request').filter({ hasText: 'Agreed work not delivered' }).getByTestId('refund-status')).toHaveText('Withdrawn');
  });

  test('cancelling inside the guarantee records the cancellation and a full refund', async ({ page }) => {
    await openWalkthrough(page);
    await page.getByTestId('tab-payments').click();
    await page.getByTestId('open-cancel').click();
    await expect(page.getByRole('dialog')).toContainText('a full $1,004.40');
    await page.getByTestId('cancel-reason').fill('The owners postponed the listing.');
    await page.getByTestId('confirm-cancel').click();

    await expect(page.getByTestId('status-badge').first()).toHaveText('Cancelled');
    await expect(page.getByTestId('flash')).toContainText('confirmed your refund of $1,004.40');
    await page.getByTestId('tab-payments').click();
    const cancellation = page.getByTestId('refund-request').filter({ has: page.getByText('Cancellation', { exact: true }) });
    await expect(cancellation.getByTestId('refund-status')).toHaveText('Refunded');
    await expect(cancellation.getByTestId('refund-approved')).toContainText('$1,004.40');
    await expect(page.getByTestId('open-cancel')).toHaveCount(0);
  });

  test('closed projects cannot be cancelled, disputed or have a refund requested', async ({ page }) => {
    await loginUi(page, 'lena@example.com', DEMO_PASSWORD);
    await page.getByTestId('project-row').filter({ hasText: 'Roastery live-session reel' }).getByRole('link').first().click();
    await expect(page.getByTestId('status-badge').first()).toHaveText('Closed');
    await page.getByTestId('tab-payments').click();
    await expect(page.getByTestId('open-dispute')).toHaveCount(0);
    await expect(page.getByTestId('open-cancel')).toHaveCount(0);
    await expect(page.getByTestId('open-refund-request')).toHaveCount(0);
  });

  test('the policies index links the full policy and the refund process, and keeps the sample credits', async ({ page }) => {
    await page.goto('/policies');
    await expect(page.getByRole('heading', { name: 'Refund and Cancellation Policy' })).toBeVisible();
    await expect(page.getByText('Quality and delivery guarantee.').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Read the full Refund and Cancellation Policy' })).toHaveAttribute('href', '/policies/refund-and-cancellation');
    await expect(page.getByRole('heading', { name: 'Refund requests and disputes' })).toBeVisible();
    await expect(page.getByTestId('credits-list').locator('li').first()).toBeVisible();
  });
});
