/**
 * Landing page — scroll motion.
 *
 * The page already had a single `.reveal` (fade up, everything at once). This
 * suite guards the upgrade: direction variants, per-sibling stagger, the
 * reading-progress bar, parallax, the header condensing, the stat count-up and
 * the feature-card spotlight — plus the two ways this kind of work goes wrong:
 *   1. an element left stuck at `opacity: 0` because its observer never fired;
 *   2. a `position: fixed` decoration, which would sit on top of the content
 *      while scrolling (the page is designed with exactly ONE pinned element,
 *      the header — `landing-page.test.cjs` asserts that, and the progress bar
 *      therefore lives inside the header as a pseudo-element).
 *
 * Run: NODE_PATH=... node tests/landing-motion.test.cjs
 */
const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:3000';
const OUT = path.join(__dirname, '..', 'screenshots', 'landing-motion');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}

/** Decompose a computed transform. Chrome returns `matrix()` for 2D values and
 *  `matrix3d()` for translate3d/scale3d, so both shapes have to be handled. */
const matrixOf = (m) => {
  const s = String(m);
  let mm = s.match(/matrix3d\(([^)]+)\)/);
  if (mm) {
    const p = mm[1].split(',').map(Number);
    return { a: p[0], e: p[12], f: p[13] };
  }
  mm = s.match(/matrix\(([^)]+)\)/);
  if (mm) {
    const p = mm[1].split(',').map(Number);
    return { a: p[0], e: p[4], f: p[5] };
  }
  return null;
};
const scaleX = (m) => (matrixOf(m) ? matrixOf(m).a : null);
const translateY = (m) => (matrixOf(m) ? matrixOf(m).f : null);
const translateX = (m) => (matrixOf(m) ? matrixOf(m).e : null);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    /* =================== A. at rest, before any scrolling =================== */
    console.log('=== AT REST (1440x900) ===');
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.setCacheEnabled(false);

    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e.message)));

    await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(2500);

    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

    const rest = await page.evaluate(() => {
      const card = document.querySelector('.feat');
      const cta = document.querySelector('.final-cta');
      const cue = document.querySelector('.hero-cue');
      const bar = getComputedStyle(document.querySelector('.site-head'), '::after');
      const hidden = (el) => el && getComputedStyle(el).opacity === '0';
      return {
        cardHidden: hidden(card),
        cardTransform: card ? getComputedStyle(card).transform : null,
        // `.final-cta` sits at the very bottom of the page, so unlike the first
        // `.sec-head` it cannot already be in view at load.
        ctaHidden: hidden(cta),
        cueVisible: cue ? getComputedStyle(cue).opacity === '1' : false,
        barPosition: bar.position,
        barOpacity: bar.opacity,
        barScale: bar.transform,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        pinned: Array.from(document.querySelectorAll('body *'))
          .filter((el) => ['fixed', 'sticky'].includes(getComputedStyle(el).position))
          .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
      };
    });

    check('the scroll cue is visible', rest.cueVisible);
    check('below-the-fold blocks start hidden', rest.cardHidden && rest.ctaHidden,
      `card=${rest.cardHidden} cta=${rest.ctaHidden}`);
    check('a hidden block is still offset (not just transparent)',
      rest.cardTransform && rest.cardTransform !== 'none', String(rest.cardTransform));
    check('the progress bar is absolutely positioned, not fixed',
      rest.barPosition === 'absolute', rest.barPosition);
    check('the progress bar is hidden at the very top', rest.barOpacity === '0', rest.barOpacity);
    check('the progress bar starts at zero length',
      scaleX(rest.barScale) === 0, String(rest.barScale));
    check('no horizontal overflow', rest.overflow <= 0, `overflow=${rest.overflow}px`);
    check('only the header is pinned',
      rest.pinned.length === 1 && rest.pinned[0].includes('site-head'),
      rest.pinned.join(', ') || 'none');

    // The stat count-up runs as soon as the strip is in view, which it is here.
    const stats = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-count]')).map((el) => el.textContent.trim()));
    check('the stats count up to their final values',
      stats.join('|') === '11|3|24/7', stats.join('|'));

    /* =================== B. stagger =================== */
    console.log('\n=== STAGGER ===');
    const delays = await page.evaluate(() => ({
      feats: Array.from(document.querySelectorAll('.feat'))
        .map((el) => el.style.getPropertyValue('--d')),
      steps: Array.from(document.querySelectorAll('.step'))
        .map((el) => el.style.getPropertyValue('--d')),
      heads: Array.from(document.querySelectorAll('.sec-head'))
        .map((el) => el.style.getPropertyValue('--d')),
    }));
    check('feature cards are staggered in order',
      delays.feats.slice(0, 4).join('|') === '0ms|80ms|160ms|240ms', delays.feats.join('|'));
    check('the stagger is capped so a long grid never crawls',
      delays.feats.every((d) => parseInt(d, 10) <= 480), delays.feats.join('|'));
    check('steps are staggered too',
      delays.steps.slice(0, 3).join('|') === '0ms|80ms|160ms', delays.steps.join('|'));
    check('a lone section heading has no delay',
      delays.heads.every((d) => d === '' || d === '0ms'), delays.heads.join('|'));

    /* =================== C. scrolling =================== */
    console.log('\n=== SCROLLING ===');
    const at25 = await page.evaluate(async () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: Math.round(max * 0.25), behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 600));
      const head = document.querySelector('.site-head');
      return {
        y: Math.round(window.pageYOffset),
        stuck: head.classList.contains('is-stuck'),
        barOpacity: getComputedStyle(head, '::after').opacity,
        barScale: getComputedStyle(head, '::after').transform,
        innerH: Math.round(document.querySelector('.head-inner').getBoundingClientRect().height),
        heroSy: document.querySelector('.hero-visual').style.getPropertyValue('--sy'),
        heroTy: getComputedStyle(document.querySelector('.hero-visual')).transform,
        auroraSy: document.querySelector('.aurora').style.getPropertyValue('--sy'),
      };
    });
    const at75 = await page.evaluate(async () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: Math.round(max * 0.75), behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 600));
      return {
        y: Math.round(window.pageYOffset),
        barScale: getComputedStyle(document.querySelector('.site-head'), '::after').transform,
      };
    });

    check('the header picks up .is-stuck', at25.stuck);
    check('the progress bar becomes visible once scrolled', at25.barOpacity === '1',
      at25.barOpacity);
    check('the bar length tracks the scroll position',
      scaleX(at25.barScale) > 0.15 && scaleX(at25.barScale) < 0.4, String(at25.barScale));
    check('the bar grows further down the page',
      scaleX(at75.barScale) > scaleX(at25.barScale) + 0.2,
      `${scaleX(at25.barScale)} -> ${scaleX(at75.barScale)}`);

    // The header condenses, so compare against its height at the top.
    const topInnerH = await page.evaluate(async () => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 500));
      return Math.round(document.querySelector('.head-inner').getBoundingClientRect().height);
    });
    check('the header condenses once it detaches from the top',
      at25.innerH < topInnerH, `${topInnerH}px -> ${at25.innerH}px`);

    check('the hero visual is parallaxed', at25.heroSy && Number(at25.heroSy) > 0,
      `--sy=${at25.heroSy}`);
    check('the parallax is applied as a real transform',
      translateY(at25.heroTy) !== null && translateY(at25.heroTy) < 0, String(at25.heroTy));
    check('the aurora drifts on its own layer',
      at25.auroraSy && Number(at25.auroraSy) > 0, `--sy=${at25.auroraSy}`);

    // Reveals must actually settle.
    const settled = await page.evaluate(async () => {
      document.getElementById('features').scrollIntoView({ behavior: 'instant', block: 'center' });
      await new Promise((r) => setTimeout(r, 1800));
      const cards = Array.from(document.querySelectorAll('.feat'));
      return {
        minOpacity: Math.min(...cards.map((c) => parseFloat(getComputedStyle(c).opacity))),
        transforms: cards.map((c) => getComputedStyle(c).transform),
        headOpacity: parseFloat(getComputedStyle(document.querySelector('.sec-head')).opacity),
        errors: 0,
      };
    });
    check('every revealed card ends fully opaque', settled.minOpacity === 1,
      `min opacity=${settled.minOpacity}`);
    check('every revealed card ends at its natural position',
      settled.transforms.every((t) => t === 'none'), settled.transforms.join(' | '));
    check('the section heading reveals too', settled.headOpacity === 1, String(settled.headOpacity));

    await page.screenshot({ path: path.join(OUT, 'scrolled-features.png') });

    // Nothing may be left invisible anywhere on the page after a full pass.
    const leftovers = await page.evaluate(async () => {
      const max = document.documentElement.scrollHeight;
      for (let y = 0; y <= max; y += 400) {
        window.scrollTo({ top: y, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 60));
      }
      // Land on the true bottom: the loop's last step can overshoot and be
      // clamped, and the footer only ever intersects there.
      window.scrollTo({ top: max, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 2000));
      return Array.from(document.querySelectorAll('.reveal'))
        .filter((el) => parseFloat(getComputedStyle(el).opacity) < 1)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return `${el.tagName.toLowerCase()}.${String(el.className).replace(/\s+/g, '.')}`
            + ` opacity=${getComputedStyle(el).opacity} in=${el.classList.contains('in')}`
            + ` rect=${Math.round(r.top)}..${Math.round(r.bottom)} vh=${window.innerHeight}`
            + ` y=${Math.round(window.pageYOffset)} maxScroll=${max - window.innerHeight}`;
        });
    });
    check('no block is left stuck invisible after a full scroll pass',
      leftovers.length === 0, leftovers.join(', '));

    /* =================== D. spotlight =================== */
    console.log('\n=== FEATURE SPOTLIGHT ===');
    const hasHover = await page.evaluate(() => window.matchMedia('(hover: hover)').matches);
    if (!hasHover) {
      console.log('  SKIP  the environment reports no hover support');
    } else {
      const spot = await page.evaluate(async () => {
        const card = document.querySelector('.feat');
        card.scrollIntoView({ behavior: 'instant', block: 'center' });
        await new Promise((r) => setTimeout(r, 400));
        const r = card.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      });
      await page.mouse.move(spot.x, spot.y);
      await sleep(400);
      const glow = await page.evaluate(() => {
        const card = document.querySelector('.feat');
        return {
          mx: card.style.getPropertyValue('--mx'),
          my: card.style.getPropertyValue('--my'),
          opacity: getComputedStyle(card, '::before').opacity,
        };
      });
      check('moving the pointer records the cursor position on the card',
        /px$/.test(glow.mx) && /px$/.test(glow.my), `--mx=${glow.mx} --my=${glow.my}`);
      check('the spotlight lights up on hover', glow.opacity === '1', glow.opacity);
      await page.screenshot({ path: path.join(OUT, 'feature-spotlight.png') });
    }

    /* =================== E. reduced motion =================== */
    console.log('\n=== PREFERS-REDUCED-MOTION ===');
    const rctx = await browser.createBrowserContext();
    const rp = await rctx.newPage();
    await rp.setViewport({ width: 1440, height: 900 });
    await rp.setCacheEnabled(false);
    await rp.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const rErrors = [];
    rp.on('pageerror', (e) => rErrors.push(String(e.message)));
    await rp.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(1500);

    const rm = await rp.evaluate(() => {
      const card = document.querySelector('.feat');
      const bar = getComputedStyle(document.querySelector('.site-head'), '::after');
      return {
        cardOpacity: getComputedStyle(card).opacity,
        cardTransform: getComputedStyle(card).transform,
        barDisplay: bar.display,
        stats: Array.from(document.querySelectorAll('[data-count]'))
          .map((el) => el.textContent.trim()).join('|'),
      };
    });
    check('reduced motion: content is visible immediately', rm.cardOpacity === '1', rm.cardOpacity);
    check('reduced motion: no offset transform is left applied',
      rm.cardTransform === 'none', rm.cardTransform);
    check('reduced motion: the progress bar is removed', rm.barDisplay === 'none', rm.barDisplay);
    check('reduced motion: the stats show their real values at once',
      rm.stats === '11|3|24/7', rm.stats);
    check('reduced motion: no page errors', rErrors.length === 0, rErrors.join(' | '));
    await rctx.close();

    /* =================== F. mobile =================== */
    console.log('\n=== MOBILE 390 ===');
    const mctx = await browser.createBrowserContext();
    const mp = await mctx.newPage();
    await mp.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await mp.setCacheEnabled(false);
    const mErrors = [];
    mp.on('pageerror', (e) => mErrors.push(String(e.message)));
    await mp.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(1500);

    const mob = await mp.evaluate(async () => {
      const card = document.querySelector('.feat');
      const before = getComputedStyle(card).transform;
      window.scrollTo({ top: 900, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 500));
      const head = document.querySelector('.site-head');
      return {
        beforeTransform: before,
        viewportW: window.innerWidth,
        deviceW: 390,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        heroTransform: getComputedStyle(document.querySelector('.hero-visual')).transform,
        barScale: getComputedStyle(head, '::after').transform,
        headerH: Math.round(head.getBoundingClientRect().height),
      };
    });
    check('mobile: sideways entrances become vertical',
      translateX(mob.beforeTransform) === 0, mob.beforeTransform);
    check('mobile: the layout viewport did not expand',
      mob.viewportW === mob.deviceW, `${mob.viewportW} vs ${mob.deviceW}`);
    check('mobile: no horizontal overflow', mob.overflow <= 0, `overflow=${mob.overflow}px`);
    check('mobile: parallax is switched off', mob.heroTransform === 'none', mob.heroTransform);
    check('mobile: the progress bar still tracks', scaleX(mob.barScale) > 0, String(mob.barScale));
    check('mobile: the header stays compact', mob.headerH <= 130, `height=${mob.headerH}`);
    check('mobile: no page errors', mErrors.length === 0, mErrors.join(' | '));
    await mp.screenshot({ path: path.join(OUT, 'mobile-390.png') });

    await mctx.close();
    await ctx.close();
  } finally {
    await browser.close();
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
