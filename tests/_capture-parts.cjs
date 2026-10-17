const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const CHROME = require('./_chrome-path.cjs');
const OUT = path.resolve(__dirname, '..', 'screenshots', 'audit');
const DIR = path.resolve(__dirname, '..', 'public', 'images', 'parts');
const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(DIR).filter(f => f.endsWith('.svg'));
// Inline the SVG source: file:// images are blocked in headless, and a served
// page would need the dev server to be up for a purely visual check.
const cells = names.map(n => {
  let src = fs.readFileSync(path.join(DIR, n), 'utf8');
  src = src.replace(/^<\?xml[^>]*>/, '').replace(/<svg([^>]*)width="[^"]*"([^>]*)height="[^"]*"/, '<svg$1$2');
  return `<div style="background:#111a2e;border-radius:10px;padding:6px;text-align:center">
    <div style="width:100%">${src.replace('<svg', '<svg style="width:100%;height:auto;display:block"')}</div>
    <div style="color:#8fa3bf;font:600 11px sans-serif;padding-top:4px">${n}</div></div>`;
}).join('');
const html = `<!doctype html><html><body style="margin:0;background:#0d1424;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px">${cells}</body></html>`;
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: path.join(OUT, 'parts-preview.png'), fullPage: true });
  await browser.close();
  console.log('ok', names.join(', '));
})().catch(e => { console.error(e); process.exit(1); });
