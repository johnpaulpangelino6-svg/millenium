const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = require('./_chrome-path.cjs');
const OUT = path.resolve(__dirname, '..', 'screenshots', 'audit');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.setCacheEnabled(false);
  for (const theme of ['dark', 'light']) {
    await page.evaluateOnNewDocument((t) => localStorage.setItem('millennium-landing-theme', t), theme);
    await page.goto('http://localhost:3000/landing.html', { waitUntil: 'networkidle0' });
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT, `landing-${theme}.png`), clip: { x: 0, y: 0, width: 620, height: 110 } });
  }
  await ctx.close(); await browser.close(); console.log('ok');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
