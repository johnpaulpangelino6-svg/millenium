// Diagnostic: what is painted during the first moments of a load, for a
// signed-in user, plus whether the 30s poll disturbs the DOM.
//
// The sampler is installed with evaluateOnNewDocument, which runs BEFORE the
// document exists — so it must not touch document.documentElement until the
// parser has created it. Hence the polling start-up below.
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const OUT = path.resolve(__dirname, '..', 'screenshots', 'mobile-audit');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // ---- seed a real session ----------------------------------------------
  const seedCtx = await browser.createBrowserContext();
  const seed = await seedCtx.newPage();
  await seed.setCacheEnabled(false);
  await seed.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await seed.type('#loginUsername', 'admin');
  await seed.type('#loginPassword', '123123');
  await seed.click('#loginSubmitBtn');
  await sleep(2500);
  const storage = await seed.evaluate(() => ({
    token: localStorage.getItem('millennium_auth_token'),
    user: localStorage.getItem('millennium_auth_user'),
  }));
  console.log('seeded session:', !!storage.token);

  // ---- reload with that session, sampling from the very first frame -----
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setCacheEnabled(false);

  await page.evaluateOnNewDocument(() => {
    window.__samples = [];
    const t0 = performance.now();
    const start = () => {
      const root = document.documentElement;
      const tick = () => {
        const ov = document.getElementById('authPortalOverlay');
        window.__samples.push({
          t: Math.round(performance.now() - t0),
          theme: root.getAttribute('data-theme') || '(none)',
          boot: root.classList.contains('boot-has-session'),
          overlay: ov ? getComputedStyle(ov).display : '(not parsed)',
        });
        if (performance.now() - t0 < 900) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true });
      // Also start as soon as <html> exists, which is earlier.
      const early = setInterval(() => {
        if (document.documentElement && document.readyState !== 'loading') {
          clearInterval(early);
        } else if (document.documentElement && document.getElementById('authPortalOverlay')) {
          clearInterval(early);
          start();
        }
      }, 4);
    } else { start(); }
  });
  await page.evaluateOnNewDocument((tok, usr) => {
    localStorage.setItem('millennium_auth_token', tok);
    localStorage.setItem('millennium_auth_user', usr);
  }, storage.token, storage.user);

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  const shots = [{ at: 70 }, { at: 180 }, { at: 320 }];
  let prev = 0;
  for (const s of shots) {
    await sleep(s.at - prev); prev = s.at;
    await page.screenshot({ path: path.join(OUT, `refresh2-t${s.at}.png`) });
  }
  await page.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
  await sleep(500);

  const samples = await page.evaluate(() => window.__samples);
  // Collapse to state transitions only.
  console.log('--- state transitions during load (ms) ---');
  let last = null;
  samples.forEach((s) => {
    const key = `${s.theme}|${s.boot}|${s.overlay}`;
    if (key !== last) {
      console.log(`${String(s.t).padStart(5)}ms  theme=${s.theme}  bootClass=${s.boot}  overlayDisplay=${s.overlay}`);
      last = key;
    }
  });
  const portalPainted = samples.some((s) => s.overlay !== 'none' && s.overlay !== '(not parsed)');
  console.log('portal ever painted visible:', portalPainted);

  // ---- does the 30s poll disturb the DOM now? ---------------------------
  // Tag an existing node with a plain JS property. Do NOT append a marker
  // element: that changes innerHTML, which defeats the very short-circuit
  // being tested and makes the probe report a rebuild that never happened.
  const stamped = await page.evaluate(() => {
    const mc = document.getElementById('mainContent');
    const el = mc.firstElementChild;
    if (el) el.__probeTag = 'original';
    window.scrollTo(0, 400);
    return { tagged: !!el, scrollY: window.scrollY };
  });
  console.log('probe node tagged:', JSON.stringify(stamped));
  console.log('waiting 35s for the poll...');
  await sleep(35000);
  const after = await page.evaluate(() => {
    const mc = document.getElementById('mainContent');
    const el = mc.firstElementChild;
    return {
      sameNodeSurvived: !!(el && el.__probeTag === 'original'),
      overlayDisplay: getComputedStyle(document.getElementById('authPortalOverlay')).display,
    };
  });
  console.log('after 35s:', JSON.stringify(after));
  console.log(after.sameNodeSurvived
    ? 'RESULT: poll left the DOM alone — no visible refresh'
    : 'RESULT: poll rebuilt the DOM — still a visible refresh');

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
