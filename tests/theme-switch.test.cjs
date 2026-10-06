/**
 * Theme switch: light / dark must apply across the whole system.
 *
 * The app previously had no theme control at all (toggleTheme() existed in
 * app.js but nothing in the markup called it) and light mode rendered dark
 * anyway, because the V2 redesign block hardcodes the dark canvas.
 *
 * The strongest check here is a generic CONTRAST SCAN: walk every visible
 * element, resolve its effective background by climbing ancestors, and flag
 * any text that is too close in luminance to what sits behind it. That catches
 * "dark text on a dark card" and "white text on white" in one pass, across
 * every view, without having to enumerate selectors by hand.
 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const APP = BASE + '/app';
const OUT = path.resolve(__dirname, '..', 'screenshots', 'light-mode');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  const d = detail === undefined ? ''
    : (typeof detail === 'object' ? JSON.stringify(detail) : String(detail));
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${d ? '  ->  ' + d : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWS = ['dashboard', 'devices', 'tickets', 'warranty', 'inventory',
  'data-manager', 'cms', 'predictive', 'analytics', 'rentals'];

/** Runs in the page: returns { theme, surfaces, worst[] }. */
const SCAN = (limit) => {
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  // Source-over compositing. Note the accumulated `acc` and the next layer `c`
  // may BOTH be semi-transparent, so the naive "fg over opaque bg" formula is
  // wrong: it leaves two stacked tints of the same hue looking like pure colour.
  const over = (top, bottom) => {
    const a = top.a + bottom.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
      g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
      b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
      a,
    };
  };

  // Resolve the effective background by climbing ancestors. If any ancestor
  // paints a background-IMAGE (the gradients used for active nav items, buttons
  // and badges) the real backdrop is unknown to this computation, so the
  // element is skipped rather than reported as a false positive.
  const bgOf = (el) => {
    let n = el, acc = null, gradient = false;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') gradient = true;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) acc = acc ? over(acc, c) : c;
      if (acc && acc.a >= 0.999) break;
      n = n.parentElement;
    }
    return { bg: acc || { r: 255, g: 255, b: 255, a: 1 }, gradient };
  };

  // Anything below this is text you genuinely cannot read. The WCAG AA figure
  // is 4.5:1, but small bold badges and intentionally faint decorative glyphs
  // sit below it by design, so flagging those would just be noise.
  const FLOOR = 2.0;

  const worst = [];
  const all = document.querySelectorAll('#mainContent *, .app-header *, .app-sidebar *');
  all.forEach((el) => {
    const text = (el.textContent || '').trim();
    if (!text) return;
    // Only leaf-ish nodes, so one element's text is not counted many times.
    const hasElementChild = Array.from(el.children).some((c) => (c.textContent || '').trim());
    if (hasElementChild) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.5) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    if (cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)' || cs.color === 'rgba(0, 0, 0, 0)') return;
    const fg = parse(cs.color);
    if (!fg) return;
    const { bg, gradient } = bgOf(el);
    if (gradient) return;
    const eff = fg.a < 1 ? over(fg, bg) : fg;
    const r = ratio(eff, bg);
    if (r < FLOOR) {
      worst.push({
        ratio: Math.round(r * 100) / 100,
        sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
        text: text.slice(0, 26),
        fg: cs.color,
        bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      });
    }
  });
  worst.sort((a, b) => a.ratio - b.ratio);
  return {
    theme: document.documentElement.getAttribute('data-theme') || '(none)',
    surfaces: {
      body: getComputedStyle(document.body).backgroundColor,
      bodyColor: getComputedStyle(document.body).color,
      header: getComputedStyle(document.querySelector('.app-header')).backgroundColor,
      sidebar: getComputedStyle(document.querySelector('.app-sidebar')).backgroundColor,
    },
    worst: worst.slice(0, limit),
    total: worst.length,
  };
};

