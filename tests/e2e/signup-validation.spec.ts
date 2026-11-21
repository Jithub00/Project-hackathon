import { expect, test } from '@playwright/test';
import { apiSignupCustomer, TEST_PASSWORD, uniqueEmail } from './helpers';

test.describe('Signup paths and form validation', () => {
  test('the sign-up chooser separates customers from creators', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Who are you here as?');
    await page.getByTestId('choose-customer').click();
    await expect(page).toHaveURL(/\/signup\/customer$/);
    await page.goto('/signup');
    await page.getByTestId('choose-creator').click();
    await expect(page).toHaveURL(/\/signup\/creator$/);
  });

  test('customer sign-up shows clear validation and does not submit', async ({ page }) => {
    await page.goto('/signup/customer');
    await page.getByTestId('create-customer').click();
    await expect(page.getByText('Enter at least 2 characters.')).toBeVisible();
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    await expect(page.getByText('Use at least 8 characters.')).toBeVisible();
    await expect(page.getByText('Accept the terms to create your account.')).toBeVisible();
    await expect(page).toHaveURL(/\/signup\/customer$/);
  });

  test('mismatched passwords, a bad email and a business without a name are rejected', async ({ page }) => {
    await page.goto('/signup/customer');
    await page.getByLabel('Full name').fill('Vera Sol');
    await page.getByLabel('Email', { exact: true }).fill('not-an-email');
    await page.getByLabel('Password', { exact: true }).fill('lettersonly');
    await page.getByLabel('Confirm password', { exact: true }).fill('different1');
    await page.getByTestId('customer-type-business').click();
    await page.getByTestId('create-customer').click();
    await expect(page.getByText('Enter a valid email address, like name@example.com.')).toBeVisible();
    await expect(page.getByText('Include at least one number.')).toBeVisible();
    await expect(page.getByText('Passwords do not match.')).toBeVisible();
    await expect(page.getByText('Enter your business name.')).toBeVisible();
  });

  test('a valid customer account is created, signed in and lands on the dashboard', async ({ page }) => {
    const email = uniqueEmail('signup.customer');
    await page.goto('/signup/customer');
    await page.getByLabel('Full name').fill('Vera Sol');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel('Confirm password', { exact: true }).fill(TEST_PASSWORD);
    await page.getByTestId('customer-type-business').click();
    await page.getByLabel('Business name').fill('Sol Studio');
    await page.getByTestId('accept-terms').click();
    await page.getByTestId('create-customer').click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back, Vera');
    await expect(page.getByTestId('no-projects')).toBeVisible();
  });

  test('a duplicate email is reported on the field', async ({ page, request }) => {
    const existing = await apiSignupCustomer(request);
    await page.goto('/signup/customer');
    await page.getByLabel('Full name').fill('Second Account');
    await page.getByLabel('Email', { exact: true }).fill(existing.email);
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel('Confirm password', { exact: true }).fill(TEST_PASSWORD);
    await page.getByTestId('accept-terms').click();
    await page.getByTestId('create-customer').click();
    await expect(page.getByText('An account with this email already exists.')).toBeVisible();
    await expect(page).toHaveURL(/\/signup\/customer$/);
  });

  test('creator sign-up requires specialties and a Los Angeles service area', async ({ page }) => {
    await page.goto('/signup/creator');
    await page.getByTestId('create-creator').click();
    await expect(page.getByText('Add at least one specialty.')).toBeVisible();
    await expect(page.getByText('Choose at least one style.')).toBeVisible();
    await expect(page.getByText('Choose at least one neighbourhood, or All of Los Angeles.')).toBeVisible();
    await expect(page.getByText('Name your first package (at least 3 characters).')).toBeVisible();
  });

  test('a creator account is created with a coverage area, a package and a seeking status', async ({ page }) => {
    const email = uniqueEmail('signup.creator');
    await page.goto('/signup/creator');
    await page.getByLabel('Full name or studio name').fill('Ines Calder');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel('Confirm password', { exact: true }).fill(TEST_PASSWORD);
    await page.getByTestId('service-photography').click();
    await page.getByTestId('specialties-input').fill('Editorial, Architecture');
    await page.getByTestId('specialties-input').blur();
    await page.getByRole('checkbox', { name: 'Editorial', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Venice', exact: true }).click();
    await page.getByLabel('Package name').fill('Half-day shoot');
    await page.getByLabel('Package price (USD)').fill('850');
    await page.getByLabel('Biography (optional, up to 350 words)').fill('I photograph architecture across Venice and Mar Vista.');
    await page.getByTestId('accept-terms').click();
    await page.getByTestId('create-creator').click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('seeking-switch')).toBeVisible();
    await expect(page.getByTestId('checklist')).toContainText('Packages with clear prices');
  });
});
