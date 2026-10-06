const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP = 'http://127.0.0.1:3000/app';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page, user) {
  await page.goto(APP, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('#loginUsername', { timeout: 30000 });
  await page.type('#loginUsername', user);
  await page.type('#loginPassword', '123123');
  await page.click('#loginSubmitBtn');
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => !!document.querySelector('.dash-v2-container'))) break;
    await sleep(400);
  }
  await sleep(600);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await login(page, 'orgen');

  console.log('--- desktop ---');
  console.log(await page.evaluate(() => ({
    twoCol: !!document.querySelector('.dash-2col'),
    twoColCount: document.querySelectorAll('.dash-2col').length,
    tab: state.currentTab,
    dash: (document.querySelector('[data-dash]') || {}).getAttribute
      ? document.querySelector('[data-dash]').getAttribute('data-dash') : null,
    mainLen: document.getElementById('mainContent').innerHTML.length,
  })));

  console.log('--- after resize to 390 ---');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await sleep(500);
  console.log(await page.evaluate(() => ({
    twoCol: !!document.querySelector('.dash-2col'),
    twoColCount: document.querySelectorAll('.dash-2col').length,
    tab: state.currentTab,
    dash: (document.querySelector('[data-dash]') || {}).getAttribute
      ? document.querySelector('[data-dash]').getAttribute('data-dash') : null,
    mainLen: document.getElementById('mainContent').innerHTML.length,
    firstChild: document.getElementById('mainContent').firstElementChild
      ? document.getElementById('mainContent').firstElementChild.className : null,
  })));

  console.log('--- after renderApp() at 390 ---');
  await page.evaluate(() => renderApp());
  await sleep(500);
  console.log(await page.evaluate(() => {
    const tc = document.querySelector('.dash-2col');
    return {
      twoCol: !!tc,
      twoColCount: document.querySelectorAll('.dash-2col').length,
      cols: tc ? getComputedStyle(tc).gridTemplateColumns : '(no element)',
      rows: document.querySelectorAll('.rec-row').length,
      dash: (document.querySelector('[data-dash]') || {}).getAttribute
        ? document.querySelector('[data-dash]').getAttribute('data-dash') : null,
      mainLen: document.getElementById('mainContent').innerHTML.length,
    };
  }));

  console.log('--- theme tokens ---');
  await page.evaluate(() => applyTheme('dark'));
  await sleep(200);
  console.log(await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      darkTextMuted: cs.getPropertyValue('--text-muted').trim(),
      darkTextSecondary: cs.getPropertyValue('--text-secondary').trim(),
      darkTextPrimary: cs.getPropertyValue('--text-primary').trim(),
      rowMeta: getComputedStyle(document.querySelector('.rec-row-meta')).color,
      sectionSub: getComputedStyle(document.querySelector('.rec-section-sub')).color,
      sectionBg: getComputedStyle(document.querySelector('.rec-section')).backgroundColor,
    };
  }));
  await page.evaluate(() => applyTheme('light'));
  await sleep(200);
  console.log(await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      lightTextMuted: cs.getPropertyValue('--text-muted').trim(),
      lightTextSecondary: cs.getPropertyValue('--text-secondary').trim(),
      rowMeta: getComputedStyle(document.querySelector('.rec-row-meta')).color,
    };
  }));

  await browser.close();
})();
