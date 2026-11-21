// Development helper: captures whole creator cards (desktop and phone) for visual review.
// Requires the API on port 4000 serving the current dist/ build. Writes to screenshots/review/.
import { chromium } from '@playwright/test';

const base = 'http://localhost:4000';
const browser = await chromium.launch();
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const d = await desktop.newPage();
  await d.goto(`${base}/discover?neighborhood=Venice`, { waitUntil: 'networkidle' });
  await d.getByTestId('creator-card').filter({ hasText: 'Theo Lindqvist' }).first().screenshot({ path: 'screenshots/review/card-desktop-theo.png' });
  await d.getByTestId('creator-card').filter({ hasText: 'Theo Lindqvist' }).first().getByTestId('portfolio-next').click();
  await d.waitForTimeout(600);
  await d.getByTestId('creator-card').filter({ hasText: 'Theo Lindqvist' }).first().screenshot({ path: 'screenshots/review/card-desktop-theo-next.png' });
  await desktop.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await phone.newPage();
  await p.goto(`${base}/discover`, { waitUntil: 'networkidle' });
  const card = p.getByTestId('creator-card').filter({ hasText: 'Marisol Vega' }).first();
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: 'screenshots/review/card-phone-marisol.png' });
  await phone.close();
  console.log('card screenshots written');
} finally {
  await browser.close();
}
