// Captures visual evidence that the mobile drawer nav items are tappable.
// Not a pass/fail suite - a diagnostic/screenshot tool.
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const OUT = path.resolve(__dirname, '..', 'screenshots', 'mobile-audit');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.setCacheEnabled(false);

  // sign in
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await page.type('#loginUsername', 'admin');
  await page.type('#loginPassword', '123123');
  await page.click('#loginSubmitBtn');
  await new Promise((r) => setTimeout(r, 2500));

  // open drawer
  await page.click('#mobileMenuBtn');
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: path.join(OUT, 'drawer-1-open.png') });

  // prove every nav item is the topmost element at its own centre
  const probe = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.app-sidebar .nav-item'));
    return items.map((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        label: (el.textContent || '').trim().slice(0, 22),
        clickable: el.contains(hit) || hit === el,
        coveredBy: el.contains(hit) || hit === el ? null : (hit ? hit.className : 'none'),
      };
    });
  });
  console.log('--- tap targets ---');
  probe.forEach((p) => console.log(`${p.clickable ? 'OK ' : 'BLOCKED'}  ${p.label}${p.coveredBy ? '  <- ' + p.coveredBy : ''}`));

  // real tap on Inventory
  const tapped = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('.app-sidebar .nav-item'))
      .find((n) => (n.textContent || '').toLowerCase().includes('inventory'));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (tapped) {
    await page.touchscreen.tap(tapped.x, tapped.y);
    await new Promise((r) => setTimeout(r, 1200));
  }
  const after = await page.evaluate(() => ({
    drawerOpen: !!document.querySelector('.app-sidebar.mobile-open'),
    overlayDisplay: getComputedStyle(document.querySelector('.sidebar-overlay')).display,
    innerWidth: window.innerWidth,
    heading: (document.querySelector('.view-header h1, .page-title, h1') || {}).textContent,
  }));
  console.log('--- after real tap on Inventory ---');
  console.log(JSON.stringify(after));
  await page.screenshot({ path: path.join(OUT, 'drawer-2-tapped-inventory.png') });

  // re-open and show the drawer with the overlay dimming the content
  await page.click('#mobileMenuBtn');
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: path.join(OUT, 'drawer-3-reopened.png') });

  await browser.close();
  console.log('screenshots written to screenshots/mobile-audit/');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
