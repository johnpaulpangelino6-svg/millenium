/**
 * Verify a bad/expired token forces a clean re-login instead of showing a
 * broken half-logged-in UI.
 */
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // --- Case 1: a tampered token on load must force re-login -----------------
  console.log('\n=== TAMPERED TOKEN ON PAGE LOAD ===');
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      localStorage.setItem('millennium_auth_user', JSON.stringify({
        id: 'USR-1789631616961', username: 'orgen', fullName: 'Customer',
        role: 'customer', organization: 'QCU',
      }));
      localStorage.setItem('millennium_auth_token', 'v1.eyJ1IjoiWFhYIiwiaWF0IjoxLCJleHAiOjk5OTk5OTk5OTl9.AAAA');
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 4000));

    const st = await page.evaluate(() => ({
      token: localStorage.getItem('millennium_auth_token'),
      session: localStorage.getItem('millennium_auth_user'),
      overlayVisible: !document.getElementById('authPortalOverlay')?.classList.contains('auth-hidden'),
      currentUser: state.currentUser,
    }));
    console.log(`        token: ${st.token}, session: ${st.session}, overlay visible: ${st.overlayVisible}`);
    check('tampered token is discarded', !st.token);
    check('cached session is discarded', !st.session);
    check('login overlay is shown', st.overlayVisible === true);
    check('no user is treated as signed in', !st.currentUser);
    await ctx.close();
  }

  // --- Case 2: session expiring mid-use triggers the 401 handler -----------
  console.log('\n=== TOKEN INVALIDATED WHILE SIGNED IN ===');
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1500));

    await page.type('#loginUsername', 'admin');
    await page.type('#loginPassword', '123123');
    await page.click('#loginSubmitBtn');
    await new Promise((r) => setTimeout(r, 6000));

    const loggedIn = await page.evaluate(() => !!state.currentUser);
    check('signed in normally first', loggedIn === true);

    // Corrupt the token, then make a call that needs auth.
    const after = await page.evaluate(async () => {
      localStorage.setItem('millennium_auth_token', 'v1.corrupt.signature');
      const res = await fetch('/api/rentals');
      await new Promise((r) => setTimeout(r, 1500));
      return {
        status: res.status,
        token: localStorage.getItem('millennium_auth_token'),
        session: localStorage.getItem('millennium_auth_user'),
        overlayVisible: !document.getElementById('authPortalOverlay')?.classList.contains('auth-hidden'),
      };
    });
    console.log(`        status: ${after.status}, token cleared: ${!after.token}, overlay: ${after.overlayVisible}`);
    check('request with corrupt token returns 401', after.status === 401, `got ${after.status}`);
    check('corrupt token is cleared', !after.token);
    check('session is cleared', !after.session);
    check('user is returned to the login screen', after.overlayVisible === true);
    await ctx.close();
  }

  await browser.close();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
