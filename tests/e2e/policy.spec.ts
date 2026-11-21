import { expect, test } from '@playwright/test';

// The two platform guarantees, word for word as published in shared/policy.ts.
const QUALITY_GUARANTEE =
  'Customers are entitled to a refund if their photographer or videographer fails to provide the agreed work or delivers work that does not meet the quality represented in their profile and portfolio at the time of booking.';
const CANCELLATION_GUARANTEE = 'Customers who cancel their booked session at least 72 hours before its scheduled start time are entitled to a full refund.';

test.describe('Refund and Cancellation Policy and Terms and Conditions', () => {
  test('the policy states both guarantees word for word and keeps the 72-hour rule and the separate grounds', async ({ page }) => {
    await page.goto('/policies/refund-and-cancellation');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Refund and Cancellation Policy');

    const protections = page.getByRole('complementary', { name: 'Our two customer protections' });
    await expect(protections).toContainText(QUALITY_GUARANTEE);
    await expect(protections).toContainText(CANCELLATION_GUARANTEE);

    await expect(page.getByRole('heading', { name: 'The 72-hour cancellation guarantee' })).toBeVisible();
    await expect(page.getByText('Exactly 72 hours qualifies.')).toBeVisible();
    await expect(page.getByText('not business days or calendar labels', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Separate refund grounds' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cancellations less than 72 hours before the session' })).toBeVisible();
    await expect(page.getByText(/all sales final|non-?refundable/i)).toHaveCount(0);
  });

  test('the Terms and Conditions cover creator representations, the agreed brief, disputes and platform guarantees', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Terms and Conditions');
    for (const heading of [
      'Creators represent their work accurately',
      'Creators fulfil the approved agreement',
      'Cancellations and refunds',
      'Disputes and refund reviews',
      'Projects with more than one creator',
      'Platform guarantees come first',
    ]) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
    await expect(page.getByText(/all sales final|non-?refundable/i)).toHaveCount(0);
  });

  test('sign-up links to the Terms and Conditions and the Refund and Cancellation Policy', async ({ page }) => {
    await page.goto('/signup/customer');
    await expect(page.getByRole('link', { name: 'Terms and Conditions' }).first()).toHaveAttribute('href', '/terms');
    await expect(page.getByRole('link', { name: 'Refund and Cancellation Policy' }).first()).toHaveAttribute('href', '/policies/refund-and-cancellation');
  });
});
