/**
 * Regression suite: the app must not look like it is "refreshing".
 *
 * Four separate artifacts were fixed and are each pinned here:
 *   1. the full-screen sign-in portal being painted then removed on every load
 *   2. the saved theme being applied after first paint (dark -> light flash)
 *   3. the 30s telemetry poll tearing down and rebuilding #mainContent
 *   4. logout doing a real navigation (full page reload)
 *
 * Run:
 *   export NODE_PATH="C:/Users/LENOVO/.workbuddy-ai/binaries/node/workspace/node_modules"
 *   node tests/no-refresh.test.cjs
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const APP_JS = path.resolve(__dirname, '..', 'public', 'js', 'app.js');

let passed = 0, failed = 0;
const check = (name, ok, detail) => {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail !== undefined ? '  -> ' + JSON.stringify(detail) : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sampler installed before the document exists. Records, once per animation
 * frame, whether the sign-in portal is visible and what theme <html> carries.
 * Only frames where the app stylesheet is already in effect count — before
 * that, the overlay would report the browser default `block` and a "flash"
 * assertion would be meaningless.
 */
const SAMPLER = () => {
  window.__frames = [];
  const t0 = performance.now();
  const tick = () => {
    const root = document.documentElement;
    if (root) {
      const ov = document.getElementById('authPortalOverlay');
      window.__frames.push({
        t: Math.round(performance.now() - t0),
        cssReady: document.styleSheets.length > 0,
        theme: root.getAttribute('data-theme') || '(none)',
        boot: root.classList.contains('boot-has-session'),
        overlayDisplay: ov ? getComputedStyle(ov).display : null,
        overlayExists: !!ov,
      });
    }
    if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  document.addEventListener('DOMContentLoaded', () => { if (!window.__frames.length) tick(); });
};

const seedStorage = (theme, token, user) => {
  if (theme) localStorage.setItem('millennium-theme', theme);
  else localStorage.removeItem('millennium-theme');
  if (token) localStorage.setItem('millennium_auth_token', token);
  else localStorage.removeItem('millennium_auth_token');
  if (user) localStorage.setItem('millennium_auth_user', user);
  else localStorage.removeItem('millennium_auth_user');
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // ---------------------------------------------------------------- setup
  const seedCtx = await browser.createBrowserContext();
  const seed = await seedCtx.newPage();
  await seed.setCacheEnabled(false);
  await seed.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await seed.type('#loginUsername', 'admin');
  await seed.type('#loginPassword', '123123');
  await seed.click('#loginSubmitBtn');
  await sleep(3000);
  const session = await seed.evaluate(() => ({
    token: localStorage.getItem('millennium_auth_token'),
    user: localStorage.getItem('millennium_auth_user'),
  }));
  check('setup: obtained a real session token', !!session.token);

  // ============================================ 1. NO PORTAL FLASH (signed in)
  console.log('\n=== 1. SIGNED-IN LOAD — portal must never be painted ===');
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setCacheEnabled(false);
    await page.evaluateOnNewDocument(SAMPLER);
    await page.evaluateOnNewDocument(seedStorage, 'dark', session.token, session.user);
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
    await sleep(2600);

    const frames = await page.evaluate(() => window.__frames);
    const styled = frames.filter((f) => f.cssReady && f.overlayExists);
    check('frames sampled with CSS in effect', styled.length > 0, styled.length);

    const visible = styled.filter((f) => f.overlayDisplay !== 'none');
    check('sign-in portal was NEVER visible on a signed-in load',
      visible.length === 0,
      visible.slice(0, 3).map((f) => ({ t: f.t, d: f.overlayDisplay })));

    check('boot-has-session was set by the inline script',
      frames.some((f) => f.boot === true));

    const state = await page.evaluate(() => ({
      signedIn: !!state.currentUser,
      overlay: getComputedStyle(document.getElementById('authPortalOverlay')).display,
      dash: !!document.querySelector('.dash-v2-container'),
    }));
    check('session restored and dashboard rendered', state.signedIn && state.dash, state);
    check('portal hidden once settled', state.overlay === 'none', state.overlay);
    await ctx.close();
  }

  // ============================================ 2. NO THEME FLASH (light saved)
  console.log('\n=== 2. LIGHT THEME SAVED — must never paint dark first ===');
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setCacheEnabled(false);
    await page.evaluateOnNewDocument(SAMPLER);
    await page.evaluateOnNewDocument(seedStorage, 'light', session.token, session.user);
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
    await sleep(2600);

    const frames = await page.evaluate(() => window.__frames);
    const styled = frames.filter((f) => f.cssReady);
    const darkFrames = styled.filter((f) => f.theme === 'dark');
    check('never painted with the dark theme',
      darkFrames.length === 0,
      darkFrames.slice(0, 3).map((f) => f.t));
    check('html has no data-theme (light) from the first styled frame',
      styled.length > 0 && styled[0].theme === '(none)',
      styled.length ? styled[0].theme : 'no frames');
    await ctx.close();
  }

  // ============================================ 2b. LANDING PAGE THEME FLASH
  console.log('\n=== 2b. /landing WITH LIGHT SAVED — must never paint dark ===');
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setCacheEnabled(false);
    await page.evaluateOnNewDocument(SAMPLER);
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('millennium-theme', 'light');
    });
    await page.goto(BASE + '/landing', { waitUntil: 'domcontentloaded' });
    await page.waitForNetworkIdle({ idleTime: 400 }).catch(() => {});
    await sleep(1500);

    const frames = await page.evaluate(() => window.__frames);
    // The landing page has no auth portal, so only the theme matters here.
    const styled = frames.filter((f) => f.cssReady);
    const darkFrames = styled.filter((f) => f.theme === 'dark');
    check('landing: never painted with the dark theme',
      darkFrames.length === 0,
      darkFrames.slice(0, 3).map((f) => f.t));
    check('landing: first styled frame is already light',
      styled.length > 0 && styled[0].theme === '(none)',
      styled.length ? styled[0].theme : 'no frames');

    const settled = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme') || '(none)',
      heading: !!document.querySelector('#features'),
    }));
    check('landing: settled in light theme with content rendered',
      settled.theme === '(none)' && settled.heading, settled);
    await ctx.close();
  }

  // ============================================ 3. SIGNED-OUT / BAD TOKEN
  console.log('\n=== 3. NO SESSION, AND REJECTED SESSION ===');
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setCacheEnabled(false);
    await page.evaluateOnNewDocument(seedStorage, 'dark', null, null);
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
    await sleep(600);
    const out = await page.evaluate(() => ({
      overlay: getComputedStyle(document.getElementById('authPortalOverlay')).display,
      boot: document.documentElement.classList.contains('boot-has-session'),
      loginVisible: !!document.getElementById('loginUsername')?.offsetParent,
    }));
    check('signed out: portal IS visible', out.overlay !== 'none', out.overlay);
    check('signed out: no boot-has-session class', out.boot === false);
    check('signed out: login form is on screen', out.loginVisible === true);
    await ctx.close();
  }
  {
    // A token that the server will reject: the boot class hides the portal,
    // so the fallback path must put it back.
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setCacheEnabled(false);
    await page.evaluateOnNewDocument(seedStorage, 'dark', 'not-a-valid-token', JSON.stringify({ id: 'x', role: 'admin', username: 'x' }));
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
    await sleep(900);
    const out = await page.evaluate(() => ({
      overlay: getComputedStyle(document.getElementById('authPortalOverlay')).display,
      boot: document.documentElement.classList.contains('boot-has-session'),
    }));
    check('rejected token: portal comes back', out.overlay !== 'none', out.overlay);
    check('rejected token: boot class was handed back', out.boot === false);
    await ctx.close();
  }

  // ============================================ 4. THE 30s POLL
  console.log('\n=== 4. 30s TELEMETRY POLL MUST NOT REBUILD THE VIEW ===');
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setCacheEnabled(false);
    await page.evaluateOnNewDocument(seedStorage, 'dark', session.token, session.user);
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
    await sleep(2000);

    // Tag an existing node with a plain JS property: this does not alter
    // innerHTML, so it cannot itself defeat the short-circuit under test.
    const before = await page.evaluate(() => {
      const mc = document.getElementById('mainContent');
      const el = mc.firstElementChild;
      if (el) el.__probeTag = 'original';
      window.scrollTo(0, 400);
      return { tagged: !!el, clock: !!document.getElementById('heroClockDate') };
    });
    check('probe node tagged and clock element present', before.tagged && before.clock, before);

    console.log('  ... waiting 35s for the poll');
    await sleep(35000);

    const after = await page.evaluate(() => {
      const mc = document.getElementById('mainContent');
      const el = mc.firstElementChild;
      return {
        survived: !!(el && el.__probeTag === 'original'),
        clock: document.getElementById('heroClockDate')?.textContent || '',
      };
    });
    check('#mainContent was NOT rebuilt by the poll', after.survived === true, after);
    check('dashboard clock still populated after the poll', after.clock.length > 0, after.clock);
    await ctx.close();
  }

  // ============================================ 5. LOGOUT
  console.log('\n=== 5. LOGOUT MUST NOT RELOAD THE PAGE ===');
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setCacheEnabled(false);
    await page.evaluateOnNewDocument(seedStorage, 'dark', session.token, session.user);
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
    await sleep(2000);

    const navs = [];
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()); });

    await page.evaluate(() => { window.__logoutProbe = 'still-here'; handleLogout(); });
    await sleep(2200);

    const out = await page.evaluate(() => ({
      probe: window.__logoutProbe || null,
      token: localStorage.getItem('millennium_auth_token'),
      overlay: getComputedStyle(document.getElementById('authPortalOverlay')).display,
      mainEmpty: (document.getElementById('mainContent') || {}).innerHTML === '',
      username: document.getElementById('loginUsername')?.value,
      boot: document.documentElement.classList.contains('boot-has-session'),
    }));
    check('page was not reloaded (JS context survived)', out.probe === 'still-here', out.probe);
    check('no main-frame navigation occurred', navs.length === 0, navs);
    check('token cleared', !out.token, out.token);
    check('sign-in portal is back', out.overlay !== 'none', out.overlay);
    check('main content cleared', out.mainEmpty === true);
    check('login form reset', out.username === '', out.username);
    check('boot class not re-added', out.boot === false);

    // And the user can sign straight back in.
    await page.type('#loginUsername', 'admin');
    await page.type('#loginPassword', '123123');
    await page.click('#loginSubmitBtn');
    await sleep(2500);
    const back = await page.evaluate(() => ({
      signedIn: !!state.currentUser,
      overlay: getComputedStyle(document.getElementById('authPortalOverlay')).display,
    }));
    check('can sign back in without a reload', back.signedIn && back.overlay === 'none', back);
    await ctx.close();
  }

  // ============================================ 6. STATIC GUARDS
  console.log('\n=== 6. STATIC GUARDS IN app.js ===');
  {
    const src = fs.readFileSync(APP_JS, 'utf8');
    check('no location.reload() anywhere', !/location\s*\.\s*reload\s*\(/.test(src));
    check("no window.location.href = '/' navigation", !/window\s*\.\s*location\s*\.\s*href\s*=/.test(src));
    check('fetchAllData accepts an options object', /async function fetchAllData\(\s*options\s*\)/.test(src));
    check('the poll calls fetchAllData({ silent: true })', /fetchAllData\(\{\s*silent:\s*true\s*\}\)/.test(src));
    // Inspect the returned array literal only — the word "notifications"
    // legitimately appears in the explanatory comment above it.
    const sig = src.match(/function dataSignature\(\)[\s\S]*?return \[([\s\S]*?)\]/);
    check('dataSignature excludes notifications',
      !!sig && !/state\.notifications/.test(sig[1]),
      sig ? sig[1].replace(/\s+/g, ' ').trim().slice(0, 120) : 'dataSignature not found');
  }

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
