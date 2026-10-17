// Zoomed captures of small UI details.
const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = require('./_chrome-path.cjs');
const BASE = 'http://localhost:3000';
const APP = BASE + '/app';
const OUT = path.resolve(__dirname, '..', 'screenshots', 'audit');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 });
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(() => localStorage.setItem('millennium-theme', 'dark'));
  await page.goto(APP, { waitUntil: 'networkidle0' });
  await page.type('#loginUsername', 'admin');
  await page.type('#loginPassword', '123123');
  await page.click('#loginSubmitBtn');
  await sleep(3200);
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none !important}' });

  await page.screenshot({ path: path.join(OUT, 'z-brand.png'), clip: { x: 0, y: 0, width: 200, height: 90 } });

  await page.evaluate(() => switchTab('inventory'));
  await sleep(1200);
  const card = await page.evaluate(() => {
    const el = document.querySelector('.inv-card');
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  await page.screenshot({ path: path.join(OUT, 'z-card.png'), clip: card });

  await ctx.close();
  await browser.close();
  console.log('ok');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