const isLight = (rgb) => {
  const m = /rgba?\(([^)]+)\)/.exec(rgb);
  if (!m) return false;
  const [r, g, b] = m[1].split(',').map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 170;
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // =============================================== 1. the switch exists
  console.log('\n=== 1. THE SWITCH EXISTS AND WORKS ===');
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setCacheEnabled(false);
  await page.goto(APP, { waitUntil: 'networkidle0' });
  // Set the starting theme once, then reload so the boot script picks it up.
  // Deliberately NOT via evaluateOnNewDocument: that re-runs on EVERY
  // navigation and would silently reset the theme before the reload check.
  await page.evaluate(() => localStorage.setItem('millennium-theme', 'dark'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.type('#loginUsername', 'admin');
  await page.type('#loginPassword', '123123');
  await page.click('#loginSubmitBtn');
  await sleep(3000);

  // `body { transition: background-color .25s ease }` (style.css:154) makes the
  // theme change animate. Headless Chrome throttles transitions when no frame is
  // being produced, so a fixed sleep can sample mid-fade — or before the
  // transition has started at all — and read the *old* colour. That is what made
  // the "light mode re-skins the app shell" checks flake. Kill transitions so
  // every colour assertion below is deterministic.
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; }',
  });

  const btn = await page.evaluate(() => {
    const b = document.getElementById('themeToggleBtn');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return {
      visible: r.width > 0 && r.height > 0 && b.offsetParent !== null,
      onScreen: r.left >= 0 && r.right <= window.innerWidth,
      icon: (document.getElementById('themeToggleIcon') || {}).textContent,
      hasHandler: b.getAttribute('onclick') || '',
    };
  });
  check('theme toggle button exists in the header', !!btn, btn);
  check('it is visible and on screen', !!(btn && btn.visible && btn.onScreen), btn);
  check('it has the click handler wired up', !!(btn && /toggleTheme/.test(btn.hasHandler)), btn && btn.hasHandler);

  const before = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme') || '(none)',
    stored: localStorage.getItem('millennium-theme'),
  }));
  check('starts in dark', before.attr === 'dark' && before.stored === 'dark', before);

  await page.click('#themeToggleBtn');
  await sleep(500);
  const after = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme') || '(none)',
    stored: localStorage.getItem('millennium-theme'),
    icon: (document.getElementById('themeToggleIcon') || {}).textContent,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
  }));
  check('clicking it switches to light', after.attr === '(none)' && after.stored === 'light', after);
  check('the icon updates', after.icon === '🌙', after.icon);
  check('the page actually becomes light (body background)', isLight(after.bodyBg), after.bodyBg);
  check('body text becomes dark', !isLight(after.bodyColor), after.bodyColor);

  await page.click('#themeToggleBtn');
  await sleep(500);
  const back = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme') || '(none)',
    stored: localStorage.getItem('millennium-theme'),
  }));
  check('clicking again switches back to dark', back.attr === 'dark' && back.stored === 'dark', back);

  // =============================================== 2. light mode surfaces
  console.log('\n=== 2. LIGHT MODE RE-SKINS THE APP SHELL ===');
  await page.evaluate(() => applyTheme('light'));
  await sleep(400);
  const lightSurf = await page.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    container: getComputedStyle(document.querySelector('.app-container')).backgroundColor,
    header: getComputedStyle(document.querySelector('.app-header')).backgroundColor,
    sidebar: getComputedStyle(document.querySelector('.app-sidebar')).backgroundColor,
  }));
  check('body canvas is light', isLight(lightSurf.body), lightSurf.body);
  check('app container is light', isLight(lightSurf.container), lightSurf.container);
  check('header is light', isLight(lightSurf.header), lightSurf.header);
  check('sidebar is light', isLight(lightSurf.sidebar), lightSurf.sidebar);

  // =============================================== 3. contrast scan, light
  console.log('\n=== 3. CONTRAST SCAN — LIGHT MODE, EVERY VIEW ===');
  let lightBad = 0;
  const lightReport = [];
  for (let i = 0; i < VIEWS.length; i++) {
    const v = VIEWS[i];
    await page.evaluate((tab) => switchTab(tab), v);
    await sleep(1000);
    const res = await page.evaluate(SCAN, 6);
    if (res.total > 0) lightReport.push({ view: v, total: res.total, worst: res.worst });
    lightBad += res.total;
    await page.screenshot({ path: path.join(OUT, `t-${i + 1}-${v}-light.png`) });
  }
  check('no low-contrast text anywhere in light mode',
    lightBad === 0,
    lightBad + ' elements below 4.5:1');
  lightReport.slice(0, 4).forEach((r) => {
    console.log(`    ${r.view}: ${r.total} low-contrast`);
    r.worst.slice(0, 3).forEach((w) => console.log(`      ${w.ratio}:1  ${w.sel}  "${w.text}"  fg=${w.fg} bg=${w.bg}`));
  });

  // =============================================== 4. contrast scan, dark
  console.log('\n=== 4. CONTRAST SCAN — DARK MODE (baseline) ===');
  await page.evaluate(() => applyTheme('dark'));
  await sleep(400);
  let darkBad = 0;
  const darkReport = [];
  for (const v of VIEWS) {
    await page.evaluate((tab) => switchTab(tab), v);
    await sleep(1000);
    const res = await page.evaluate(SCAN, 6);
    if (res.total > 0) darkReport.push({ view: v, total: res.total, worst: res.worst });
    darkBad += res.total;
  }
  check('no low-contrast text anywhere in dark mode', darkBad === 0, darkBad + ' elements below 4.5:1');
  darkReport.slice(0, 3).forEach((r) => {
    console.log(`    ${r.view}: ${r.total} low-contrast`);
    r.worst.slice(0, 3).forEach((w) => console.log(`      ${w.ratio}:1  ${w.sel}  "${w.text}"  fg=${w.fg} bg=${w.bg}`));
  });

  // =============================================== 5. sign-in portal stays dark
  console.log('\n=== 5. SIGN-IN PORTAL STAYS DARK IN BOTH THEMES ===');
  {
    const pctx = await browser.createBrowserContext();
    const pp = await pctx.newPage();
    await pp.setCacheEnabled(false);
    await pp.evaluateOnNewDocument(() => localStorage.setItem('millennium-theme', 'light'));
    await pp.goto(APP, { waitUntil: 'networkidle0' });
    await sleep(400);
    const portal = await pp.evaluate(() => {
      const ov = document.getElementById('authPortalOverlay');
      const cs = getComputedStyle(ov);
      const card = document.querySelector('.auth-portal-card');
      return {
        overlay: cs.backgroundColor,
        card: card ? getComputedStyle(card).backgroundColor : null,
        signInBtnVisible: !!document.getElementById('loginSubmitBtn')?.offsetParent,
      };
    });
    check('portal overlay is still dark in light theme', !isLight(portal.overlay), portal.overlay);
    check('portal card is still dark', portal.card ? !isLight(portal.card) : false, portal.card);
    check('sign-in form is still usable', portal.signInBtnVisible === true);
    await pctx.close();
  }

  // =============================================== 6. persistence
  console.log('\n=== 6. THE CHOICE PERSISTS AND IS SHARED ===');
  await page.evaluate(() => applyTheme('light'));
  await sleep(300);
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1800);
  const persisted = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme') || '(none)',
    bodyBg: getComputedStyle(document.body).backgroundColor,
  }));
  check('light survives a reload', persisted.attr === '(none)' && isLight(persisted.bodyBg), persisted);

  // Same localStorage key as the landing page -> the choice follows the user.
  const lctx = await browser.createBrowserContext();
  const lp = await lctx.newPage();
  await lp.setCacheEnabled(false);
  await lp.goto(BASE + '/landing', { waitUntil: 'networkidle0' });
  await sleep(400);
  const landTheme = await lp.evaluate(() => document.documentElement.getAttribute('data-theme') || '(none)');
  check('landing page defaults to its own theme when nothing is stored', landTheme === 'dark', landTheme);
  await lp.evaluate(() => localStorage.setItem('millennium-theme', 'light'));
  await lp.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  const landLight = await lp.evaluate(() => document.documentElement.getAttribute('data-theme') || '(none)');
  check('landing page honours the same stored choice', landLight === '(none)', landLight);
  await lctx.close();

  // =============================================== 7. mobile
  console.log('\n=== 7. LIGHT MODE ON A PHONE ===');
  {
    const mctx = await browser.createBrowserContext();
    const mp = await mctx.newPage();
    await mp.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await mp.setCacheEnabled(false);
    await mp.evaluateOnNewDocument(() => localStorage.setItem('millennium-theme', 'light'));
    await mp.goto(APP, { waitUntil: 'networkidle0' });
    await mp.type('#loginUsername', 'admin');
    await mp.type('#loginPassword', '123123');
    await mp.click('#loginSubmitBtn');
    await sleep(2600);
    const m = await mp.evaluate(() => {
      const b = document.getElementById('themeToggleBtn');
      const r = b ? b.getBoundingClientRect() : null;
      return {
        bodyBg: getComputedStyle(document.body).backgroundColor,
        toggleVisible: !!(r && r.width > 0 && r.right <= window.innerWidth && r.left >= 0),
        innerWidth: window.innerWidth,
      };
    });
    check('mobile light mode renders light', isLight(m.bodyBg), m.bodyBg);
    check('the toggle is reachable on a phone', m.toggleVisible === true, m);
    check('no layout overflow on the phone', m.innerWidth === 390, m.innerWidth);
    await mp.screenshot({ path: path.join(OUT, 'mobile-dashboard-light.png') });
    await mctx.close();
  }

  await ctx.close();
  await browser.close();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
