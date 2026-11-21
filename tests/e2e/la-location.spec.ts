import { expect, test } from '@playwright/test';
import { apiSignupCustomer, loginUi } from './helpers';

test.describe('Los Angeles-only service area', () => {
  test('the discovery neighbourhood list contains Los Angeles neighbourhoods only', async ({ page }) => {
    await page.goto('/discover');
    await page.getByTestId('filter-neighborhood').click();
    await expect(page.getByRole('option', { name: 'Venice', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Arts District', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Santa Monica', exact: true })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'Culver City', exact: true })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'Long Beach', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('the discovery page states the service boundary', async ({ page }) => {
    await page.goto('/discover');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Find Los Angeles photographers');
    await expect(page.getByText('City of Los Angeles', { exact: false }).first()).toBeVisible();
  });

  test('the API refuses a location outside the City of Los Angeles', async ({ request }) => {
    const outside = await request.get('/api/creators?neighborhood=Santa%20Monica');
    expect(outside.status()).toBe(400);
    const body = await outside.json();
    expect(body.code).toBe('OUTSIDE_SERVICE_AREA');
    expect(body.fieldErrors.neighborhood).toBe('Choose a Los Angeles neighbourhood.');

    const inside = await request.get('/api/creators?neighborhood=Venice');
    expect(inside.status()).toBe(200);
  });

  test('projects cannot be created for a location outside the service area', async ({ page, request }) => {
    const customer = await apiSignupCustomer(request);
    await loginUi(page, customer.email, customer.password);
    const res = await page.request.post('/api/projects', {
      data: {
        title: 'Outside the area',
        contentType: 'Brand campaign',
        services: 'photography',
        budgetCents: 100000,
        neighborhood: 'Santa Monica',
        locationDetail: '',
        styleTags: [],
        preferredDates: [],
        description: '',
        visibility: 'invite',
        invites: [],
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors.neighborhood).toBeTruthy();
  });

  test('creator coverage and the matching wizard only offer Los Angeles neighbourhoods', async ({ page, request }) => {
    const customer = await apiSignupCustomer(request);
    await loginUi(page, customer.email, customer.password);
    await page.goto('/match');
    await page.getByTestId('step-1').click();
    await page.getByTestId('neighborhood-select').click();
    await expect(page.getByRole('option', { name: 'Hollywood Hills', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Santa Monica', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.goto('/signup/creator');
    await expect(page.getByTestId('coverage-Venice')).toBeVisible();
    await expect(page.getByTestId('coverage-Santa Monica')).toHaveCount(0);
    await expect(page.getByTestId('citywide-checkbox')).toBeVisible();
  });
});
