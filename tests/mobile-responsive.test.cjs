/**
 * Mobile responsiveness suite for the Millennium SmartBoard app.
 *
 * The metric that matters: with mobile emulation on, if the content is wider
 * than the device the browser WIDENS the layout viewport to fit it, so
 * `window.innerWidth` grows beyond the device width and the page renders
 * zoomed-out with its right-hand side cut off. `scrollWidth - innerWidth` is
 * therefore always ~0 and hides the bug. The reliable assertion is that
 * `innerWidth` still equals the device width.
 *
 * Before the fix the login screen measured innerWidth 579 on a 390px phone
 * and the submit button sat entirely off-screen, so nobody could sign in.
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const OUT = path.resolve('screenshots/mobile-audit');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  ->  ' + detail : ''}`); }
}

const DEVICES = [
  { label: 'iPhone 12/13 (390x844)', w: 390, h: 844, dsf: 3 },
  { label: 'small Android (360x800)', w: 360, h: 800, dsf: 3 },
  { label: 'iPhone Plus (414x896)', w: 414, h: 896, dsf: 3 },
  { label: 'tablet (768x1024)', w: 768, h: 1024, dsf: 2 },
];

/** innerWidth must equal the device width, or the layout viewport expanded. */
const measure = () => ({
  innerWidth: window.innerWidth,
  docScrollWidth: document.documentElement.scrollWidth,
  bodyScrollWidth: document.body.scrollWidth,
});

async function newPhone(browser, d) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: d.w, height: d.h, deviceScaleFactor: d.dsf, isMobile: true, hasTouch: true });
  return { ctx, page };
}

