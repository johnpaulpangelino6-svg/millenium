// Throwaway capture helper: screenshots the five areas being reworked so the
// before/after comparison is visual rather than guessed.
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = require('./_chrome-path.cjs');
const BASE = 'http://localhost:3000';
const APP = BASE + '/app';
const OUT = path.resolve(__dirname, '..', 'screenshots', 'audit');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const fs = require('fs');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(() => localStorage.setItem('millennium-theme', 'dark'));

  await page.goto(APP, { waitUntil: 'networkidle0' });
  await page.type('#loginUsername', 'admin');
  await page.type('#loginPassword', '123123');
  await page.click('#loginSubmitBtn');
  await sleep(3200);
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none !important}' });

  // 1. Sidebar brand
  const brand = await page.evaluate(() => {
    const r = document.querySelector('.sidebar-brand').getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  await page.screenshot({
    path: path.join(OUT, 'brand-dark.png'),
    clip: { x: 0, y: 0, width: 270, height: 130 },
  });

  // 2. Inventory
  await page.evaluate(() => switchTab('inventory'));
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, 'inventory-dark.png') });

  // 3. Ticket detail modal
  await page.evaluate(() => switchTab('tickets'));
  await sleep(1200);
  const ticketId = await page.evaluate(() => (state.tickets || [])[0]?.id);
  await page.evaluate((id) => openTicketDetailModal(id), ticketId);
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, 'ticket-detail-dark.png') });

  // 4. Barcode modal
  await page.evaluate(() => closeTicketDetailModal());
  await sleep(400);
  const warrantyId = await page.evaluate(() => (state.warranties || [])[0]?.id);
  await page.evaluate((id) => openWarrantyBarcodeModal(id), warrantyId);
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, 'barcode-dark.png') });

  const barcodeBox = await page.evaluate(() => {
    const svg = document.getElementById('warrantyBarcode');
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const host = svg.parentElement.getBoundingClientRect();
    return { svgW: Math.round(r.width), hostW: Math.round(host.width), overflow: Math.round(r.right - host.right) };
  });
  console.log('barcode box:', JSON.stringify(barcodeBox));

  // 5. Light mode versions
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'barcode-light.png') });
  await page.evaluate(() => closeWarrantyBarcodeModal());
  await sleep(300);
  await page.evaluate((id) => openTicketDetailModal(id), ticketId);
  await sleep(1000);
  await page.screenshot({ path: path.join(OUT, 'ticket-detail-light.png') });
  await page.evaluate(() => closeTicketDetailModal());
  await page.evaluate(() => switchTab('inventory'));
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, 'inventory-light.png') });
  await page.screenshot({ path: path.join(OUT, 'brand-light.png'), clip: { x: 0, y: 0, width: 270, height: 130 } });

  await ctx.close();
  await browser.close();
  console.log('captured ->', OUT);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
