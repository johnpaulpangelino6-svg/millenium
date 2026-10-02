/** Diagnostic: capture the app and landing page at phone width to find real issues. */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const OUT = path.resolve('screenshots/mobile-audit');

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

// report anything wider than the viewport, or any element sticking out
const overflowProbe = () => {
  const vw = document.documentElement.clientWidth;
  const bad = [];
  document.querySelectorAll('body *').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right > vw + 2 || r.left < -2) {
      bad.push({
        sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
        left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
      });
    }
  });
  // de-dupe, keep the widest offenders
  const seen = new Map();
  bad.forEach((b) => { if (!seen.has(b.sel)) seen.set(b.sel, b); });
  return {
    viewport: vw,
    docOverflow: document.documentElement.scrollWidth - vw,
    offenders: Array.from(seen.values()).slice(0, 14),
  };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // ---------------- LANDING ----------------
  console.log('\n########## LANDING ##########');
  const lctx = await browser.createBrowserContext();
  const lp = await lctx.newPage();
  await lp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await lp.goto(BASE + '/landing', { waitUntil: 'networkidle2', timeout: 60000 });
  await lp.evaluate(() => { localStorage.setItem('millennium-theme', 'dark'); });
  await lp.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1200));
  const land = await lp.evaluate(overflowProbe);
  console.log('landing overflow:', land.docOverflow, 'px');
  console.log('offenders:', JSON.stringify(land.offenders, null, 1));
  const shots = [
    ['landing-1-hero', 0],
    ['landing-2-features', 900],
    ['landing-3-howitworks', 2400],
    ['landing-4-roles', 3400],
    ['landing-5-about', 4600],
  ];
  for (const [name, y] of shots) {
    await lp.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
    await new Promise((r) => setTimeout(r, 500));
    await lp.screenshot({ path: path.join(OUT, name + '.png') });
  }
  console.log('saved landing shots');
  await lctx.close();

  // ---------------- APP: LOGIN ----------------
  console.log('\n########## APP LOGIN ##########');
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message)));
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2500));
  const log = await page.evaluate(overflowProbe);
  console.log('login overflow:', log.docOverflow, 'px');
  console.log('offenders:', JSON.stringify(log.offenders, null, 1));
  await page.screenshot({ path: path.join(OUT, 'app-1-login.png') });

  // ---------------- APP: DASHBOARD ----------------
  console.log('\n########## APP DASHBOARD (admin) ##########');
  await page.type('#loginUsername', 'admin');
  await page.type('#loginPassword', '123123');
  await page.click('#loginSubmitBtn');
  await new Promise((r) => setTimeout(r, 6500));
  const dash = await page.evaluate(overflowProbe);
  console.log('dashboard overflow:', dash.docOverflow, 'px');
  console.log('offenders:', JSON.stringify(dash.offenders, null, 1));
  await page.screenshot({ path: path.join(OUT, 'app-2-dashboard.png') });
  await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }));
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, 'app-3-dashboard-lower.png') });

  // sidebar drawer
  const drawer = await page.evaluate(async () => {
    if (typeof toggleMobileMenu === 'function') { toggleMobileMenu(); return 'called toggleMobileMenu'; }
    if (typeof toggleMobileSidebar === 'function') { toggleMobileSidebar(true); return 'called toggleMobileSidebar'; }
    return 'NO TOGGLE FN';
  });
  console.log('drawer:', drawer);
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: path.join(OUT, 'app-4-sidebar-open.png') });
  await page.evaluate(() => { if (typeof toggleMobileSidebar === 'function') toggleMobileSidebar(false); });

  // other views
  for (const [tab, name] of [['devices', 'app-5-devices'], ['tickets', 'app-6-tickets'], ['inventory', 'app-7-inventory'], ['rentals', 'app-8-rentals']]) {
    const r = await page.evaluate(async (t) => {
      navigateTo(t);
      await new Promise((res) => setTimeout(res, 1600));
      return null;
    }, tab);
    const probe = await page.evaluate(overflowProbe);
    console.log(`${tab}: overflow=${probe.docOverflow}px offenders=${probe.offenders.length}`);
    if (probe.offenders.length) console.log('   ', JSON.stringify(probe.offenders.slice(0, 6)));
    await page.screenshot({ path: path.join(OUT, name + '.png') });
  }

  console.log('\npage errors:', errs.length ? errs.slice(0, 5) : 'none');
  await ctx.close();
  await browser.close();
  console.log('\nShots in', OUT);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
