const puppeteer = require('puppeteer-core');
const CHROME = require('./_chrome-path.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  await page.setCacheEnabled(false);
  await page.goto('http://localhost:3000/app', { waitUntil: 'networkidle0' });
  await page.type('#loginUsername', 'admin');
  await page.type('#loginPassword', '123123');
  await page.click('#loginSubmitBtn');
  await sleep(3000);
  for (const tab of ['devices', 'warranty', 'directory', 'rentals', 'data-manager', 'cms', 'predictive']) {
    await page.evaluate((t) => switchTab(t), tab);
    await sleep(700);
    const bad = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('img').forEach(im => {
        if (!im.complete || im.naturalWidth === 0) out.push({ src: im.getAttribute('src'), cls: im.className });
      });
      const uses = Array.from(document.querySelectorAll('use')).filter(u => {
        const id = u.getAttribute('href') || u.getAttribute('xlink:href');
        return id && !document.querySelector(id);
      }).map(u => u.getAttribute('href'));
      return { imgs: out, missingUses: [...new Set(uses)] };
    });
    console.log(tab, JSON.stringify(bad));
  }
  await ctx.close(); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
