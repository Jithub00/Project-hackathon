// Development helper: loads key pages on the Vite dev server and reports console errors and carousel counts.
import { chromium } from '@playwright/test';

const base = 'http://localhost:5173';
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  for (const path of ['/discover', '/']) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const cards = await page.getByTestId('creator-card').count();
    const carousels = await page.getByTestId('portfolio-carousel').count();
    const placeholders = await page.getByTestId('portfolio-empty').count();
    console.log(`${path}: ${cards} creator cards, ${carousels} carousels, ${placeholders} placeholders`);
  }
  console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no console errors');
} finally {
  await browser.close();
}
