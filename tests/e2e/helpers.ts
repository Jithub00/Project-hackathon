import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const DEMO_PASSWORD = 'Demo-Password-2026';
export const TEST_PASSWORD = 'Test-Password-2026';

let counter = 0;

/** A unique address per test so accounts never collide between runs. */
export function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}.${Date.now().toString(36)}.${counter}@example.com`;
}

/** Exactly `count` words of ordinary text (used to test the 350-word limit). */
export function words(count: number, first = 'Photo'): string {
  return Array.from({ length: count }, (_, i) => (i === 0 ? first : `word${i}`)).join(' ');
}

export async function apiSignupCustomer(request: APIRequestContext, overrides: Record<string, unknown> = {}) {
  const email = (overrides.email as string) ?? uniqueEmail('client');
  const body = {
    name: 'Test Client',
    email,
    password: TEST_PASSWORD,
    confirmPassword: TEST_PASSWORD,
    customerType: 'individual',
    businessName: '',
    neighborhood: 'Silver Lake',
    interests: ['Social content'],
    bio: 'Testing a customer account for the Photo Shoot demonstration.',
    acceptTerms: true,
    ...overrides,
  };
  const res = await request.post('/api/auth/signup/customer', { data: body });
  expect(res.status(), await res.text()).toBe(201);
  const json = await res.json();
  return { email, password: TEST_PASSWORD, id: json.user.id as string };
}

export async function apiSignupCreator(request: APIRequestContext, overrides: Record<string, unknown> = {}) {
  const email = (overrides.email as string) ?? uniqueEmail('creator');
  const body = {
    name: 'Test Creator',
    email,
    password: TEST_PASSWORD,
    confirmPassword: TEST_PASSWORD,
    services: 'photography',
    specialties: ['Editorial', 'Architecture'],
    styles: ['Editorial', 'Clean & bright'],
    neighborhoods: ['Venice', 'Mar Vista'],
    citywide: false,
    packageService: 'photography',
    packageName: 'Half-day shoot',
    packageHours: 4,
    packagePriceCents: 90000,
    bio: 'A creator account for the Photo Shoot demonstration tests.',
    seekingClients: true,
    acceptTerms: true,
    ...overrides,
  };
  const res = await request.post('/api/auth/signup/creator', { data: body });
  expect(res.status(), await res.text()).toBe(201);
  const json = await res.json();
  return { email, password: TEST_PASSWORD, id: json.user.id as string };
}

/** Logs in through the real form so the browser holds the session cookie. */
export async function loginUi(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
}

/** A minimal valid 1x1 PNG for upload tests. */
export const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
