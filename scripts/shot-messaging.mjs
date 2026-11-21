// Development helper: captures the messaging screens for visual review (desktop and phone).
// Requires the dev servers (npm run dev and npm run dev:server). Writes to screenshots/review/.
import { chromium } from '@playwright/test';

const base = 'http://localhost:5173';
const password = 'Demo-Password-2026';
const browser = await chromium.launch();

async function signIn(context, email) {
  const page = await context.newPage();
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
  return page;
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const studio = await signIn(desktop, 'studio@example.com');

  const creators = await (await studio.request.get(`${base}/api/creators`)).json();
  const marisol = creators.creators.find((creator) => creator.name.startsWith('Marisol'));
  if (!marisol) throw new Error('The demonstration creator Marisol Vega was not found.');

  // A short conversation so the inbox and thread have content.
  const lines = [
    'Hi Marisol, we are planning a spring lookbook for our Silver Lake studio. Are you free in March?',
    'Yes, I have two half days open. Do you want editorial or lifestyle frames?',
    'Mostly lifestyle, with a few editorial frames for the homepage. Budget is around $900.',
    'That fits the half-day package. I can send a shot list and a moodboard before the shoot.',
  ];
  let conversationId = null;
  for (const [index, body] of lines.entries()) {
    const sent = await studio.request.post(`${base}/api/messages/with/${marisol.id}/messages`, {
      data: { clientId: `shot-message-${index}-${Date.now()}`, body },
    });
    if (!sent.ok()) throw new Error(`Sending failed: ${sent.status()} ${await sent.text()}`);
    conversationId = (await sent.json()).conversation.id;
  }

  await studio.goto(`${base}/creators/${marisol.id}`, { waitUntil: 'networkidle' });
  await studio.screenshot({ path: 'screenshots/review/messaging-profile-desktop.png' });

  await studio.goto(`${base}/messages/${conversationId}`, { waitUntil: 'networkidle' });
  await studio.getByTestId('message-list').waitFor();
  await studio.screenshot({ path: 'screenshots/review/messaging-inbox-desktop.png' });

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phonePage = await signIn(phone, 'studio@example.com');
  await phonePage.goto(`${base}/messages`, { waitUntil: 'networkidle' });
  await phonePage.screenshot({ path: 'screenshots/review/messaging-inbox-phone.png' });
  await phonePage.goto(`${base}/messages/${conversationId}`, { waitUntil: 'networkidle' });
  await phonePage.getByTestId('message-list').waitFor();
  await phonePage.screenshot({ path: 'screenshots/review/messaging-thread-phone.png' });

  console.log('messaging screenshots written');
} finally {
  await browser.close();
}
