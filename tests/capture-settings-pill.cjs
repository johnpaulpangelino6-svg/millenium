// Capture the Settings dialog (Appearance section) in both themes, plus the
// top bar with its account menu open. Used to eyeball the "Light mode" pill
// against the design reference and to confirm the bar is genuinely light.
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = require('./_chrome-path.cjs');
const BASE = 'http://localhost:3000';
const APP = BASE + '/app';
const OUT = path.resolve(__dirname, '..', 'screenshots', 'settings');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(() => localStorage.setItem('millennium-theme', 'dark'));

  await page.goto(APP, { waitUntil: 'networkidle0' });
  await page.type('#loginUsername', 'admin');
  await page.type('#loginPassword', '123123');
  await page.click('#loginSubmitBtn');
  await sleep(3000);
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none !important}' });

  // --- Settings dialog, dark ---
  await page.click('#settingsBtn');
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, 'settings-dark.png') });

  // Crop the Appearance row so the pill is legible at a glance.
  const pillBox = await page.evaluate(() => {
    const el = document.getElementById('settingsThemeToggle');
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  if (pillBox) {
    await page.screenshot({
      path: path.join(OUT, 'pill-dark.png'),
      clip: { x: Math.max(0, pillBox.x - 40), y: Math.max(0, pillBox.y - 60),
        width: Math.min(760, pillBox.width + 120), height: pillBox.height + 120 },
    });
  }

  // --- Toggle to light, capture again ---
  await page.click('#settingsThemeToggle');
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, 'settings-light.png') });
  const pillBox2 = await page.evaluate(() => {
    const el = document.getElementById('settingsThemeToggle');
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  await page.screenshot({
    path: path.join(OUT, 'pill-light.png'),
    clip: { x: Math.max(0, pillBox2.x - 40), y: Math.max(0, pillBox2.y - 60),
      width: Math.min(760, pillBox2.width + 120), height: pillBox2.height + 120 },
  });

  // --- Top bar with the account menu open (light) ---
  await page.evaluate(() => document.getElementById('profileModalOverlay')?.remove());
  await sleep(300);
  await page.evaluate(() => document.getElementById('topbarUserBtn').click());
  await sleep(400);
  await page.screenshot({
    path: path.join(OUT, 'topbar-account-menu-light.png'),
    clip: { x: 900, y: 0, width: 540, height: 260 },
  });

  // --- Top bar with the notification panel open (light) ---
  await page.evaluate(() => closeUserMenu());
  await sleep(200);
  await page.evaluate(() => document.getElementById('notifBtn').click());
  await sleep(400);
  await page.screenshot({
    path: path.join(OUT, 'topbar-notifications-light.png'),
    clip: { x: 860, y: 0, width: 580, height: 420 },
  });

  const state = await page.evaluate(() => {
    // The dialog DOM is torn down above, so the pill is gone by now — read the
    // live theme from the root element instead.
    const pill = document.getElementById('settingsThemeToggle');
    return {
      theme: document.documentElement.getAttribute('data-theme') || '(none)',
      stored: localStorage.getItem('millennium-theme'),
      barBg: getComputedStyle(document.querySelector('.app-topbar')).backgroundColor,
      searchBg: getComputedStyle(document.querySelector('.topbar-search')).backgroundColor,
      pillOn: pill ? pill.classList.contains('is-on') : 'dialog closed',
    };
  });
  console.log('state:', JSON.stringify(state));

  await ctx.close();
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
