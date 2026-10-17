const puppeteer = require('puppeteer-core');
const CHROME = require('./_chrome-path.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(() => localStorage.setItem('millennium-theme', 'light'));
  await page.goto('http://localhost:3000/app', { waitUntil: 'networkidle0' });
  await page.type('#loginUsername', 'admin');
  await page.type('#loginPassword', '123123');
  await page.click('#loginSubmitBtn');
  await sleep(3000);
  await page.evaluate(() => switchTab('inventory'));
  await sleep(1200);
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
  const probe = await page.evaluate(() => {
    openRestockModal();
    const el = document.getElementById('restockModalOverlay');
    const cs = getComputedStyle(el);
    return { opacity: cs.opacity, transition: cs.transitionDuration, cls: el.className };
  });
  console.log('immediately:', JSON.stringify(probe));
  await sleep(400);
  console.log('after 400ms:', await page.evaluate(() => getComputedStyle(document.getElementById('restockModalOverlay')).opacity));
  await ctx.close(); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
