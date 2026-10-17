const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = require('./_chrome-path.cjs');
const OUT = path.resolve(__dirname, '..', 'screenshots', 'audit');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(() => localStorage.setItem('millennium-theme', 'dark'));
  await page.goto('http://localhost:3000/app', { waitUntil: 'networkidle0' });
  await page.type('#loginUsername', 'admin');
  await page.type('#loginPassword', '123123');
  await page.click('#loginSubmitBtn');
  await sleep(3200);
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none !important}' });
  await page.evaluate(() => switchTab('tickets'));
  await sleep(1200);
  const id = await page.evaluate(() => state.tickets[0].id);
  await page.evaluate((i) => openTicketDetailModal(i), id);
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'tix-closed.png') });

  const openState = await page.evaluate(() => ({
    panelDisplay: getComputedStyle(document.getElementById('tixConvoPanel')).display,
    polling: !!state.ticketChatPollInterval,
    cta: document.getElementById('tixConvoCta')?.textContent,
  }));
  console.log('collapsed:', JSON.stringify(openState));

  await page.click('#tixConvoBar');
  await sleep(1400);
  await page.screenshot({ path: path.join(OUT, 'tix-open.png') });
  const afterOpen = await page.evaluate(() => ({
    panelDisplay: getComputedStyle(document.getElementById('tixConvoPanel')).display,
    polling: !!state.ticketChatPollInterval,
    cta: document.getElementById('tixConvoCta')?.textContent,
    msgs: document.querySelectorAll('#ticketChatMessages .tix-chat-msg').length,
    overflowX: (() => { const m = document.querySelector('.tix-modal'); return m.scrollWidth - m.clientWidth; })(),
  }));
  console.log('opened:', JSON.stringify(afterOpen));

  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, 'tix-open-light.png') });
  await ctx.close(); await browser.close(); console.log('ok');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
