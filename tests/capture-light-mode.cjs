// Capture the app in LIGHT mode across every view, to see what the hardcoded
// dark "V2 redesign" block breaks.
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = require('./_chrome-path.cjs');
const BASE = 'http://localhost:3000';
const APP = BASE + '/app';
const OUT = path.resolve(__dirname, '..', 'screenshots', 'light-mode');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWS = ['dashboard', 'devices', 'tickets', 'warranty', 'inventory',
  'data-manager', 'cms', 'predictive', 'analytics', 'rentals'];

const THEME = process.argv[2] === 'dark' ? 'dark' : 'light';
const PREFIX = THEME === 'dark' ? '' : 'light-';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument((t) => localStorage.setItem('millennium-theme', t), THEME);

  await page.goto(APP, { waitUntil: 'networkidle0' });
  // The sign-in portal is dark by design in both themes; check it too.
  await page.screenshot({ path: path.join(OUT, `0-login-${THEME}.png`) });

  await page.type('#loginUsername', 'admin');
  await page.type('#loginPassword', '123123');
  await page.click('#loginSubmitBtn');
  await sleep(3000);

  const theme = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme') || '(none)',
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
  }));
  console.log('theme state:', JSON.stringify(theme));

  for (let i = 0; i < VIEWS.length; i++) {
    const v = VIEWS[i];
    await page.evaluate((tab) => switchTab(tab), v);
    await sleep(700);
    await page.screenshot({ path: path.join(OUT, `${i + 1}-${v}-${PREFIX}${THEME}.png`) });
    console.log('  captured', v);
  }

  // Report the computed background of the main structural surfaces.
  const surfaces = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return 'missing';
      const cs = getComputedStyle(el);
      return cs.backgroundColor + ' / ' + cs.color;
    };
    return {
      body: pick('body'),
      appContainer: pick('.app-container'),
      header: pick('.header-notif-btn'),
      sidebarBrand: pick('.sidebar-brand'),
      sidebar: pick('.app-sidebar'),
      mainContent: pick('#mainContent'),
      firstCard: pick('#mainContent .card, #mainContent .dash-v2-container > *, #mainContent [class*="card"]'),
      navItem: pick('.app-sidebar .nav-item'),
      table: pick('.data-table'),
      tableWrapper: pick('.data-table-wrapper'),
    };
  });
  console.log('\n--- computed surfaces in LIGHT mode ---');
  Object.entries(surfaces).forEach(([k, v]) => console.log(`  ${k.padEnd(16)} ${v}`));

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
