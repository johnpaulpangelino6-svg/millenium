/** Capture screenshots of the new rental form and the profile dialog. */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';
const OUT = path.resolve('screenshots');

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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // --- Customer: rental form, dark then light ---
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await login(page, 'orgen', '123123');

  await page.evaluate(async () => {
    applyTheme('dark');
    navigateTo('rentals');
    await new Promise((r) => setTimeout(r, 1200));
    openRentalModal();
    await new Promise((r) => setTimeout(r, 900));
  });
  await page.screenshot({ path: path.join(OUT, '1-rental-form-customer-dark.png') });
  console.log('saved 1-rental-form-customer-dark.png');

  await page.evaluate(async () => {
    applyTheme('light');
    await new Promise((r) => setTimeout(r, 600));
  });
  await page.screenshot({ path: path.join(OUT, '2-rental-form-customer-light.png') });
  console.log('saved 2-rental-form-customer-light.png');

  // Scroll to the bottom of the form to show the remaining sections + footer.
  await page.evaluate(async () => {
    const body = document.querySelector('#rentalModalOverlay .form-body');
    if (body) body.scrollTop = body.scrollHeight;
    await new Promise((r) => setTimeout(r, 500));
  });
  await page.screenshot({ path: path.join(OUT, '3-rental-form-bottom-light.png') });
  console.log('saved 3-rental-form-bottom-light.png');

  // --- Customer profile ---
  await page.evaluate(async () => {
    applyTheme('dark');
    document.getElementById('rentalModalOverlay')?.remove();
    await new Promise((r) => setTimeout(r, 400));
    await openProfileModal();
    await new Promise((r) => setTimeout(r, 900));
  });
  await page.screenshot({ path: path.join(OUT, '4-profile-customer-dark.png') });
  console.log('saved 4-profile-customer-dark.png');

  await page.evaluate(async () => {
    applyTheme('light');
    await new Promise((r) => setTimeout(r, 600));
  });
  await page.screenshot({ path: path.join(OUT, '5-profile-customer-light.png') });
  console.log('saved 5-profile-customer-light.png');

  await ctx.close();

  // --- Admin: rental form (shows the Pricing section) ---
  const ctx2 = await browser.createBrowserContext();
  const page2 = await ctx2.newPage();
  await page2.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await login(page2, 'admin', '123123');
  await page2.evaluate(async () => {
    applyTheme('dark');
    navigateTo('rentals');
    await new Promise((r) => setTimeout(r, 1200));
    openRentalModal();
    await new Promise((r) => setTimeout(r, 900));
  });
  await page2.screenshot({ path: path.join(OUT, '6-rental-form-admin-dark.png') });
  console.log('saved 6-rental-form-admin-dark.png');

  // --- Rental detail dialog ---
  await page2.evaluate(async () => {
    document.getElementById('rentalModalOverlay')?.remove();
    const first = (state.rentals || [])[0];
    if (first) viewRentalDetail(first.id);
    await new Promise((r) => setTimeout(r, 900));
  });
  await page2.screenshot({ path: path.join(OUT, '7-rental-detail-admin-dark.png') });
  console.log('saved 7-rental-detail-admin-dark.png');

  await ctx2.close();
  await browser.close();
  console.log('\nAll screenshots written to', OUT);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
