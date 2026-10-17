const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = require('./_chrome-path.cjs');
const OUT = path.resolve(__dirname, '..', 'screenshots', 'audit');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TABS = ['dashboard','devices','tickets','inventory','warranty','analytics','data-manager','rentals','directory','cms','predictive'];
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  await page.setCacheEnabled(false);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.evaluateOnNewDocument(() => localStorage.setItem('millennium-theme', 'dark'));
  await page.goto('http://localhost:3000/app', { waitUntil: 'networkidle0' });
  await page.type('#loginUsername', 'admin');
  await page.type('#loginPassword', '123123');
  await page.click('#loginSubmitBtn');
  await sleep(3200);
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none !important}' });
  for (const tab of TABS) {
    const ok = await page.evaluate((t) => { try { switchTab(t); return true; } catch (e) { return String(e); } }, tab);
    await sleep(900);
    await page.screenshot({ path: path.join(OUT, `tab-${tab}.png`) });
    console.log(tab, ok);
  }
  console.log('page errors:', errors.length ? errors : 'none');
  await ctx.close(); await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
