/**
 * Dialog theming — the "dark island" bug.
 *
 * The Restock Shipment dialog (and the Create/Edit User + Create Customer
 * dialogs) were built with `background: var(--bg-card, #1a1a2e)`. `--bg-card`
 * is defined NOWHERE, so the fallback always won and every one of those cards
 * was a hard-coded dark navy in BOTH themes — while everything inside it
 * (`.form-input`, `.btn-secondary`, `--text-primary`) correctly followed the
 * theme. In the light theme that produced a near-black card with a near-black
 * title on it: the heading was invisible.
 *
 * These checks measure the *rendered* result in both themes, so they cannot be
 * satisfied by a token that happens to look right in one mode only.
 *
 * Run: NODE_PATH=... node tests/modal-theme.test.cjs
 */
const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');

const CHROME = require('./_chrome-path.cjs');
const BASE = 'http://127.0.0.1:3000';
const APP = BASE + '/app';
const OUT = path.join(__dirname, '..', 'screenshots', 'modal-review');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}

async function login(page, user) {
  await page.goto(APP, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.type('#loginUsername', user);
  await page.type('#loginPassword', '123123');
  await page.click('#loginSubmitBtn');
  await sleep(3500);
}

/* ---------------------------------------------------------------------------
 * Measured inside the page: WCAG relative luminance + contrast ratio, with
 * alpha compositing so a translucent token is judged on what it actually
 * looks like rather than on its raw channel values.
 * ------------------------------------------------------------------------- */
const MEASURE = (openFn, dark) => {
  const parse = (css) => {
    const m = String(css).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((v) => parseFloat(v.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (c, base) => (!c ? null : ({
    r: c.r * c.a + base.r * (1 - c.a),
    g: c.g * c.a + base.g * (1 - c.a),
    b: c.b * c.a + base.b * (1 - c.a),
    a: 1,
  }));
  const lum = (c) => {
    if (!c) return null;
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    if (l1 == null || l2 == null) return null;
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };

  const base = dark ? { r: 4, g: 7, b: 17, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };

  // Open the dialog under test.
  window.eval(openFn + '()');

  const content = document.querySelector('#restockModalOverlay .modal-content')
    || document.querySelector('.modal-content');
  if (!content) return { missing: true };

  const cs = getComputedStyle(content);
  const surface = over(parse(cs.backgroundColor), base);

  const title = content.querySelector('.modal-title') || content.querySelector('h2, h3');
  const titleColor = title ? over(parse(getComputedStyle(title).color), surface) : null;

  const label = content.querySelector('.form-label');
  const labelColor = label ? over(parse(getComputedStyle(label).color), surface) : null;

  const section = content.querySelector('.form-section');
  const sectionBg = section
    ? over(parse(getComputedStyle(section).backgroundColor), surface)
    : null;

  const activeTab = content.querySelector('.seg-tab.is-active');
  const idleTab = content.querySelector('.seg-tab:not(.is-active)');
  const track = content.querySelector('.seg-tabs');
  const trackBg = track ? over(parse(getComputedStyle(track).backgroundColor), surface) : null;
  const idleColor = idleTab
    ? over(parse(getComputedStyle(idleTab).color), trackBg || surface)
    : null;

  // The active tab is a tinted pill layered over the track, so composite it.
  const activeBgRaw = activeTab ? parse(getComputedStyle(activeTab).backgroundColor) : null;
  const activeBg = activeBgRaw ? over(activeBgRaw, trackBg || surface) : null;
  const activeColor = activeTab
    ? over(parse(getComputedStyle(activeTab).color), activeBg || trackBg || surface)
    : null;

  const footer = content.querySelector('.modal-footer');
  const footerBg = footer
    ? over(parse(getComputedStyle(footer).backgroundColor), surface)
    : null;

  return {
    missing: false,
    surfaceLum: lum(surface),
    titleLum: lum(titleColor),
    titleContrast: ratio(titleColor, surface),
    labelContrast: ratio(labelColor, surface),
    sectionLum: lum(sectionBg),
    sectionContrast: ratio(sectionBg, surface),
    activeTabGradient: activeTab ? getComputedStyle(activeTab).backgroundImage : null,
    activeTabColor: activeColor,
    activeTabContrast: ratio(activeColor, activeBg || trackBg || surface),
    activeTabFilled: activeTab
      ? !/rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(activeTab).backgroundColor)
      : null,
    activeTabShadow: activeTab ? getComputedStyle(activeTab).boxShadow : null,
    activeTabVsIdle: activeTab && idleTab
      ? Math.abs(lum(activeBg) - lum(trackBg)) > 0.004
      : null,
    idleTabTransparent: idleTab
      ? /rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(idleTab).backgroundColor)
      : null,
    idleTabContrast: ratio(idleColor, trackBg || surface),
    idleTabClasses: idleTab ? idleTab.className : null,
    hasFooter: !!footer,
    footerButtons: footer ? footer.querySelectorAll('button').length : 0,
    footerLum: lum(footerBg),
    // Legacy markers that must be gone.
    usesBgCardFallback: cs.backgroundColor === 'rgb(26, 26, 46)',
    tabCount: content.querySelectorAll('.seg-tab').length,
    sectionCount: content.querySelectorAll('.form-section').length,
    errorUsesClass: !!content.querySelector('.form-error'),
  };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    for (const theme of ['light', 'dark']) {
      const dark = theme === 'dark';
      console.log(`\n=== RESTOCK SHIPMENT DIALOG — ${theme.toUpperCase()} ===`);
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      await page.setCacheEnabled(false);
      await page.evaluateOnNewDocument((t) => {
        localStorage.setItem('millennium-theme', t);
      }, theme);

      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e.message)));

      await login(page, 'admin');
      await page.evaluate(() => switchTab('inventory'));
      await sleep(1200);
      // `.modal-backdrop` fades in over 0.25s. Headless Chrome throttles
      // transitions when no frame is produced, so a screenshot taken right
      // after open() captures a *translucent* dialog — the page behind shows
      // straight through it. Kill transitions so the state is deterministic.
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });

      const g = await page.evaluate(MEASURE, 'openRestockModal', dark);
      check(`${theme}: the dialog rendered`, !g.missing, 'no .modal-content found');
      if (g.missing) { await ctx.close(); continue; }

      check(`${theme}: the backdrop finished fading in`, await page.evaluate(() =>
        getComputedStyle(document.getElementById('restockModalOverlay')).opacity === '1'),
        'the backdrop was still mid-fade');

      await sleep(300);
      await page.screenshot({ path: path.join(OUT, `restock-${theme}.png`) });
      console.log(`  saved restock-${theme}.png`);

      // --- the surface itself
      if (dark) {
        check(`${theme}: dialog surface is dark`, g.surfaceLum < 0.10, `lum=${g.surfaceLum.toFixed(3)}`);
        check(`${theme}: title text is light`, g.titleLum > 0.55, `lum=${g.titleLum.toFixed(3)}`);
      } else {
        check(`${theme}: dialog surface is light`, g.surfaceLum > 0.70, `lum=${g.surfaceLum.toFixed(3)}`);
        check(`${theme}: title text is dark`, g.titleLum < 0.20, `lum=${g.titleLum.toFixed(3)}`);
      }

      // Regression: the old hard-coded #1a1a2e fallback.
      check(`${theme}: surface is not the hard-coded #1a1a2e`, !g.usesBgCardFallback,
        'the dialog is still using the --bg-card fallback');

      // --- readability
      check(`${theme}: title contrast >= 4.5`, g.titleContrast >= 4.5, `ratio=${g.titleContrast}`);
      check(`${theme}: field label contrast >= 4.5`, g.labelContrast >= 4.5, `ratio=${g.labelContrast}`);
      check(`${theme}: inactive tab contrast >= 4.5`, g.idleTabContrast >= 4.5, `ratio=${g.idleTabContrast}`);

      // --- the section panel must be distinguishable from the dialog surface
      if (dark) check(`${theme}: form section is a dark panel`, g.sectionLum < 0.12, `lum=${g.sectionLum.toFixed(3)}`);
      else check(`${theme}: form section is a light panel`, g.sectionLum > 0.70, `lum=${g.sectionLum.toFixed(3)}`);
      check(`${theme}: form section is visible against the surface`, g.sectionContrast >= 1.03,
        `ratio=${g.sectionContrast}`);

      // --- segmented control
      check(`${theme}: two segmented tabs`, g.tabCount === 2, `count=${g.tabCount}`);
      check(`${theme}: the active tab is filled`, g.activeTabFilled === true,
        String(g.activeTabFilled));
      check(`${theme}: the active tab reads as selected (ring or shadow)`,
        /inset|rgb/.test(String(g.activeTabShadow)), String(g.activeTabShadow));
      check(`${theme}: the active tab is distinguishable from the track`,
        g.activeTabVsIdle === true, `activeVsIdle=${g.activeTabVsIdle}`);
      check(`${theme}: the active tab text contrast >= 4.5`, g.activeTabContrast >= 4.5,
        `ratio=${g.activeTabContrast} color=${JSON.stringify(g.activeTabColor)}`);
      check(`${theme}: the active tab is NOT a filled primary gradient`,
        g.activeTabGradient === 'none', String(g.activeTabGradient));
      check(`${theme}: the inactive tab is not filled`, g.idleTabTransparent === true,
        String(g.idleTabTransparent));
      check(`${theme}: the inactive tab is NOT a .btn-primary`,
        !/\bbtn-primary\b/.test(String(g.idleTabClasses)), String(g.idleTabClasses));

      // --- footer
      check(`${theme}: the footer holds three actions`, g.hasFooter && g.footerButtons === 3,
        `buttons=${g.footerButtons}`);
      if (dark) check(`${theme}: footer sits on the elevated dark surface`, g.footerLum < 0.12, `lum=${g.footerLum.toFixed(3)}`);
      else check(`${theme}: footer sits on a light surface`, g.footerLum > 0.70, `lum=${g.footerLum.toFixed(3)}`);

      check(`${theme}: validation message uses the .form-error class`, g.errorUsesClass);
      check(`${theme}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));

      await ctx.close();
    }

    /* --------------------------- behaviour --------------------------- */
    console.log('\n=== BEHAVIOUR ===');
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(() => localStorage.setItem('millennium-theme', 'dark'));
    await login(page, 'admin');
    await page.evaluate(() => switchTab('inventory'));
    await sleep(1200);
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });

    await page.evaluate(() => openRestockModal());
    await sleep(300);
    check('opens as an active backdrop', await page.evaluate(() =>
      document.getElementById('restockModalOverlay')?.classList.contains('active') === true));

    // Switch to the "new part" tab.
    await page.click('#tabNewPart');
    await sleep(250);
    const tabbed = await page.evaluate(() => ({
      newShown: getComputedStyle(document.getElementById('restockNewSection')).display !== 'none',
      existingHidden: getComputedStyle(document.getElementById('restockExistingSection')).display === 'none',
      newActive: document.getElementById('tabNewPart').classList.contains('is-active'),
      existingActive: document.getElementById('tabExistingPart').classList.contains('is-active'),
      ariaNew: document.getElementById('tabNewPart').getAttribute('aria-selected'),
      ariaExisting: document.getElementById('tabExistingPart').getAttribute('aria-selected'),
    }));
    check('switching to "New Part Catalog" reveals that section', tabbed.newShown && tabbed.existingHidden,
      JSON.stringify(tabbed));
    check('the segmented control follows the switch',
      tabbed.newActive && !tabbed.existingActive, JSON.stringify(tabbed));
    check('aria-selected follows the switch',
      tabbed.ariaNew === 'true' && tabbed.ariaExisting === 'false', JSON.stringify(tabbed));
    await page.screenshot({ path: path.join(OUT, 'restock-new-part-dark.png') });

    // And back.
    await page.click('#tabExistingPart');
    await sleep(250);
    check('switching back restores the existing-part section', await page.evaluate(() =>
      getComputedStyle(document.getElementById('restockExistingSection')).display !== 'none'
      && document.getElementById('tabExistingPart').classList.contains('is-active')));

    // Escape closes it.
    await page.keyboard.press('Escape');
    await sleep(300);
    check('Escape closes the dialog',
      await page.evaluate(() => !document.getElementById('restockModalOverlay')));

    // Clicking the backdrop closes it.
    await page.evaluate(() => openRestockModal());
    await sleep(400);
    const hit = await page.evaluate(() => {
      const el = document.elementFromPoint(8, 450);
      return el ? `<${el.tagName.toLowerCase()} id="${el.id}" class="${String(el.className)}">` : 'nothing';
    });
    await page.mouse.click(8, 450);
    await sleep(400);
    check('clicking the backdrop closes the dialog',
      await page.evaluate(() => !document.getElementById('restockModalOverlay')),
      `the element at (8,450) was ${hit}`);

    // Cancel closes it.
    await page.evaluate(() => openRestockModal());
    await sleep(300);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#restockModalOverlay .modal-footer button'));
      btns.find((b) => b.textContent.trim() === 'Cancel').click();
    });
    await sleep(300);
    check('Cancel closes the dialog',
      await page.evaluate(() => !document.getElementById('restockModalOverlay')));
    await ctx.close();

    /* ------------------- the other three dialogs ------------------- */
    console.log('\n=== CREATE / EDIT USER + CREATE CUSTOMER (light) ===');
    const c2 = await browser.createBrowserContext();
    const p2 = await c2.newPage();
    await p2.setViewport({ width: 1440, height: 900 });
    await p2.evaluateOnNewDocument(() => localStorage.setItem('millennium-theme', 'light'));
    await login(p2, 'admin');
    await p2.evaluate(() => switchTab('data-manager'));
    await sleep(1200);
    await p2.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });

    for (const [label, fn] of [
      ['Create System User', 'openCreateUserModal'],
      ['Create Customer', 'openCreateCustomerModal'],
    ]) {
      await p2.evaluate((f) => { window.eval(f + '()'); }, fn);
      await sleep(400);
      const d = await p2.evaluate(() => {
        const content = document.querySelector('.modal-content');
        if (!content) return { missing: true };
        const cs = getComputedStyle(content);
        const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
        const p = m ? m[1].split(',').map((v) => parseFloat(v)) : null;
        const title = content.querySelector('h2, h3, .modal-title');
        return {
          missing: false,
          bg: cs.backgroundColor,
          rgb: p ? p.slice(0, 3) : null,
          isDarkFallback: cs.backgroundColor === 'rgb(26, 26, 46)',
          titleColor: title ? getComputedStyle(title).color : null,
        };
      });
      check(`${label}: renders`, !d.missing, 'no .modal-content');
      if (d.missing) continue;
      check(`${label}: card is light in the light theme`,
        d.rgb && d.rgb[0] > 200 && d.rgb[1] > 200 && d.rgb[2] > 200, `bg=${d.bg}`);
      check(`${label}: is not the hard-coded dark fallback`, !d.isDarkFallback, `bg=${d.bg}`);
      check(`${label}: heading is dark on that card`,
        /rgb\(15, 23, 42\)|rgb\(71, 85, 105\)/.test(String(d.titleColor)), `color=${d.titleColor}`);
      await p2.screenshot({ path: path.join(OUT, `dialog-${fn}.png`) });
      await p2.evaluate(() => document.querySelectorAll('.modal-backdrop, [id$="ModalOverlay"]').forEach((o) => o.remove()));
      await sleep(200);
    }
    await c2.close();

    /* --------------------------- source check --------------------------- */
    console.log('\n=== SOURCE ===');
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
    check('app.js no longer references the undefined --bg-card token',
      !appJs.includes('--bg-card'), '--bg-card is still used somewhere');
    check('no dialog still falls back to the hard-coded #1a1a2e',
      !appJs.includes('#1a1a2e'), '#1a1a2e still present');
    check('the restock dialog uses the shared .modal-content shell',
      /restockModalOverlay[\s\S]{0,600}?class="modal-content modal-form"/.test(appJs));
  } finally {
    await browser.close();
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