async function login(page, u, p) {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1800));
  await page.type('#loginUsername', u);
  await page.type('#loginPassword', p);
  await page.click('#loginSubmitBtn');
  await new Promise((r) => setTimeout(r, 6500));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // ================= 1. LOGIN SCREEN FITS ON EVERY DEVICE =================
  console.log('\n=== 1. SIGN-IN SCREEN ===');
  for (const d of DEVICES) {
    const { ctx, page } = await newPhone(browser, d);
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 2200));

    const m = await page.evaluate(() => {
      const btn = document.getElementById('loginSubmitBtn');
      const br = btn ? btn.getBoundingClientRect() : null;
      const card = document.querySelector('.auth-portal-card');
      const cr = card ? card.getBoundingClientRect() : null;
      const tabs = document.querySelector('.auth-role-tabs');
      const tr = tabs ? tabs.getBoundingClientRect() : null;
      return {
        innerWidth: window.innerWidth,
        cardRight: cr ? Math.round(cr.right) : null,
        cardLeft: cr ? Math.round(cr.left) : null,
        tabsRight: tr ? Math.round(tr.right) : null,
        btnLeft: br ? Math.round(br.left) : null,
        btnRight: br ? Math.round(br.right) : null,
        btnWidth: br ? Math.round(br.width) : 0,
        btnBottom: br ? Math.round(br.bottom) : null,
      };
    });

    check(`${d.label}: viewport did not expand`, m.innerWidth === d.w,
      `innerWidth=${m.innerWidth}, expected ${d.w}`);
    check(`${d.label}: sign-in card inside the viewport`,
      m.cardRight !== null && m.cardRight <= d.w + 1 && m.cardLeft >= -1,
      `card ${m.cardLeft}..${m.cardRight} vs width ${d.w}`);
    check(`${d.label}: role tabs inside the viewport`,
      m.tabsRight !== null && m.tabsRight <= d.w + 1, `tabs right=${m.tabsRight}`);
    check(`${d.label}: SUBMIT BUTTON is on screen and tappable`,
      m.btnWidth > 0 && m.btnLeft >= -1 && m.btnRight <= d.w + 1,
      `button ${m.btnLeft}..${m.btnRight}`);

    await page.screenshot({ path: path.join(OUT, `login-${d.w}.png`) });
    await ctx.close();
  }

  // ================= 2. SIGN IN ACTUALLY WORKS ON A PHONE =================
  console.log('\n=== 2. CAN A PHONE USER ACTUALLY SIGN IN? ===');
  const d390 = DEVICES[0];
  const { ctx: ctxA, page: pageA } = await newPhone(browser, d390);
  const errs = [];
  pageA.on('pageerror', (e) => errs.push(String(e.message)));

  await login(pageA, 'admin', '123123');
  const signedIn = await pageA.evaluate(() => ({
    overlayHidden: document.getElementById('authPortalOverlay').classList.contains('auth-hidden'),
    hasToken: !!localStorage.getItem('millennium_auth_token'),
    role: state.currentRole,
    tab: state.currentTab,
    dashRendered: !!document.querySelector('.dash-v2-container'),
  }));
  check('signed in successfully on a 390px phone',
    signedIn.overlayHidden && signedIn.hasToken, JSON.stringify(signedIn));
  check('admin lands on the dashboard', signedIn.dashRendered, signedIn.tab);

  // ================= 3. HEADER FITS AND STAYS USABLE =================
  console.log('\n=== 3. APP HEADER ===');
  const head = await pageA.evaluate(() => {
    const h = document.querySelector('.app-header');
    const r = h.getBoundingClientRect();
    const vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') return 'hidden';
      const b = el.getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width) };
    };
    return {
      innerWidth: window.innerWidth,
      headerRight: Math.round(r.right),
      headerH: Math.round(r.height),
      burger: vis('.mobile-menu-btn'),
      search: vis('.header-search-container'),
      notif: vis('.header-notif-btn'),
      avatar: vis('.auth-user-avatar'),
      brandText: vis('.brand-text-container'),
      userInfo: vis('.auth-user-info'),
    };
  });
  check('header does not exceed the viewport', head.headerRight <= d390.w + 1,
    `right=${head.headerRight}`);
  check('hamburger menu is visible on a phone', head.burger && head.burger !== 'hidden',
    JSON.stringify(head.burger));
  check('brand wordmark is collapsed on a phone (logo kept)',
    head.brandText === 'hidden', JSON.stringify(head.brandText));
  check('user chip shows avatar only', head.userInfo === 'hidden',
    JSON.stringify(head.userInfo));
  check('search, notifications and avatar all fit on one row',
    [head.search, head.notif, head.avatar].every((x) => x && x !== 'hidden' && x.right <= d390.w + 1),
    JSON.stringify({ s: head.search, n: head.notif, a: head.avatar }));
  check('header is compact (<= 70px tall)', head.headerH <= 70, `${head.headerH}px`);

  // ================= 4. SIDEBAR DRAWER =================
  console.log('\n=== 4. SIDEBAR DRAWER ===');
  const closed = await pageA.evaluate(() => {
    const sb = document.querySelector('.app-sidebar');
    return { right: Math.round(sb.getBoundingClientRect().right), open: sb.classList.contains('mobile-open') };
  });
  check('sidebar starts off-canvas', closed.right <= 1 && !closed.open, JSON.stringify(closed));

  await pageA.evaluate(() => toggleMobileMenu());
  await new Promise((r) => setTimeout(r, 900));
  const opened = await pageA.evaluate(() => {
    const sb = document.querySelector('.app-sidebar');
    const r = sb.getBoundingClientRect();
    // Two overlay mechanisms exist: the hamburger creates `.mobile-backdrop`,
    // while toggleMobileSidebar() uses the `.sidebar-overlay` in index.html.
    // Either is fine — what matters is that a dimming layer is behind the drawer.
    const shown = ['.mobile-backdrop', '.sidebar-overlay'].some((sel) => {
      const el = document.querySelector(sel);
      return el && getComputedStyle(el).display !== 'none' &&
        el.getBoundingClientRect().width > 0;
    });
    return {
      left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
      open: sb.classList.contains('mobile-open'),
      overlayShown: shown,
      innerWidth: window.innerWidth,
    };
  });
  check('tapping the hamburger opens the drawer', opened.open, JSON.stringify(opened));
  check('drawer is fully on screen', opened.left >= -1 && opened.right <= d390.w + 1,
    `${opened.left}..${opened.right}`);
  check('a dimming overlay is shown behind the drawer', opened.overlayShown,
    JSON.stringify(opened));
  await pageA.screenshot({ path: path.join(OUT, 'phone-sidebar-open.png') });

  // ---- Regression: the nav items used to be covered by the backdrop ----
  // `.app-container` is `position:relative; z-index:1`, so it forms a stacking
  // context. The overlay was a body-level element with z-index 998, which
  // painted above the ENTIRE container subtree including the sidebar, so no
  // nav item could be tapped. The overlay now lives inside `.app-container`.
  const layering = await pageA.evaluate(() => {
    const ov = document.getElementById('sidebarOverlay');
    const container = document.querySelector('.app-container');
    const items = Array.from(document.querySelectorAll('.app-sidebar .nav-item'))
      .filter((el) => getComputedStyle(el).display !== 'none');
    const blocked = [];
    items.forEach((el) => {
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
      if (!hit || !(el === hit || el.contains(hit))) {
        blocked.push(el.getAttribute('data-tab') + ' <- ' +
          (hit ? hit.tagName.toLowerCase() + '.' + String(hit.className).split(' ')[0] : 'null'));
      }
    });
    return {
      overlayParentIsContainer: ov.parentElement === container,
      itemCount: items.length,
      blocked,
      overlayZ: getComputedStyle(ov).zIndex,
      sidebarZ: getComputedStyle(document.querySelector('.app-sidebar')).zIndex,
    };
  });
  check('dimming overlay lives inside .app-container (shares the sidebar stacking context)',
    layering.overlayParentIsContainer, JSON.stringify(layering));
  check('drawer z-index is above the overlay',
    Number(layering.sidebarZ) > Number(layering.overlayZ),
    `sidebar=${layering.sidebarZ}, overlay=${layering.overlayZ}`);
  check(`ALL ${layering.itemCount} nav items are the topmost element (tappable)`,
    layering.blocked.length === 0, 'blocked: ' + layering.blocked.join(' | '));

  // A real mouse/touch click — puppeteer throws if the element is covered.
  let tapOk = true, tapErr = '';
  try {
    await pageA.click('.app-sidebar .nav-item[data-tab="devices"]');
  } catch (e) { tapOk = false; tapErr = String(e.message).slice(0, 90); }
  check('a real tap on a nav item lands (element not covered)', tapOk, tapErr);
  await new Promise((r) => setTimeout(r, 2000));
  const afterTap = await pageA.evaluate(() => ({
    tab: state.currentTab,
    drawerOpen: document.querySelector('.app-sidebar').classList.contains('mobile-open'),
    overlayActive: document.getElementById('sidebarOverlay').classList.contains('active'),
  }));
  check('tapping a nav item navigates to that view', afterTap.tab === 'devices',
    JSON.stringify(afterTap));
  check('tapping a nav item closes the drawer automatically',
    !afterTap.drawerOpen && !afterTap.overlayActive, JSON.stringify(afterTap));

  // ---- The other close path (used by the overlay itself) still works ----
  await pageA.evaluate(() => toggleMobileSidebar(true));
  await new Promise((r) => setTimeout(r, 800));
  const reopened = await pageA.evaluate(() => ({
    open: document.querySelector('.app-sidebar').classList.contains('mobile-open'),
    overlay: document.getElementById('sidebarOverlay').classList.contains('active'),
  }));
  check('drawer can be reopened via toggleMobileSidebar', reopened.open && reopened.overlay,
    JSON.stringify(reopened));

  await pageA.evaluate(() => toggleMobileSidebar(false));
  await new Promise((r) => setTimeout(r, 700));
  const reclosed = await pageA.evaluate(() => {
    const sb = document.querySelector('.app-sidebar');
    return { right: Math.round(sb.getBoundingClientRect().right),
      overlay: document.getElementById('sidebarOverlay').classList.contains('active') };
  });
  check('drawer closes again', reclosed.right <= 1 && !reclosed.overlay, JSON.stringify(reclosed));

  // ================= 5. EVERY VIEW FITS THE PHONE =================
  console.log('\n=== 5. EVERY VIEW ON A 390px PHONE ===');
  const VIEWS = ['dashboard', 'devices', 'tickets', 'customer-portal', 'warranty',
    'inventory', 'data-manager', 'cms', 'predictive', 'analytics', 'rentals'];
  for (const tab of VIEWS) {
    const r = await pageA.evaluate(async (t) => {
      navigateTo(t);
      await new Promise((res) => setTimeout(res, 1800));
      // any element sticking out past the viewport (excluding fixed decor)
      const over = [];
      document.querySelectorAll('#mainContent *').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.position === 'fixed') return;
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) return;
        if (b.right > window.innerWidth + 2) {
          over.push(el.tagName.toLowerCase() + '.' +
            (typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : ''));
        }
      });
      return {
        innerWidth: window.innerWidth,
        mainScroll: document.getElementById('mainContent').scrollWidth,
        rendered: document.getElementById('mainContent').innerHTML.length > 200,
        over: Array.from(new Set(over)).slice(0, 5),
      };
    }, tab);
    check(`${tab}: viewport stays ${d390.w}px (no page-wide overflow)`,
      r.innerWidth === d390.w, `innerWidth=${r.innerWidth}`);
    check(`${tab}: rendered`, r.rendered);
    if (r.over.length) console.log(`        note: ${tab} has elements past the edge: ${r.over.join(', ')}`);
    await pageA.screenshot({ path: path.join(OUT, `phone-${tab}.png`) });
  }

  // ================= 6. TABLES SCROLL INSIDE THEIR CARD =================
  console.log('\n=== 6. DATA TABLES ===');
  await pageA.evaluate(async () => { navigateTo('devices'); await new Promise((r) => setTimeout(r, 1500)); });
  const tbl = await pageA.evaluate(() => {
    const w = document.querySelector('.data-table-wrapper');
    if (!w) return { missing: true };
    const cs = getComputedStyle(w);
    return {
      overflowX: cs.overflowX,
      scrolls: w.scrollWidth > w.clientWidth + 1,
      wrapperRight: Math.round(w.getBoundingClientRect().right),
      innerWidth: window.innerWidth,
    };
  });
  check('table wrapper is horizontally scrollable', tbl.missing ? false : tbl.overflowX === 'auto',
    JSON.stringify(tbl));
  check('table wrapper stays inside the viewport',
    !tbl.missing && tbl.wrapperRight <= d390.w + 1, JSON.stringify(tbl));

  check('no page errors during the phone session', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctxA.close();

  // ================= 7. CUSTOMER ROLE ON A PHONE =================
  console.log('\n=== 7. CUSTOMER ROLE ON A PHONE ===');
  const { ctx: ctxC, page: pageC } = await newPhone(browser, d390);
  await login(pageC, 'orgen', '123123');
  const cust = await pageC.evaluate(async () => {
    navigateTo('rentals');
    await new Promise((r) => setTimeout(r, 1800));
    return {
      innerWidth: window.innerWidth,
      role: state.currentRole,
      rendered: document.getElementById('mainContent').innerHTML.length > 200,
    };
  });
  check('customer: viewport stays 390px', cust.innerWidth === d390.w, `innerWidth=${cust.innerWidth}`);
  check('customer: rentals view renders', cust.rendered && cust.role === 'customer',
    JSON.stringify(cust));
  await pageC.screenshot({ path: path.join(OUT, 'phone-customer-rentals.png') });
  await ctxC.close();

  // ================= 8. LANDING PAGE =================
  console.log('\n=== 8. LANDING PAGE ON A PHONE ===');
  for (const d of DEVICES) {
    const { ctx, page } = await newPhone(browser, d);
    await page.goto(BASE + '/landing', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1200));
    const m = await page.evaluate(measure);
    check(`landing ${d.w}px: viewport did not expand`, m.innerWidth === d.w,
      `innerWidth=${m.innerWidth}`);
    await ctx.close();
  }

  await browser.close();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
