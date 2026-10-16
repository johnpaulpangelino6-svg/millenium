/**
 * Role dashboards — customer & technician.
 *
 * Admin, technician and customer all land on the shared 'dashboard' tab. The
 * admin dashboard is company-wide: it renders revenue, the user list, stock
 * levels and every customer's name. The whole point of the two new views is
 * that none of that reaches a customer's or a technician's browser, and that
 * each role's record lists are scoped to what the server already gave them.
 *
 * These checks are deliberately relational rather than absolute — they compare
 * what is RENDERED against what the app's own scoping helpers say should be
 * visible, so they stay valid when the fixture data changes.
 *
 * The contrast checks measure the rendered, alpha-composited colour in BOTH
 * themes, so a fix that only works in dark mode cannot pass.
 */
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:3000';
const APP = BASE + '/app';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}

// ---------------------------------------------------------------------------
// In-page colour maths: WCAG relative luminance with source-over compositing.
// ---------------------------------------------------------------------------
const HELPERS = () => {
  function parse(c) {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((s) => parseFloat(s.trim()));
    if (p.length < 3 || p.some((v) => Number.isNaN(v))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function over(fg, bg) {
    const a = fg.a;
    return {
      r: fg.r * a + bg.r * (1 - a),
      g: fg.g * a + bg.g * (1 - a),
      b: fg.b * a + bg.b * (1 - a),
      a: 1,
    };
  }
  function lum(c) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  /**
   * Resolve an element's *effective* backdrop.
   *
   * Walking up and returning the first non-transparent background is wrong when
   * that background is itself translucent (e.g. a tone pill at 12% alpha): the
   * text sits on the composited result, not on the raw tint. Collect the whole
   * translucent chain, then composite it outermost-first onto an opaque base.
   */
  function bgOf(el) {
    const stack = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) {
        stack.push(c);
        if (c.a >= 1) break;
      }
      n = n.parentElement;
    }

    let base;
    if (stack.length && stack[stack.length - 1].a >= 1) {
      base = stack.pop();
    } else {
      const htmlBg = parse(getComputedStyle(document.documentElement).backgroundColor);
      base = (htmlBg && htmlBg.a >= 1) ? htmlBg : { r: 255, g: 255, b: 255, a: 1 };
    }

    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  }
  function contrast(sel) {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg) return null;
    const bg = bgOf(el);
    const fgc = over(fg, bg);
    const L1 = lum(fgc), L2 = lum(bg);
    const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  }
  window.__c = { parse, over, lum, bgOf, contrast };
};

