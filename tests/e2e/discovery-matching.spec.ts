import { expect, test } from '@playwright/test';
import { apiSignupCustomer, loginUi } from './helpers';

test.describe('Discovery filters and matching', () => {
  test('filters update the results and the URL', async ({ page }) => {
    await page.goto('/discover');
    const count = page.getByTestId('results-count');
    await expect(count).toContainText('Los Angeles creator');
    const all = await page.getByTestId('creator-card').count();
    expect(all).toBeGreaterThan(3);

    await page.getByTestId('filter-services').click();
    await page.getByRole('option', { name: 'Videography', exact: true }).click();
    await expect(page).toHaveURL(/services=videography/);
    const videographers = page.getByTestId('creator-card');
    await expect(videographers.first()).toBeVisible();
    await expect(page.getByTestId('creator-card').filter({ hasText: 'Theo Lindqvist' })).toHaveCount(0);
    await expect(page.getByTestId('creator-card').filter({ hasText: 'Devon Park' })).toHaveCount(1);

    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(page).not.toHaveURL(/services=/);
  });

  test('a neighbourhood filter shows why each creator fits', async ({ page }) => {
    await page.goto('/discover?neighborhood=Venice');
    const cards = page.getByTestId('creator-card');
    await expect(cards.first()).toBeVisible();
    await expect(page.getByTestId('fit-reasons').first()).toContainText('Covers Venice');
    await expect(page.getByTestId('fit-reasons').first()).toContainText('Why this creator fits');
    // Theo covers Venice directly; Devon covers the whole city.
    await expect(page.getByTestId('creator-card').filter({ hasText: 'Theo Lindqvist' })).toHaveCount(1);
    await expect(page.getByTestId('creator-card').filter({ hasText: 'Devon Park' })).toHaveCount(1);
    await expect(page.getByTestId('creator-card').filter({ hasText: 'Marisol Vega' })).toHaveCount(0);
  });

  test('a budget that no creator can meet shows a clear explanation and a way to adjust', async ({ page }) => {
    await page.goto('/discover?budget=500&services=photography');
    await expect(page.getByTestId('no-matches')).toBeVisible();
    await expect(page.getByTestId('no-matches')).toContainText('no package within your budget');
    await page.getByTestId('no-matches').getByRole('button', { name: 'Reset filters' }).click();
    await expect(page.getByTestId('creator-card').first()).toBeVisible();
  });

  test('the style filter narrows results to shared styles', async ({ page }) => {
    await page.goto('/discover?styles=Gritty%20%26%20raw');
    const cards = page.getByTestId('creator-card');
    await expect(cards.first()).toBeVisible();
    await expect(page.getByTestId('creator-card').filter({ hasText: 'Nia Brooks' })).toHaveCount(1);
    await expect(page.getByTestId('creator-card').filter({ hasText: 'Marisol Vega' })).toHaveCount(0);
  });

  test('the match wizard requires each step and finds a Venice photographer', async ({ page, request }) => {
    const customer = await apiSignupCustomer(request);
    await loginUi(page, customer.email, customer.password);
    await page.goto('/match');

    await page.getByTestId('next-step').click();
    await expect(page.getByText('Give the project a short title (at least 3 characters).')).toBeVisible();

    await page.getByTestId('project-title').fill('Venice menu shoot');
    await page.getByTestId('content-type').click();
    await page.getByRole('option', { name: 'Food & hospitality', exact: true }).click();
    await page.getByTestId('neighborhood-select').click();
    await page.getByRole('option', { name: 'Venice', exact: true }).click();
    await page.getByTestId('next-step').click();

    await page.getByTestId('service-photography').click();
    await page.getByTestId('next-step').click();
    await page.getByTestId('next-step').click();
    await page.getByTestId('next-step').click();

    const photographers = page.getByTestId('matches-photography');
    await expect(photographers.getByTestId('creator-card').first()).toBeVisible();
    await expect(photographers.getByTestId('fit-reasons').first()).toContainText('Covers Venice');
    await expect(photographers.getByTestId('creator-card').filter({ hasText: 'Theo Lindqvist' })).toHaveCount(1);
  });

  test('adding a creator shows the team price with fees before anything is committed', async ({ page, request }) => {
    const customer = await apiSignupCustomer(request);
    await loginUi(page, customer.email, customer.password);
    await page.goto('/match');
    await page.getByTestId('project-title').fill('Venice menu shoot');
    await page.getByTestId('content-type').click();
    await page.getByRole('option', { name: 'Food & hospitality', exact: true }).click();
    await page.getByTestId('neighborhood-select').click();
    await page.getByRole('option', { name: 'Venice', exact: true }).click();
    await page.getByTestId('next-step').click();
    await page.getByTestId('service-photography').click();
    await page.getByTestId('next-step').click();
    await page.getByTestId('next-step').click();
    await page.getByTestId('next-step').click();

    const theo = page.getByTestId('matches-photography').getByTestId('creator-card').filter({ hasText: 'Theo Lindqvist' });
    await theo.getByTestId('add-to-team').click();
    await expect(page.getByTestId('team-members')).toContainText('Theo Lindqvist');
    // Theo's cheapest photography package is $650. The 8% service fee makes the total $702.00.
    await expect(page.getByTestId('quote-subtotal')).toHaveText('$650.00');
    await expect(page.getByTestId('quote-fee')).toHaveText('$52.00');
    await expect(page.getByTestId('quote-total')).toHaveText('$702.00');
    await expect(page.getByTestId('quote-deposit')).toHaveText('$210.60');
    await expect(page.getByTestId('quote-balance')).toHaveText('$491.40');
  });

  test('a brief with no matching creators explains why and offers adjustment', async ({ page, request }) => {
    const customer = await apiSignupCustomer(request);
    await loginUi(page, customer.email, customer.password);
    await page.goto('/match');
    await page.getByTestId('project-title').fill('Remote cliff shoot');
    await page.getByTestId('content-type').click();
    await page.getByRole('option', { name: 'Other', exact: true }).click();
    await page.getByTestId('neighborhood-select').click();
    await page.getByRole('option', { name: 'Pacific Palisades', exact: true }).click();
    await page.getByTestId('next-step').click();
    await page.getByTestId('service-videography').click();
    await page.getByTestId('next-step').click();
    await page.getByTestId('budget-select').click();
    await page.getByRole('option', { name: 'Up to $500', exact: true }).click();
    await page.getByTestId('next-step').click();
    await page.getByTestId('next-step').click();

    await expect(page.getByTestId('no-videography-matches')).toBeVisible();
    await expect(page.getByTestId('no-videography-matches')).toContainText('do not cover Pacific Palisades');
    await page.getByTestId('no-videography-matches').getByRole('button', { name: 'Adjust my requirements' }).click();
    await expect(page.getByRole('heading', { name: '3. Budget and dates' })).toBeVisible();
  });
});
