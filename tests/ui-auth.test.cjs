/**
 * UI end-to-end check after adding token auth.
 * Drives the REAL login form, then the Rentals tab, for admin and customer.
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}

async function runAs(browser, username, password, label) {
  console.log(`\n=== ${label} (${username}) ===`);
  // A fresh browser context = isolated localStorage, so one role's session
  // cannot leak into the next role's test.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1500, height: 950 });

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2000));

  // Fill the real login form and submit it.
  await page.waitForSelector('#loginUsername', { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
  });
  await page.type('#loginUsername', username);
  await page.type('#loginPassword', password);
  await page.click('#loginSubmitBtn');
  await new Promise((r) => setTimeout(r, 6000));

  const afterLogin = await page.evaluate(() => ({
    token: localStorage.getItem('millennium_auth_token'),
    session: localStorage.getItem('millennium_auth_user'),
    overlayHidden: document.getElementById('authPortalOverlay')?.classList.contains('auth-hidden'),
    role: state.currentRole,
    userId: state.currentUser && state.currentUser.id,
    rentalsInState: (state.rentals || []).length,
  }));

  console.log(`        token stored: ${afterLogin.token ? 'yes (' + afterLogin.token.slice(0, 12) + '...)' : 'NO'}`);
  console.log(`        role: ${afterLogin.role}, rentals in state: ${afterLogin.rentalsInState}`);

  check(`${label}: token stored in localStorage`, !!afterLogin.token);
  check(`${label}: session stored`, !!afterLogin.session);
  check(`${label}: auth overlay hidden (logged in)`, afterLogin.overlayHidden === true);

  // Open the Rentals tab through the real sidebar handler.
  const rentals = await page.evaluate(async () => {
    navigateTo('rentals');
    await new Promise((r) => setTimeout(r, 1500));
    const table = document.querySelector('#mainContent table');
    const rows = table ? Array.from(table.querySelectorAll('tbody tr')) : [];
    const bodyText = (document.getElementById('mainContent') || {}).innerText || '';
    return {
      tab: state.currentTab,
      rowCount: rows.length,
      rowTexts: rows.map((r) => r.innerText.replace(/\s+/g, ' ').trim().slice(0, 90)),
      visibleRentals: (typeof getVisibleRentals === 'function' ? getVisibleRentals() : state.rentals).length,
      hasRentalsHeading: /rental/i.test(bodyText.slice(0, 400)),
      bodySnippet: bodyText.replace(/\s+/g, ' ').slice(0, 200),
    };
  });

  console.log(`        tab: ${rentals.tab}, table rows: ${rentals.rowCount}, visible rentals: ${rentals.visibleRentals}`);
  rentals.rowTexts.slice(0, 4).forEach((t) => console.log(`          | ${t}`));

  check(`${label}: landed on rentals tab`, rentals.tab === 'rentals', `got ${rentals.tab}`);
  check(`${label}: rentals view rendered`, rentals.hasRentalsHeading, rentals.bodySnippet);

  // Reload to prove the stored token keeps the session alive.
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 4000));
  const afterReload = await page.evaluate(() => ({
    stillLoggedIn: !!state.currentUser,
    token: localStorage.getItem('millennium_auth_token'),
    overlayHidden: document.getElementById('authPortalOverlay')?.classList.contains('auth-hidden'),
  }));
  check(`${label}: still signed in after reload`, afterReload.stillLoggedIn === true);
  check(`${label}: token survived reload`, !!afterReload.token);

  const realErrors = errors.filter((e) => !/favicon|manifest|icon-192|Download error/i.test(e));
  check(`${label}: no page errors`, realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  await page.close();
  await context.close();
  return afterLogin;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  await runAs(browser, 'admin', '123123', 'ADMIN');
  await runAs(browser, 'orgen', '123123', 'CUSTOMER');

  await browser.close();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
