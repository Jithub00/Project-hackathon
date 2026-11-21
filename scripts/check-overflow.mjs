// Development helper: reports elements that extend past the viewport width on key pages.
// Run with the dev server on port 4000 (see PROGRESS.md). Not part of the test suite.
import { chromium } from '@playwright/test';

const base = 'http://localhost:4000';
const widths = [390, 768];

const api = async (path) => (await fetch(base + path)).json();
const creators = await api('/api/creators?neighborhood=Arts%20District');
const marisol = creators.creators.find((c) => c.name === 'Marisol Vega');

const publicPages = ['/', '/discover', '/match', '/how-it-works', '/policies', '/login', '/signup/creator', `/creators/${marisol.id}`];

const offendersFn = () => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= vw + 1) continue;
    const parent = el.parentElement;
    if (parent && parent.getBoundingClientRect().right > vw + 1) continue; // report only the outermost offender
    out.push({
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      testid: el.getAttribute('data-testid') || '',
      right: Math.round(r.right),
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 90),
    });
  }
  return { vw, scrollWidth: document.documentElement.scrollWidth, offenders: out.slice(0, 6) };
};

const browser = await chromium.launch();
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 500, hasTouch: width < 500 });
    const page = await context.newPage();
    for (const path of publicPages) {
      await page.goto(base + path, { waitUntil: 'networkidle' });
      const result = await page.evaluate(offendersFn);
      if (result.scrollWidth > result.vw + 1) {
        console.log(`[${width}] ${path} scrollWidth=${result.scrollWidth} vw=${result.vw}`);
        for (const o of result.offenders) console.log('   ', JSON.stringify(o));
      } else {
        console.log(`[${width}] ${path} ok`);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}