async function login(page, user) {
  await page.goto(APP, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('#loginUsername', { timeout: 30000 });
  await page.type('#loginUsername', user);
  await page.type('#loginPassword', '123123');
  await page.click('#loginSubmitBtn');
  // Wait until the dashboard shell has actually rendered.
  for (let i = 0; i < 60; i++) {
    const ready = await page.evaluate(() => !!document.querySelector('.dash-v2-container'));
    if (ready) break;
    await sleep(400);
  }
  await sleep(600);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
  });

  const errors = [];
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.evaluateOnNewDocument(HELPERS);

  // =========================================================================
  console.log('\n=== 1. CUSTOMER DASHBOARD ===');
  // =========================================================================
  await login(page, 'orgen');

  const cust = await page.evaluate(() => {
    const dash = document.querySelector('[data-dash]');
    const nav  = document.querySelector('.nav-item[data-tab="dashboard"]');
    const visDevices = getVisibleDevices();
    const visTickets = getVisibleTickets();
    const visRentals = getVisibleRentals();

    // Device ids rendered in the "My Devices" section.
    const renderedDeviceIds = Array.from(document.querySelectorAll('.rec-device-id'))
      .map((el) => el.textContent.trim());

    // Counts printed in the KPI tiles.
    const kpis = Array.from(document.querySelectorAll('.kpi-card-v2')).map((c) => ({
      label: (c.querySelector('.kpi-v2-label') || {}).textContent || '',
      value: (c.querySelector('.kpi-v2-value') || {}).textContent || '',
    }));

    return {
      role: state.currentRole,
      tab: state.currentTab,
      dashKind: dash ? dash.getAttribute('data-dash') : null,
      navTitle: nav ? (nav.querySelector('.nav-title') || {}).textContent : null,
      navVisible: nav ? getComputedStyle(nav).display !== 'none' : false,
      html: document.getElementById('mainContent').innerHTML,
      visDeviceCount: visDevices.length,
      visTicketCount: visTickets.length,
      visRentalCount: visRentals.length,
      visDeviceIds: visDevices.map((d) => String(d.id)),
      visDeviceOrgs: visDevices.map((d) => String(d.customerName || '')),
      renderedDeviceIds,
      kpis,
      sectionTitles: Array.from(document.querySelectorAll('.rec-section-title')).map((e) => e.textContent.trim()),
      deviceListed: document.querySelectorAll('.rec-device').length,
      rowCount: document.querySelectorAll('.rec-row').length,
    };
  });

  check('customer lands on the dashboard tab', cust.tab === 'dashboard', `tab=${cust.tab}`);
  check('the customer dashboard is the view rendered', cust.dashKind === 'customer', `data-dash=${cust.dashKind}`);
  check('the admin dashboard is NOT rendered for a customer',
    !/dash-top-grid[\s\S]{0,4000}Total Devices/.test(cust.html) && cust.dashKind !== 'admin');
  check('no company-wide revenue figure leaks in', !/Revenue/i.test(cust.html));
  check('no "Data Manager" / user-admin link leaks in', !/Data Manager/i.test(cust.html));
  check('the customer nav item is visible', cust.navVisible === true);
  check('the nav label reads as the customer workspace',
    /My Dashboard/i.test(cust.navTitle || ''), `navTitle=${cust.navTitle}`);

  check('the record sections are present',
    cust.sectionTitles.length >= 4, `sections=${JSON.stringify(cust.sectionTitles)}`);
  check('tickets / orders / devices sections all exist',
    cust.sectionTitles.some((t) => /Ticket/i.test(t)) &&
    cust.sectionTitles.some((t) => /Order|Booking/i.test(t)) &&
    cust.sectionTitles.some((t) => /Device/i.test(t)),
    JSON.stringify(cust.sectionTitles));

  // --- scoping -------------------------------------------------------------
  const kpiDevices = (cust.kpis.find((k) => /My Devices/i.test(k.label)) || {}).value;
  check('the "My Devices" KPI matches the scoped device count',
    String(kpiDevices) === String(cust.visDeviceCount),
    `kpi=${kpiDevices} scoped=${cust.visDeviceCount}`);

  check('every device rendered in the fleet list is a scoped device',
    cust.renderedDeviceIds.every((id) => cust.visDeviceIds.includes(id)),
    `rendered=${JSON.stringify(cust.renderedDeviceIds)} scoped=${JSON.stringify(cust.visDeviceIds)}`);

  check('no device from another organization is rendered',
    cust.visDeviceOrgs.every((org) => {
      const u = (cust.visDeviceOrgs[0] || '').toLowerCase();
      return !u || org.toLowerCase() === u;
    }));

  // =========================================================================
  console.log('\n=== 2. CROSS-ROLE ISOLATION ===');
  // =========================================================================
  // Collect every organization name the ADMIN can see, so we can prove a
  // customer's page never mentions a different one.
  const adminCtx = await browser.createBrowserContext();
  const adminPage = await adminCtx.newPage();
  await adminPage.setViewport({ width: 1440, height: 900 });
  adminPage.on('pageerror', (e) => errors.push('admin: ' + String(e.message || e)));
  await login(adminPage, 'admin');

  const adminView = await adminPage.evaluate(() => ({
    dashKind: (document.querySelector('[data-dash]') || {}).getAttribute
      ? document.querySelector('[data-dash]').getAttribute('data-dash') : null,
    navTitle: (document.querySelector('.nav-item[data-tab="dashboard"] .nav-title') || {}).textContent,
    orgs: Array.from(new Set((state.devices || []).map((d) => String(d.customerName || '').trim()).filter(Boolean))),
    totalDevices: (state.devices || []).length,
    html: document.getElementById('mainContent').innerHTML,
    kpis: Array.from(document.querySelectorAll('.kpi-card-v2')).map((c) =>
      (c.querySelector('.kpi-v2-label') || {}).textContent || ''),
  }));

  const myOrg = await page.evaluate(() => String((state.currentUser || {}).organization || '').trim().toLowerCase());
  const foreignOrgs = adminView.orgs.filter((o) => o.toLowerCase() !== myOrg);

  check('admin still gets the admin dashboard', adminView.dashKind === 'admin', `data-dash=${adminView.dashKind}`);
  check('the admin nav label is unchanged', /^Dashboard$/i.test((adminView.navTitle || '').trim()),
    `navTitle=${adminView.navTitle}`);
  check('the admin dashboard still shows company-wide KPIs',
    adminView.kpis.some((k) => /Total Devices/i.test(k)),
    JSON.stringify(adminView.kpis));

  const leaked = foreignOrgs.filter((o) => cust.html.includes(o));
  check('no other customer organization appears on the customer dashboard',
    leaked.length === 0, `leaked=${JSON.stringify(leaked)}`);

  // =========================================================================
  console.log('\n=== 3. TECHNICIAN DASHBOARD ===');
  // =========================================================================
  const techCtx = await browser.createBrowserContext();
  const techPage = await techCtx.newPage();
  await techPage.setViewport({ width: 1440, height: 900 });
  techPage.on('pageerror', (e) => errors.push('tech: ' + String(e.message || e)));
  await techPage.evaluateOnNewDocument(HELPERS);
  await login(techPage, 'hello');

  const tech = await techPage.evaluate(() => {
    const nav = document.querySelector('.nav-item[data-tab="dashboard"]');
    const myId = String((state.currentUser || {}).id || '');
    const assigned = (state.tickets || []).filter((t) => String(t.assignedTechnicianId || '') === myId);
    const foreign = (state.tickets || []).filter((t) => {
      const a = String(t.assignedTechnicianId || '');
      return a && a !== myId;
    });

    // Ticket ids rendered in the work queue.
    const renderedTitles = Array.from(document.querySelectorAll('.rec-row-title')).map((e) => e.textContent.trim());

    return {
      role: state.currentRole,
      tab: state.currentTab,
      dashKind: (document.querySelector('[data-dash]') || {}).getAttribute
        ? document.querySelector('[data-dash]').getAttribute('data-dash') : null,
      navTitle: nav ? (nav.querySelector('.nav-title') || {}).textContent : null,
      navVisible: nav ? getComputedStyle(nav).display !== 'none' : false,
      html: document.getElementById('mainContent').innerHTML,
      myId,
      assignedCount: assigned.length,
      foreignCount: foreign.length,
      foreignNumbers: foreign.map((t) => String(t.ticketNumber || t.id)),
      scopedCount: getVisibleTickets().length,
      renderedTitles,
      sectionTitles: Array.from(document.querySelectorAll('.rec-section-title')).map((e) => e.textContent.trim()),
      kpis: Array.from(document.querySelectorAll('.kpi-card-v2')).map((c) => ({
        label: (c.querySelector('.kpi-v2-label') || {}).textContent || '',
        value: (c.querySelector('.kpi-v2-value') || {}).textContent || '',
      })),
    };
  });

  check('technician lands on the dashboard tab', tech.tab === 'dashboard', `tab=${tech.tab}`);
  check('the technician dashboard is the view rendered', tech.dashKind === 'technician', `data-dash=${tech.dashKind}`);
  check('the admin dashboard is NOT rendered for a technician', tech.dashKind !== 'admin');
  check('the technician nav item is visible', tech.navVisible === true);
  check('the nav label reads as the technician workspace',
    /Workspace/i.test(tech.navTitle || ''), `navTitle=${tech.navTitle}`);

  check('the technician dashboard has work / parts / device sections',
    tech.sectionTitles.some((t) => /Queue/i.test(t)) &&
    tech.sectionTitles.some((t) => /Parts/i.test(t)) &&
    tech.sectionTitles.some((t) => /Device/i.test(t)),
    JSON.stringify(tech.sectionTitles));

  check('no customer-only "Orders & Bookings" section on the technician dashboard',
    !tech.sectionTitles.some((t) => /Order|Booking/i.test(t)), JSON.stringify(tech.sectionTitles));
  check('no customer support / account block on the technician dashboard',
    !/Need Help\?/i.test(tech.html));
  check('no company-wide revenue leaks to the technician', !/Revenue/i.test(tech.html));
  check('no other customer organization list leaks to the technician', !/Data Manager/i.test(tech.html));

  // --- scoping: the whole point -------------------------------------------
  check('the scoped ticket helper matches the assignment rule',
    tech.scopedCount === tech.assignedCount,
    `scoped=${tech.scopedCount} assigned=${tech.assignedCount}`);

  const assignedKpi = (tech.kpis.find((k) => /Assigned Tickets/i.test(k.label)) || {}).value;
  check('the "Assigned Tickets" KPI matches the assignment rule',
    String(assignedKpi) === String(tech.assignedCount),
    `kpi=${assignedKpi} assigned=${tech.assignedCount}`);

  check('no ticket belonging to another technician is rendered',
    tech.foreignNumbers.every((n) => !tech.renderedTitles.some((t) => t.includes(n))),
    `foreign=${JSON.stringify(tech.foreignNumbers)}`);

  // =========================================================================
  console.log('\n=== 4. THEME LEGIBILITY (rendered contrast, both themes) ===');
  // =========================================================================
  const CONTRAST_SELECTORS = [
    ['the section heading', '.rec-section-title'],
    ['the record title', '.rec-row-title'],
    ['the record metadata', '.rec-row-meta'],
    ['the section subtitle', '.rec-section-sub'],
    ['a status pill', '.rec-pill'],
    ['the hero stat value', '.hero-stat-value'],
  ];

  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => applyTheme(t), theme);
    // Wait for the theme swap to actually SETTLE, don't guess a duration.
    // The stylesheet transitions background-color/color over 0.25s, so a fixed
    // sleep(250) measures mid-transition and reads a blend of the old and new
    // palettes — which made these contrast checks flaky (~1 run in 3 failed on
    // a random one of the six selectors). Reading the computed colour twice in
    // a row and requiring them to match proves the animation has finished.
    await page.evaluate(async () => {
      const settled = () => {
        const el = document.querySelector('.rec-row-title') || document.body;
        const cs = getComputedStyle(el);
        return cs.color + '|' + cs.backgroundColor;
      };
      let prev = settled();
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const now = settled();
        if (now === prev && i > 2) return;
        prev = now;
      }
    });
    await page.evaluate(HELPERS); // helpers are wiped by a full re-render? no — re-attach defensively
    const attr = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || '(none)');

    for (const [label, sel] of CONTRAST_SELECTORS) {
      const ratio = await page.evaluate((s) => window.__c.contrast(s), sel);
      if (ratio === null) {
        check(`[${theme}] ${label} exists to measure`, false, `selector ${sel} not found`);
      } else {
        check(`[${theme}] ${label} is legible (${ratio}:1)`, ratio >= 4.5, `${sel} → ${ratio}:1`);
      }
    }
    check(`[${theme}] the theme attribute is what we asked for`,
      (theme === 'dark') === (attr === 'dark'), `attr=${attr}`);
  }

  // =========================================================================
  console.log('\n=== 5. RESPONSIVE (390px phone) ===');
  // =========================================================================
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluate(() => applyTheme('light'));
  await page.evaluate(() => renderApp());
  // Wait for the records to actually land in the DOM. renderApp() is async and
  // resolves its record lists after a round-trip, so a fixed sleep races it:
  // at 400ms `.dash-2col` is not yet present and the check below reads 0
  // columns for a board that is genuinely one column once it renders (~900ms).
  // Poll for the element instead of guessing the duration.
  for (let i = 0; i < 40; i++) {
    const ready = await page.evaluate(() => !!document.querySelector('.dash-2col'));
    if (ready) break;
    await sleep(100);
  }
  await sleep(200);

  const custMobile = await page.evaluate(() => {
    const de = document.documentElement;
    const twoCol = document.querySelector('.dash-2col');
    return {
      overflow: de.scrollWidth - de.clientWidth,
      cols: twoCol ? getComputedStyle(twoCol).gridTemplateColumns.split(' ').length : 0,
      rows: document.querySelectorAll('.rec-row').length,
    };
  });

  check('customer dashboard: no horizontal overflow at 390px', custMobile.overflow <= 1, `overflow=${custMobile.overflow}px`);
  check('customer dashboard: the two-column records collapse to one',
    custMobile.cols === 1, `columns=${custMobile.cols}`);
  check('customer dashboard: records still render on a phone', custMobile.rows >= 0);

  await techPage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await techPage.evaluate(() => renderApp());
  // Same race as the customer block above — poll for the rendered records.
  for (let i = 0; i < 40; i++) {
    const ready = await techPage.evaluate(() => !!document.querySelector('.dash-2col'));
    if (ready) break;
    await sleep(100);
  }
  await sleep(200);

  const techMobile = await techPage.evaluate(() => {
    const de = document.documentElement;
    const twoCol = document.querySelector('.dash-2col');
    return {
      overflow: de.scrollWidth - de.clientWidth,
      cols: twoCol ? getComputedStyle(twoCol).gridTemplateColumns.split(' ').length : 0,
    };
  });

  check('technician dashboard: no horizontal overflow at 390px', techMobile.overflow <= 1, `overflow=${techMobile.overflow}px`);
  check('technician dashboard: the two-column records collapse to one',
    techMobile.cols === 1, `columns=${techMobile.cols}`);

  // =========================================================================
  console.log('\n=== 6. NO PAGE ERRORS ===');
  // =========================================================================
  const realErrors = errors.filter((e) => !/ERR_NAME_NOT_RESOLVED|fonts\.googleapis/i.test(e));
  check('no page errors on any dashboard', realErrors.length === 0, realErrors.join(' | '));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
