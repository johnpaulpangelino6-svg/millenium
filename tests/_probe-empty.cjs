/**
 * Find interactive elements that render nothing: no text, no icon, no image.
 * These are the leftovers of the emoji strip — the codemod removed the glyph
 * that was the element's entire content, leaving an empty bordered box.
 */
const puppeteer = require('puppeteer-core');
const CHROME = require('./_chrome-path.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TABS = [
  'dashboard', 'devices', 'tickets', 'inventory', 'warranty', 'analytics',
  'data-manager', 'rentals', 'directory', 'cms', 'predictive', 'settings',
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  await page.setCacheEnabled(false);
  await page.goto('http://localhost:3000/app', { waitUntil: 'networkidle0' });
  await page.type('#loginUsername', 'admin');
  await page.type('#loginPassword', '123123');
  await page.click('#loginSubmitBtn');
  await sleep(3200);

  for (const tab of TABS) {
    await page.evaluate((t) => switchTab(t), tab);
    await sleep(900);
    const empties = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('button, .action-btn, a.btn, .qa-icon, .act-icon').forEach((el) => {
        if (!el.offsetParent && el.getClientRects().length === 0) return; // hidden
        const text = (el.textContent || '').trim();
        const hasMedia = el.querySelector('svg, img, use, canvas, i');
        const hasBg = getComputedStyle(el).backgroundImage !== 'none';
        if (!text && !hasMedia && !hasBg) {
          const r = el.getBoundingClientRect();
          if (r.width < 2 && r.height < 2) return;
          out.push({
            tag: el.tagName.toLowerCase(),
            cls: el.className,
            title: el.getAttribute('title') || el.getAttribute('aria-label') || '',
            w: Math.round(r.width),
            h: Math.round(r.height),
            outer: el.outerHTML.replace(/\s+/g, ' ').slice(0, 120),
          });
        }
      });
      return out;
    });
    console.log(tab, empties.length ? JSON.stringify(empties, null, 1) : 'clean');
  }
  await ctx.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
