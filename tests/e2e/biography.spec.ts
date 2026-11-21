import { expect, test } from '@playwright/test';
import { apiSignupCreator, apiSignupCustomer, loginUi, TEST_PASSWORD, words } from './helpers';

const LIMIT_MESSAGE_351 = 'Your biography is 351 words. Remove 1 word to save. Your text has not been changed.';

test.describe('Biographies for customers and creators', () => {
  test('a customer writes, sees a live counter, accepts 350 words and saves', async ({ page, request }) => {
    const customer = await apiSignupCustomer(request, { bio: 'Short starting line.' });
    await loginUi(page, customer.email, customer.password);
    await page.goto('/account/settings');

    const input = page.getByTestId('bio-input');
    await input.fill(words(128, 'Studio'));
    await expect(page.getByTestId('word-count')).toHaveText('128 / 350 words');

    await input.fill(words(350, 'Studio'));
    await expect(page.getByTestId('word-count')).toHaveText('350 / 350 words');
    await expect(page.getByTestId('save-bio')).toBeEnabled();
    await expect(page.getByTestId('bio-too-long')).toHaveCount(0);

    await page.getByTestId('save-bio').click();
    await expect(page.getByTestId('bio-saved')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('bio-input')).toHaveValue(words(350, 'Studio'));
    await expect(page.getByTestId('word-count')).toHaveText('350 / 350 words');
  });

  test('a biography over 350 words shows a clear message, blocks saving and keeps the text', async ({ page, request }) => {
    const customer = await apiSignupCustomer(request);
    await loginUi(page, customer.email, customer.password);
    await page.goto('/account/settings');

    const over = words(351, 'Over');
    await page.getByTestId('bio-input').fill(over);
    await expect(page.getByTestId('word-count')).toHaveText('351 / 350 words');
    await expect(page.getByTestId('bio-too-long')).toHaveText(LIMIT_MESSAGE_351);
    await expect(page.getByTestId('save-bio')).toBeDisabled();
    await expect(page.getByTestId('bio-input')).toHaveValue(over);

    // Trim one word and the save becomes available again.
    await page.getByTestId('bio-input').fill(words(350, 'Over'));
    await expect(page.getByTestId('save-bio')).toBeEnabled();
  });

  test('the API rejects a 351-word biography and accepts 350 words', async ({ request }) => {
    const customer = await apiSignupCustomer(request);
    const login = await request.post('/api/auth/login', { data: { email: customer.email, password: customer.password } });
    expect(login.status()).toBe(200);

    const rejected = await request.put('/api/me/profile', { data: { name: 'Test Client', bio: words(351) } });
    expect(rejected.status()).toBe(422);
    const rejectedBody = await rejected.json();
    expect(rejectedBody.code).toBe('BIO_TOO_LONG');
    expect(rejectedBody.fieldErrors.bio).toContain('351 words');

    const accepted = await request.put('/api/me/profile', { data: { name: 'Test Client', bio: words(350) } });
    expect(accepted.status()).toBe(200);
    const body = await accepted.json();
    expect(body.user.bioWords).toBe(350);
  });

  test('a creator edits the biography in profile setup and it appears on the public profile', async ({ page, request }) => {
    const creator = await apiSignupCreator(request, { bio: 'Old biography.' });
    await loginUi(page, creator.email, creator.password);
    await page.goto('/account/profile');
    await expect(page.getByRole('heading', { name: 'Biography', exact: true })).toBeVisible();

    const text = `Creative approach: ${words(120, 'Editorial')}`;
    await page.getByTestId('bio-input').fill(text);
    await expect(page.getByTestId('word-count')).toHaveText('122 / 350 words');
    await page.getByTestId('save-bio').click();
    await expect(page.getByTestId('bio-saved')).toBeVisible();

    await page.goto(`/creators/${creator.id}`);
    await expect(page.getByTestId('panel-biography')).toContainText('Creative approach: Editorial');
    await expect(page.getByRole('tab', { name: 'Biography' })).toHaveAttribute('aria-selected', 'true');
  });

  test('a creator cannot save a biography over the limit even through the API', async ({ request }) => {
    const creator = await apiSignupCreator(request);
    const login = await request.post('/api/auth/login', { data: { email: creator.email, password: creator.password } });
    expect(login.status()).toBe(200);
    const rejected = await request.put('/api/me/profile', { data: { name: 'Test Creator', bio: words(400) } });
    expect(rejected.status()).toBe(422);
    const sign = await request.post('/api/auth/signup/creator', { data: { name: 'X', email: 'x@example.com' } });
    expect(sign.status()).toBe(400);
    expect(TEST_PASSWORD.length).toBeGreaterThan(0);
  });
});
