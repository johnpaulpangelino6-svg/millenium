/**
 * Verifies the public landing / new-user guide page at /landing.
 *
 * The headline requirement is that the page SCROLLS and nothing is pinned:
 *   - the document is taller than the viewport
 *   - scrolling actually moves the page
 *   - NO element uses position:fixed or position:sticky
 *   - the header scrolls away with the content
 * Also checks the four guide sections, anchor navigation, the theme toggle,
 * and the link from the app's sign-in screen.
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
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  ->  ' + detail : ''}`); }
}

const SECTIONS = ['features', 'how-it-works', 'user-roles', 'about'];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // ---------------------------------------------------------------- load
  console.log('\n=== LOAD ===');
  const resp = await page.goto(BASE + '/landing', { waitUntil: 'networkidle2', timeout: 60000 });
  check('/landing returns 200', resp.status() === 200, 'status ' + resp.status());
  const title = await page.title();
  check('page has the guide title', /getting started/i.test(title), title);

  // ------------------------------------------------------- four sections
  console.log('\n=== THE FOUR REQUESTED SECTIONS ===');
  const secs = await page.evaluate((ids) => {
    return ids.map((id) => {
      const el = document.getElementById(id);
      if (!el) return { id, exists: false };
      const h = el.querySelector('h2');
      return {
        id,
        exists: true,
        heading: h ? h.textContent.trim() : '',
        top: Math.round(el.getBoundingClientRect().top + window.pageYOffset),
      };
    });
  }, SECTIONS);
  secs.forEach((s) => {
    check(`section #${s.id} exists with a heading`, s.exists && s.heading.length > 3,
      s.exists ? s.heading : 'MISSING');
  });

  // ---------------------------------------------------- nav anchor links
  console.log('\n=== NAV LINKS ===');
  const nav = await page.evaluate((ids) => {
    const links = Array.prototype.slice.call(document.querySelectorAll('#navLinks a'));
    return {
      labels: links.map((a) => a.textContent.trim()),
      targets: links.map((a) => a.getAttribute('href')),
      allResolve: links.every((a) => !!document.getElementById(a.getAttribute('href').slice(1))),
      expected: ids,
    };
  }, SECTIONS);
  check('nav has 4 links', nav.labels.length === 4, nav.labels.join(' | '));
  check('nav labels are Features / How it works / User roles / About',
    JSON.stringify(nav.labels) === JSON.stringify(['Features', 'How it works', 'User roles', 'About']),
    nav.labels.join(' | '));
  check('every nav link points at a real section', nav.allResolve);

  // ------------------------------------------------- SCROLLABLE, NOT FIXED
  console.log('\n=== SCROLLABLE, NOT FIXED ===');
  const scrollInfo = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
    realOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  check('document is taller than the viewport (page scrolls)',
    scrollInfo.scrollHeight > scrollInfo.innerHeight + 400,
    `${scrollInfo.scrollHeight} vs ${scrollInfo.innerHeight}`);
  // `clip` (not `hidden`) is required: `overflow-x: hidden` on <body> creates a
  // scroll container and silently breaks position:sticky on the header.
  check('horizontal overflow is clipped without breaking sticky',
    scrollInfo.bodyOverflowX === 'clip' && scrollInfo.realOverflow <= 0,
    `overflowX=${scrollInfo.bodyOverflowX}, overflow=${scrollInfo.realOverflow}px`);

  // Any fixed/sticky element would defeat "scrollable not fixed".
  const pinned = await page.evaluate(() => {
    const found = [];
    document.querySelectorAll('body *').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'sticky') {
        found.push({ tag: el.tagName.toLowerCase(), cls: el.className || '', pos: cs.position });
      }
    });
    return found;
  });
  // The header itself is EXPECTED to be pinned. Nothing else may be, otherwise
  // it would sit on top of the content while the page scrolls.
  const others = pinned.filter((p) => !String(p.cls).includes('site-head'));
  check('the header is pinned (position:sticky)',
    pinned.some((p) => String(p.cls).includes('site-head')),
    pinned.map((p) => `${p.tag}.${p.cls}:${p.pos}`).join(', ') || 'none found');
  check('nothing ELSE on the page is fixed or sticky',
    others.length === 0,
    others.map((p) => `${p.tag}.${p.cls}:${p.pos}`).join(', '));

  // Actually scroll and prove the page moved.
  const scrolled = await page.evaluate(async () => {
    const before = window.pageYOffset;
    window.scrollTo(0, 1400);
    await new Promise((r) => setTimeout(r, 700));
    return { before, after: window.pageYOffset };
  });
  check('scrolling actually moves the page', scrolled.after > scrolled.before + 800,
    `${scrolled.before} -> ${scrolled.after}`);

  // The header must STAY visible at every scroll depth (this is the fix).
  console.log('\n=== HEADER STAYS VISIBLE WHILE SCROLLING ===');
  const depths = [0, 400, 1400, 3200, 99999];
  const seen = [];
  for (const y of depths) {
    const r = await page.evaluate(async (yy) => {
      // `behavior: instant` overrides the page's CSS `scroll-behavior: smooth`
      // so each probe lands immediately instead of still animating when read.
      window.scrollTo({ top: yy, behavior: 'instant' });
      await new Promise((res) => setTimeout(res, 450));
      const h = document.querySelector('.site-head');
      const rect = h.getBoundingClientRect();
      const cs = getComputedStyle(h);
      return {
        y: Math.round(window.pageYOffset),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        pos: cs.position,
        stuck: h.classList.contains('is-stuck'),
        // fully inside the viewport => the user can always see and click it
        onScreen: rect.top >= -1 && rect.bottom > 0 && rect.bottom <= window.innerHeight + 2,
      };
    }, y);
    seen.push(r);
  }
  seen.forEach((r) => console.log(`        scrollY=${String(r.y).padStart(5)}  headerTop=${String(r.top).padStart(4)}  stuck=${r.stuck}  onScreen=${r.onScreen}`));
  check('header is position:sticky', seen.every((r) => r.pos === 'sticky'),
    seen.map((r) => r.pos).join(','));
  check('header is still on screen at EVERY scroll depth',
    seen.every((r) => r.onScreen), JSON.stringify(seen.map((r) => r.top)));
  check('header is pinned to the very top once scrolled (top === 0)',
    seen.filter((r) => r.y > 50).every((r) => Math.abs(r.top) <= 1),
    JSON.stringify(seen.map((r) => r.top)));
  check('at the very top the header has no separator',
    seen[0].y === 0 && seen[0].stuck === false,
    `scrollY=${seen[0].y}, stuck=${seen[0].stuck}`);
  check('header gains the .is-stuck separator once scrolled',
    seen.filter((r) => r.y > 50).every((r) => r.stuck),
    JSON.stringify(seen.map((r) => r.stuck)));

  // Content must genuinely pass underneath the pinned header.
  const under = await page.evaluate(async () => {
    window.scrollTo({ top: 2600, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 500));
    const h = document.querySelector('.site-head');
    const hr = h.getBoundingClientRect();
    // any section currently overlapping the header band
    const overlapping = [];
    document.querySelectorAll('section, .feat, .role, .step').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < hr.bottom && r.bottom > hr.top) overlapping.push(el.id || el.className.split(' ')[0]);
    });
    return { headerBottom: Math.round(hr.bottom), overlapping: overlapping.length };
  });
  check('content scrolls underneath the header (something overlaps it)',
    under.overlapping > 0, JSON.stringify(under));

  // ------------------------------------------------ anchor click scrolls
  console.log('\n=== ANCHOR NAVIGATION ===');
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    const link = Array.prototype.find.call(
      document.querySelectorAll('#navLinks a'), (a) => a.getAttribute('href') === '#user-roles'
    );
    link.click();
  });
  await new Promise((r) => setTimeout(r, 1400));
  const anchored = await page.evaluate(() => {
    const el = document.getElementById('user-roles');
    return {
      rectTop: Math.round(el.getBoundingClientRect().top),
      y: window.pageYOffset,
      hash: location.hash,
    };
  });
  check('clicking "User roles" scrolls that section into view',
    anchored.rectTop > -80 && anchored.rectTop < 260, `rect.top = ${anchored.rectTop}`);
  check('the URL hash updates', anchored.hash === '#user-roles', anchored.hash);
  await page.screenshot({ path: path.join(OUT, '12-landing-user-roles-dark.png') });
  console.log('  saved 12-landing-user-roles-dark.png');

  // ------------------------------------------------------------ content
  console.log('\n=== CONTENT ===');
  const content = await page.evaluate(() => ({
    featureCards: document.querySelectorAll('#features .feat').length,
    steps: document.querySelectorAll('#how-it-works .step').length,
    roleCards: document.querySelectorAll('#user-roles .role').length,
    roleTitles: Array.prototype.map.call(
      document.querySelectorAll('#user-roles .role h3'), (h) => h.textContent.trim()),
    roleBullets: Array.prototype.map.call(
      document.querySelectorAll('#user-roles .role'), (c) => c.querySelectorAll('li').length),
    aboutSpecs: document.querySelectorAll('#about .spec-row').length,
    getStarted: Array.prototype.filter.call(
      document.querySelectorAll('a.btn'), (a) => /get started/i.test(a.textContent)).length,
  }));
  check('features section lists feature cards', content.featureCards >= 8, 'cards=' + content.featureCards);
  check('how-it-works lists numbered steps', content.steps >= 4, 'steps=' + content.steps);
  check('user roles shows exactly 3 roles', content.roleCards === 3, 'roles=' + content.roleCards);
  check('roles are Administrator / Technician / Customer',
    JSON.stringify(content.roleTitles) === JSON.stringify(['Administrator', 'Technician', 'Customer']),
    content.roleTitles.join(' | '));
  check('every role card has bullet points',
    content.roleBullets.every((n) => n >= 5), content.roleBullets.join(','));
  check('about section has an at-a-glance spec list', content.aboutSpecs >= 5, 'rows=' + content.aboutSpecs);
  check('"Get started" call-to-action is present', content.getStarted >= 2, 'ctas=' + content.getStarted);

  // --------------------------------------------------------- theme toggle
  console.log('\n=== THEME TOGGLE ===');
  const theme = await page.evaluate(async () => {
    const root = document.documentElement;
    const start = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    document.getElementById('themeBtn').click();
    await new Promise((r) => setTimeout(r, 500));
    const mid = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const stored = localStorage.getItem('millennium-theme');
    return { start, mid, stored };
  });
  check('theme toggle flips the theme', theme.start !== theme.mid, `${theme.start} -> ${theme.mid}`);
  check('theme choice is persisted', theme.stored === theme.mid, theme.stored);

  // ---------------------------------------------------------- screenshots
  console.log('\n=== SCREENSHOTS ===');
  await page.evaluate(() => { localStorage.setItem('millennium-theme', 'dark'); });
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.join(OUT, '13-landing-hero-dark.png') });
  console.log('  saved 13-landing-hero-dark.png');

  await page.evaluate(() => window.scrollTo(0, 1180));
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: path.join(OUT, '14-landing-features-dark.png') });
  console.log('  saved 14-landing-features-dark.png');

  // Deep in the page — the pinned header should still be sitting at the top.
  await page.evaluate(() => window.scrollTo(0, 2750));
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: path.join(OUT, '22-landing-sticky-header-dark.png') });
  console.log('  saved 22-landing-sticky-header-dark.png');

  await page.evaluate(() => { localStorage.setItem('millennium-theme', 'light'); });
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.join(OUT, '15-landing-hero-light.png') });
  console.log('  saved 15-landing-hero-light.png');

  await page.evaluate(() => {
    const el = document.getElementById('how-it-works');
    window.scrollTo(0, el.getBoundingClientRect().top + window.pageYOffset - 20);
  });
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: path.join(OUT, '16-landing-how-it-works-light.png') });
  console.log('  saved 16-landing-how-it-works-light.png');

  // full-page capture proves the whole thing is one scrollable document
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, '17-landing-fullpage-light.png'), fullPage: true });
  console.log('  saved 17-landing-fullpage-light.png');

  // ------------------------------------------------------------ mobile
  console.log('\n=== MOBILE (390x844) ===');
  const mctx = await browser.createBrowserContext();
  const mpage = await mctx.newPage();
  await mpage.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mErrors = [];
  mpage.on('pageerror', (e) => mErrors.push(String(e.message)));
  await mpage.goto(BASE + '/landing', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 900));
  const m = await mpage.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    navVisible: !!document.querySelector('#navLinks a'),
    navWraps: getComputedStyle(document.getElementById('navLinks')).flexWrap,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  check('mobile: no horizontal overflow', m.overflow <= 0, 'overflow=' + m.overflow + 'px');
  check('mobile: nav links still present', m.navVisible);
  check('mobile: page is scrollable', m.scrollHeight > 1600, 'h=' + m.scrollHeight);
  await mpage.screenshot({ path: path.join(OUT, '18-landing-mobile-top.png') });
  console.log('  saved 18-landing-mobile-top.png');
  await mpage.evaluate(() => window.scrollTo(0, 1500));
  await new Promise((r) => setTimeout(r, 600));
  const mSticky = await mpage.evaluate(() => {
    const h = document.querySelector('.site-head');
    const r = h.getBoundingClientRect();
    return {
      pos: getComputedStyle(h).position,
      top: Math.round(r.top),
      height: Math.round(r.height),
      onScreen: r.top >= -1 && r.bottom > 0 && r.bottom <= window.innerHeight + 2,
    };
  });
  check('mobile: header stays visible while scrolling',
    mSticky.pos === 'sticky' && mSticky.onScreen && Math.abs(mSticky.top) <= 1,
    JSON.stringify(mSticky));
  check('mobile: pinned header stays compact (<= 130px tall)',
    mSticky.height <= 130, 'height=' + mSticky.height);
  await mpage.screenshot({ path: path.join(OUT, '19-landing-mobile-scrolled.png') });
  console.log('  saved 19-landing-mobile-scrolled.png');
  check('mobile: no page errors', mErrors.length === 0, mErrors.join(' | '));
  await mctx.close();

  // ------------------------------------- link from the app sign-in screen
  console.log('\n=== LINK FROM THE SIGN-IN SCREEN ===');
  const actx = await browser.createBrowserContext();
  const apage = await actx.newPage();
  await apage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await apage.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await apage.evaluate(() => localStorage.clear());
  await apage.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2000));
  const linkInfo = await apage.evaluate(() => {
    const a = document.querySelector('.auth-guide-link a');
    return a ? { href: a.getAttribute('href'), text: a.textContent.trim() } : null;
  });
  check('sign-in screen has a link to the guide', !!linkInfo, 'not found');
  if (linkInfo) {
    check('that link points to /landing', linkInfo.href === '/landing', linkInfo.href);
    await Promise.all([
      apage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      apage.click('.auth-guide-link a'),
    ]);
    const t = await apage.title();
    check('clicking it lands on the guide', /getting started/i.test(t), t);
    await apage.screenshot({ path: path.join(OUT, '20-login-guide-link.png') });
    console.log('  saved 20-login-guide-link.png');
  }
  await actx.close();

  // ------------------------------------------------------- brand parity
  // "MILLENNIUM" must use the same font and the same colour combination as the
  // app's own .millennium-word, so the brand reads identically on both pages.
  console.log('\n=== BRAND: MILLENNIUM MATCHES THE APP ===');
  {
    // Reference: the app's own brand, from the sign-in portal.
    const bctx = await browser.createBrowserContext();
    const bp = await bctx.newPage();
    await bp.setCacheEnabled(false);
    await bp.evaluateOnNewDocument(() => localStorage.setItem('millennium-theme', 'dark'));
    await bp.goto(BASE + '/', { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 600));
    const appBrand = await bp.evaluate(() => {
      const el = document.querySelector('.millennium-word');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        fontFamily: cs.fontFamily,
        fontWeight: cs.fontWeight,
        fill: cs.webkitTextFillColor,
        bg: cs.backgroundImage,
      };
    });
    await bctx.close();

    // Same theme on the landing page so the gradients are directly comparable.
    await page.evaluate(() => localStorage.setItem('millennium-theme', 'dark'));
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    const landBrand = await page.evaluate(() => {
      const el = document.querySelector('.brand-name');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        text: el.textContent.trim(),
        fontFamily: cs.fontFamily,
        fontWeight: cs.fontWeight,
        fill: cs.webkitTextFillColor,
        bg: cs.backgroundImage,
        cinzel: document.fonts.check('900 16px Cinzel'),
        width: Math.round(el.getBoundingClientRect().width),
      };
    });

    check('landing brand element exists', !!landBrand);
    check('app brand element found for comparison', !!appBrand);
    if (landBrand && appBrand) {
      check('same font stack as the app',
        landBrand.fontFamily === appBrand.fontFamily,
        'landing=' + landBrand.fontFamily + ' app=' + appBrand.fontFamily);
      check('same font weight as the app',
        landBrand.fontWeight === appBrand.fontWeight,
        landBrand.fontWeight);
      check('Cinzel is actually loaded (not a serif fallback)',
        landBrand.cinzel === true);
      check('text is gradient-clipped, not flat colour',
        /rgba\(0, 0, 0, 0\)/.test(landBrand.fill), landBrand.fill);
      check('dark-theme chrome gradient matches the app exactly',
        landBrand.bg === appBrand.bg,
        'landing=' + landBrand.bg.slice(0, 70) + ' app=' + appBrand.bg.slice(0, 70));
      check('brand reads MILLENNIUM', landBrand.text === 'MILLENNIUM', landBrand.text);
    }

    // Light theme must swap to the darker chrome so it stays legible.
    await page.evaluate(() => localStorage.setItem('millennium-theme', 'light'));
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    const lightBrand = await page.evaluate(() => {
      const el = document.querySelector('.brand-name');
      const cs = getComputedStyle(el);
      return { theme: document.documentElement.getAttribute('data-theme') || '(none)', bg: cs.backgroundImage };
    });
    check('light theme uses the darker chrome gradient',
      lightBrand.theme === '(none)' && /rgb\(82, 82, 82\)/.test(lightBrand.bg) && lightBrand.bg !== (appBrand ? appBrand.bg : ''),
      lightBrand.bg.slice(0, 70));
    await page.screenshot({ path: path.join(OUT, '23-landing-brand-light.png'), clip: { x: 0, y: 0, width: 1440, height: 110 } });
    console.log('  saved 23-landing-brand-light.png');
  }

  check('no page errors on the landing page', errors.length === 0, errors.slice(0, 3).join(' | '));

  await ctx.close();
  await browser.close();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
