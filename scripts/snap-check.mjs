// Development helper: viewport-sized screenshots of key screens for visual review.
// Writes to screenshots/review/. Requires the dev server on port 4000 with seeded data.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const base = 'http://localhost:4000';
const outDir = 'screenshots/review';
fs.mkdirSync(outDir, { recursive: true });

const api = async (path) => (await fetch(base + path)).json();
const creators = await api('/api/creators?neighborhood=Arts%20District');
const marisol = creators.creators.find((c) => c.name === 'Marisol Vega');

const browser = await chromium.launch();
const shot = async (page, name) => page.screenshot({ path: `${outDir}/${name}.png` });

try {
  // Desktop
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const d = await desktop.newPage();
  await d.goto(base + '/', { waitUntil: 'networkidle' });
  await shot(d, 'desktop-home-top');
  const camera = d.getByTestId('camera-sequence');
  await camera.scrollIntoViewIfNeeded();
  await d.evaluate(() => window.scrollBy(0, 700));
  await d.waitForTimeout(1200);
  await shot(d, 'desktop-camera-mid');
  await d.evaluate(() => window.scrollBy(0, 1100));
  await d.waitForTimeout(1500);
  await shot(d, 'desktop-camera-reveal');
  await d.evaluate(() => window.scrollBy(0, -1100));
  await d.waitForTimeout(600);
  await d.goto(base + '/discover?neighborhood=Venice', { waitUntil: 'networkidle' });
  await shot(d, 'desktop-discover-fit');
  await d.goto(base + `/creators/${marisol.id}`, { waitUntil: 'networkidle' });
  await shot(d, 'desktop-creator-profile');
  await desktop.close();

  // Phone
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await phone.newPage();
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await shot(p, 'phone-home-top');
  await p.goto(base + `/creators/${marisol.id}`, { waitUntil: 'networkidle' });
  await shot(p, 'phone-creator-profile');
  await p.goto(base + '/discover', { waitUntil: 'networkidle' });
  await shot(p, 'phone-discover');
  await phone.close();
  console.log('written to', outDir);
} finally {
  await browser.close();
}
