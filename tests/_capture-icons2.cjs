/**
 * Visual check for the emoji-cleanup pass:
 *   1. Devices table (was painting a broken-image glyph in Actions)
 *   2. Rentals — Prev/Next chevrons, Activate/Return action icons
 *   3. Dashboard — alert pills, "My Work Queue" section title
 *   4. Settings — "Reset" button icon
 *   5. Toast — per-type status icon
 *   6. QR modal — no broken image before the QR loads
 */
const puppeteer = require('puppeteer-core');
const CHROME = require('./_chrome-path.cjs');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'screenshots', 'audit');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 });
  await page.setCacheEnabled(false);

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'warning' && /unknown icon/.test(m.text())) errors.push(m.text());
  });

  await page.goto('http://localhost:3000/app', { waitUntil: 'networkidle0' });
  await page.type('#loginUsername', 'admin');
  await page.type('#loginPassword', '123123');
  await page.click('#loginSubmitBtn');
  await sleep(3200);

  const shot = async (name) => {
    await page.screenshot({ path: path.join(OUT, name), fullPage: false });
    console.log('captured ' + name);
  };

  // 1 — Devices table
  await page.evaluate(() => switchTab('devices'));
  await sleep(900);
  await shot('icons-devices.png');

  // 2 — Rentals
  await page.evaluate(() => switchTab('rentals'));
  await sleep(900);
  await shot('icons-rentals.png');

  // 3 — Dashboard (alert pills + work-queue title)
  await page.evaluate(() => switchTab('dashboard'));
  await sleep(1200);
  await shot('icons-dashboard.png');

  // 4 — Settings: scroll the "Reset local preferences" row into view
  await page.evaluate(() => switchTab('settings'));
  await sleep(900);
  const resetFound = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      /Reset\s*$/.test(b.textContent.trim()) && b.closest('.settings-page, #tab-settings, .tab-content')
    );
    if (!btn) return false;
    btn.scrollIntoView({ block: 'center' });
    return true;
  });
  await sleep(400);
  await shot('icons-settings.png');
  console.log('reset button located: ' + resetFound);

  // 5 — Toast with each type
  for (const type of ['success', 'error', 'info']) {
    await page.evaluate((t) => showToast(`Sample ${t} message`, t), type);
    await sleep(450);
    await page.screenshot({
      path: path.join(OUT, `toast-${type}.png`),
      clip: { x: 900, y: 780, width: 540, height: 170 },
    });
    console.log('captured toast-' + type + '.png');
    await sleep(200);
  }

  // 6 — QR modal, measured before and after the bitmap resolves
  const qrState = await page.evaluate(async () => {
    const dev = state.devices[0];
    openQRModal(dev.id);
    await new Promise((r) => setTimeout(r, 30));
    const img = document.getElementById('qrCodeImg');
    const cs = getComputedStyle(img);
    const before = {
      attr: img.getAttribute('src'),
      visibility: cs.visibility,
      naturalWidth: img.naturalWidth,
    };
    await new Promise((r) => setTimeout(r, 2500));
    const after = {
      hasSrc: !!img.getAttribute('src'),
      visibility: getComputedStyle(img).visibility,
      naturalWidth: img.naturalWidth,
    };
    return { before, after };
  });
  console.log('qr: ' + JSON.stringify(qrState));
  await shot('icons-qr-modal.png');

  console.log('page errors: ' + (errors.length ? JSON.stringify(errors) : 'none'));
  await ctx.close();
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
