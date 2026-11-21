import { expect, test } from '@playwright/test';
import { apiSignupCreator, loginUi } from './helpers';

test.describe('Availability', () => {
  test('a creator sets usual days and specific dates, and the public profile reflects them', async ({ page, request }) => {
    const creator = await apiSignupCreator(request, { name: 'Avery Hart' });
    await loginUi(page, creator.email, creator.password);
    await page.goto('/account/profile');
    await page.getByRole('tab', { name: 'Availability' }).click();

    await page.getByTestId('weekday-Mon').click();
    await page.getByTestId('weekday-Wed').click();
    await page.getByTestId('typical-hours').fill('09:00-17:00');

    const days = page.getByTestId('owner-calendar').locator('button[data-day]:not([disabled])');
    await days.nth(2).click();
    await days.nth(5).click();
    await expect(page.getByTestId('available-count')).toHaveText('2 specific dates selected');

    await page.getByTestId('save-availability').click();
    await expect(page.getByText('Saved. Your availability is live on your profile.')).toBeVisible();

    const data = await (await request.get(`/api/creators/${creator.id}`)).json();
    expect(data.profile.availableDates).toHaveLength(2);
    expect(data.profile.weekdays).toEqual([1, 3]);
    expect(data.profile.typicalHours).toBe('09:00-17:00');
    expect(data.profile.nextAvailableDate).not.toBeNull();

    await page.goto(`/creators/${creator.id}`);
    await expect(page.getByTestId('next-available-profile')).toContainText('Next available');
    await expect(page.getByTestId('public-calendar')).toBeVisible();
  });

  test('a creator who is not seeking clients is hidden from discovery until they return', async ({ page, request }) => {
    const creator = await apiSignupCreator(request, { name: 'Quiet Studio Lane', seekingClients: false });
    await page.goto('/discover?services=photography');
    await expect(page.getByTestId('creator-card').filter({ hasText: 'Quiet Studio Lane' })).toHaveCount(0);

    await loginUi(page, creator.email, creator.password);
    await page.goto('/dashboard');
    await page.getByTestId('seeking-switch').click();
    await expect(page.getByTestId('seeking-switch')).toBeChecked();

    await page.goto('/discover?services=photography&neighborhood=Venice');
    await expect(page.getByTestId('creator-card').filter({ hasText: 'Quiet Studio Lane' })).toHaveCount(1);
  });
});
