// Development helper: viewport-sized screenshots of signed-in screens (dashboard, workspace, matching).
// Requires the dev server on port 4000 with seeded data. Writes to screenshots/review/.
import { chromium } from '@playwright/test';

const base = 'http://localhost:4000';
const browser = await chromium.launch();

const login = async (context, email) => {
  const res = await context.request.post(`${base}/api/auth/login`, {
    data: { email, password: 'Demo-Password-2026' },
  });
  if (res.status() !== 200) throw new Error(`login failed for ${email}: ${res.status()}`);
};

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(desktop, 'realty@example.com');
  const d = await desktop.newPage();
  await d.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  await d.screenshot({ path: 'screenshots/review/desktop-dashboard.png' });

  const projects = await (await desktop.request.get(`${base}/api/projects`)).json();
  const booked = projects.projects.find((p) => p.title.startsWith('Los Feliz walkthrough'));
  await d.goto(`${base}/projects/${booked.id}`, { waitUntil: 'networkidle' });
  await d.screenshot({ path: 'screenshots/review/desktop-workspace.png' });
  await d.getByTestId('tab-agreement').click();
  await d.waitForTimeout(400);
  await d.screenshot({ path: 'screenshots/review/desktop-workspace-agreement.png' });
  await desktop.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await login(phone, 'realty@example.com');
  const p = await phone.newPage();
  await p.goto(`${base}/projects/${booked.id}`, { waitUntil: 'networkidle' });
  await p.screenshot({ path: 'screenshots/review/phone-workspace.png' });
  await phone.close();

  const creator = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(creator, 'marisol@example.com');
  const c = await creator.newPage();
  await c.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  await c.screenshot({ path: 'screenshots/review/desktop-creator-dashboard.png' });
  await creator.close();
  console.log('app screenshots written');
} finally {
  await browser.close();
}
