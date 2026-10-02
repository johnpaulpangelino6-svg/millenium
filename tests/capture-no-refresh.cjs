// Capture-only: early frames of a signed-in load, to show the portal no longer
// appears. Screenshots are the evidence; the assertions live in
// tests/no-refresh.test.cjs.
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const OUT = path.resolve(__dirname, '..', 'screenshots', 'no-refresh');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const seedCtx = await browser.createBrowserContext();
  const seed = await seedCtx.newPage();
  await seed.setCacheEnabled(false);
  await seed.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await seed.type('#loginUsername', 'admin');
  await seed.type('#loginPassword', '123123');
  await seed.click('#loginSubmitBtn');
  await sleep(3000);
  const s = await seed.evaluate(() => ({
    token: localStorage.getItem('millennium_auth_token'),
    user: localStorage.getItem('millennium_auth_user'),
  }));

  // Signed-in reload, dark theme: portal must not appear.
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument((t, u) => {
    localStorage.setItem('millennium-theme', 'dark');
    localStorage.setItem('millennium_auth_token', t);
    localStorage.setItem('millennium_auth_user', u);
  }, s.token, s.user);

  const nav = page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  let prev = 0;
  for (const at of [70, 180, 320]) {
    await sleep(at - prev); prev = at;
    await page.screenshot({ path: path.join(OUT, `signedin-t${at}.png`) });
  }
  await nav;
  await page.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'signedin-settled.png') });

  // Signed-in reload, LIGHT theme: must never paint dark.
  const ctx2 = await browser.createBrowserContext();
  const p2 = await ctx2.newPage();
  await p2.setViewport({ width: 1440, height: 900 });
  await p2.setCacheEnabled(false);
  await p2.evaluateOnNewDocument((t, u) => {
    localStorage.setItem('millennium-theme', 'light');
    localStorage.setItem('millennium_auth_token', t);
    localStorage.setItem('millennium_auth_user', u);
  }, s.token, s.user);
  const nav2 = p2.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  prev = 0;
  for (const at of [70, 320]) {
    await sleep(at - prev); prev = at;
    await p2.screenshot({ path: path.join(OUT, `light-t${at}.png`) });
  }
  await nav2;
  await p2.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  await sleep(600);
  await p2.screenshot({ path: path.join(OUT, 'light-settled.png') });

  // Logout result: portal back, still the same document.
  await p2.evaluate(() => handleLogout());
  await sleep(1600);
  await p2.screenshot({ path: path.join(OUT, 'after-logout.png') });

  await browser.close();
  console.log('written to screenshots/no-refresh/');
})().catch((e) => { console.error(e); process.exit(1); });
