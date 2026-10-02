/**
 * Verifies the Millennium SmartBoard Showcase feature has been fully removed.
 *
 * Checks, per role:
 *   - no sidebar nav item targets the showcase tab
 *   - the sidebar promo card that linked to showcase is gone
 *   - ROLE_ACCESS no longer grants the showcase tab
 *   - the showcase render functions no longer exist
 *   - deep-linking to 'showcase' falls back to the role's default tab (no crash)
 *   - the dashboard hero is no longer a showcase link
 *   - the dashboard itself still renders (regression guard)
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const OUT = path.resolve('screenshots');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  →  ' + detail : ''}`); }
}

const ACCOUNTS = {
  admin:      ['admin', '123123'],
  technician: ['hello', '123123'],
  customer:   ['orgen', '123123'],
};

async function login(page, u, p) {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));
  await page.type('#loginUsername', u);
  await page.type('#loginPassword', p);
  await page.click('#loginSubmitBtn');
  await new Promise((r) => setTimeout(r, 6000));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  for (const role of Object.keys(ACCOUNTS)) {
    const [u, p] = ACCOUNTS[role];
    console.log(`\n=== ${role.toUpperCase()} (${u}) ===`);
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message)));

    await login(page, u, p);

    // --- static surface checks ---
    const probe = await page.evaluate(() => ({
      navShowcase:      !!document.querySelector('.nav-item[data-tab="showcase"]'),
      promoCard:        !!document.querySelector('.sidebar-promo-card'),
      anyShowcaseText:  /showcase/i.test(document.getElementById('appShell')?.innerText || ''),
      roleAccessHas:    (ROLE_ACCESS[state.currentRole] || []).includes('showcase'),
      fnView:           typeof window.renderShowcaseView,
      fnRender:         typeof window.renderMillenniumShowcase,
      fnSimulator:      typeof window.initSmartBoardSimulator,
      tab:              state.currentTab,
      mainHasContent:   (document.getElementById('mainContent')?.innerHTML || '').length > 200,
    }));

    check('no nav item for showcase', !probe.navShowcase);
    check('sidebar promo card removed', !probe.promoCard);
    check('no "showcase" wording in the shell', !probe.anyShowcaseText);
    check('ROLE_ACCESS excludes showcase', !probe.roleAccessHas);
    check('renderShowcaseView is gone', probe.fnView === 'undefined', probe.fnView);
    check('renderMillenniumShowcase is gone', probe.fnRender === 'undefined', probe.fnRender);
    check('initSmartBoardSimulator is gone', probe.fnSimulator === 'undefined', probe.fnSimulator);
    check('landed on a real tab with content', probe.mainHasContent, `tab=${probe.tab}`);

    // --- deep link to the removed tab must not crash ---
    const deep = await page.evaluate(async () => {
      const before = state.currentTab;
      navigateTo('showcase');
      await new Promise((r) => setTimeout(r, 800));
      return {
        before,
        after: state.currentTab,
        defaultTab: ROLE_META[state.currentRole].defaultTab,
        contentLen: (document.getElementById('mainContent')?.innerHTML || '').length,
        visible: !!document.querySelector('.dash-v2-container, .page-header-row, .nav-item.active'),
      };
    });
    check('deep link to showcase redirects to the role default tab',
      deep.after === deep.defaultTab && deep.after !== 'showcase',
      `before=${deep.before} after=${deep.after} default=${deep.defaultTab}`);
    check('no blank screen after the redirect', deep.contentLen > 200 && deep.visible);

    // --- admin: dashboard hero must no longer be a showcase link ---
    if (role === 'admin') {
      const hero = await page.evaluate(async () => {
        navigateTo('dashboard');
        await new Promise((r) => setTimeout(r, 900));
        const w = document.querySelector('.hero-display-wrapper');
        const a = document.querySelector('.hero-right-accent');
        return {
          wrapperExists: !!w,
          accentExists: !!a,
          wrapperOnclick: w ? (w.getAttribute('onclick') || '') : 'MISSING',
          accentOnclick: a ? (a.getAttribute('onclick') || '') : 'MISSING',
          wrapperCursor: w ? getComputedStyle(w).cursor : '',
          dashRendered: !!document.querySelector('.dash-v2-container'),
          kpiCount: document.querySelectorAll('.kpi-card-v2').length,
          heroImg: !!document.querySelector('.hero-display-img'),
        };
      });
      check('dashboard hero markup still present', hero.wrapperExists && hero.accentExists);
      check('hero display wrapper is not a showcase link',
        !/showcase/i.test(hero.wrapperOnclick), hero.wrapperOnclick);
      check('hero right accent is not a showcase link',
        !/showcase/i.test(hero.accentOnclick), hero.accentOnclick);
      check('hero display wrapper is no longer pointer-cursor',
        hero.wrapperCursor !== 'pointer', hero.wrapperCursor);
      check('dashboard still renders with KPI cards', hero.dashRendered && hero.kpiCount > 0,
        `kpis=${hero.kpiCount}`);
      check('dashboard hero image still renders', hero.heroImg);

      await page.evaluate(() => applyTheme('dark'));
      await new Promise((r) => setTimeout(r, 400));
      await page.screenshot({ path: path.join(OUT, '8-dashboard-admin-dark.png') });
      console.log('  saved 8-dashboard-admin-dark.png');

      await page.evaluate(() => applyTheme('light'));
      await new Promise((r) => setTimeout(r, 400));
      await page.screenshot({ path: path.join(OUT, '9-dashboard-admin-light.png') });
      console.log('  saved 9-dashboard-admin-light.png');
    }

    if (role === 'customer') {
      await page.evaluate(() => applyTheme('light'));
      await new Promise((r) => setTimeout(r, 400));
      await page.screenshot({ path: path.join(OUT, '10-sidebar-customer-light.png') });
      console.log('  saved 10-sidebar-customer-light.png');
    }

    check('no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // --- the login screen's marketing panel is intentionally kept ---
  console.log('\n=== LOGIN SCREEN ===');
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));
  const auth = await page.evaluate(() => ({
    panel: !!document.querySelector('.auth-showcase-panel'),
    loginForm: !!document.getElementById('loginUsername'),
  }));
  check('login form still renders', auth.loginForm);
  console.log(`  NOTE  login-screen marketing panel present: ${auth.panel}`);
  await page.screenshot({ path: path.join(OUT, '11-login-screen.png') });
  console.log('  saved 11-login-screen.png');
  await ctx.close();

  await browser.close();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
