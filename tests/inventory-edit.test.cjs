/**
 * Inventory card actions: restock-by-one and the inline unit-cost editor.
 *
 * Two behaviours are load-bearing here and both are easy to get subtly wrong:
 *
 *  1. Restock must add exactly ONE unit per click. It used to add five, and it
 *     did so by sending an absolute quantity the client computed from its own
 *     copy of the row. That is not just "the wrong amount" — it loses increments
 *     under concurrency and can push stock *downwards* when the card is stale.
 *     The server now increments in SQL, so this suite checks the count both
 *     sequentially and with two clicks fired back-to-back.
 *
 *  2. The price editor must be an admin-only affordance that saves, cancels on
 *     Escape, and refuses nonsense. It must never leave the card showing a value
 *     the database does not have.
 *
 * The suite snapshots the part it touches and restores it at the end, so it can
 * be run repeatedly against the dev database without drifting.
 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = require('./_chrome-path.cjs');
const BASE = 'http://localhost:3000';
const APP = BASE + '/app';
const PART = 'PART-001';

let pass = 0, fail = 0;
function check(name, ok, detail) {
  const d = detail === undefined ? ''
    : (typeof detail === 'object' ? JSON.stringify(detail) : String(detail));
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${d ? '  ->  ' + d : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const card = (sel) => `.inv-card[data-part-id="${PART}"] ${sel}`;

async function login(page, user, pw) {
  await page.goto(APP, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1600);
  await page.type('#loginUsername', user);
  await page.type('#loginPassword', pw);
  await page.click('#loginSubmitBtn');
  await sleep(3200);
}

/** Read the live row from the API using the page's own authed fetch. */
const readPart = (page) => page.evaluate(async (id) => {
  const res = await fetch(`/api/inventory`);
  const body = await res.json();
  return (body.data || []).find((p) => p.id === id) || null;
}, PART);

/** Put the row back the way we found it. */
const restorePart = (page, snapshot) => page.evaluate(async ({ id, stock, cost }) => {
  await fetch(`/api/inventory/${id}/stock`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stockQuantity: stock }),
  });
  await fetch(`/api/inventory/${id}/price`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unitCost: cost }),
  });
}, { id: PART, stock: snapshot.stockQuantity, cost: snapshot.unitCost });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setCacheEnabled(false);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message)));

  await login(page, 'admin', '123123');
  await page.evaluate(() => switchTab('inventory'));
  await sleep(1600);

  const snapshot = await readPart(page);
  check('the fixture part exists in the API', !!snapshot, snapshot && snapshot.partCode);
  if (!snapshot) { await browser.close(); process.exit(1); }

  // ================================================ 1. RESTOCK ADDS ONE
  console.log('\n=== 1. RESTOCK ADDS EXACTLY ONE UNIT ===');
  const startStock = snapshot.stockQuantity;

  const btn = await page.evaluate((sel) => {
    const b = document.querySelector(sel);
    if (!b) return null;
    return { text: b.textContent.trim(), title: b.getAttribute('title') };
  }, card('.inv-restock-btn'));
  check('the card carries a Restock button', !!btn, btn);
  check('the button states the amount it adds (+1)', /\+1/.test(btn ? btn.text : ''), btn && btn.text);

  await page.click(card('.inv-restock-btn'));
  await sleep(1400);

  let api = await readPart(page);
  check('one click adds exactly 1 to the database',
    api.stockQuantity === startStock + 1, `${startStock} -> ${api.stockQuantity}`);

  const domAfter = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? Number(el.textContent.trim()) : null;
  }, card('.inv-stock-number'));
  check('the card shows the new number without a reload',
    domAfter === startStock + 1, `${startStock + 1} expected, got ${domAfter}`);

  // Two taps in quick succession must both land — the old absolute-write
  // approach would have collapsed them into a single increment.
  await page.click(card('.inv-restock-btn'));
  await page.click(card('.inv-restock-btn')).catch(() => {});
  await sleep(1800);
  api = await readPart(page);
  check('two rapid clicks add 2 (no lost increment)',
    api.stockQuantity === startStock + 3, `${startStock + 3} expected, got ${api.stockQuantity}`);

  // ================================================ 2. PRICE EDITOR
  console.log('\n=== 2. INLINE UNIT-COST EDITOR ===');
  const priceBtn = await page.evaluate((sel) => {
    const b = document.querySelector(sel);
    return b ? { text: b.textContent.trim(), label: b.getAttribute('aria-label') } : null;
  }, card('.inv-price-btn'));
  check('the unit cost is an editable control', !!priceBtn, priceBtn);
  // The label is what a screen reader reads out; "price" and "unit cost" are
  // both acceptable wording for it, so match either.
  check('it is labelled for screen readers',
    !!(priceBtn && /(edit|change).{0,12}(unit cost|price)/i.test(priceBtn.label || '')), priceBtn && priceBtn.label);

  await page.click(card('.inv-price-btn'));
  await sleep(500);
  const editor = await page.evaluate((sel) => {
    const input = document.querySelector(sel);
    if (!input) return null;
    return {
      value: input.value,
      focused: document.activeElement === input,
      hasSave: !!document.querySelector('.inv-price-save'),
      hasCancel: !!document.querySelector('.inv-price-cancel'),
    };
  }, card('.inv-price-input'));
  check('clicking the price opens a focused input', !!editor && editor.focused === true, editor);
  check('the input is seeded with the current price',
    !!editor && Number(editor.value) === Number(snapshot.unitCost),
    editor && `${editor.value} vs ${snapshot.unitCost}`);
  check('the editor offers save and cancel', !!(editor && editor.hasSave && editor.hasCancel), editor);

  // Escape must abandon the edit and leave the stored value untouched.
  await page.keyboard.press('Escape');
  await sleep(500);
  const afterEsc = await page.evaluate((sel) => ({
    editorGone: !document.querySelector(sel),
    shown: (document.querySelector('.inv-price-host') || {}).textContent,
  }), card('.inv-price-input'));
  check('Escape closes the editor', afterEsc.editorGone === true, afterEsc);
  api = await readPart(page);
  check('Escape does not change the stored price',
    Number(api.unitCost) === Number(snapshot.unitCost), api.unitCost);

  // A real edit, committed with Enter.
  const NEW_PRICE = 13500;
  await page.click(card('.inv-price-btn'));
  await sleep(400);
  await page.click(card('.inv-price-input'));
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.type(card('.inv-price-input'), String(NEW_PRICE));
  await page.keyboard.press('Enter');
  await sleep(1500);

  api = await readPart(page);
  check('Enter saves the new price to the database',
    Number(api.unitCost) === NEW_PRICE, `expected ${NEW_PRICE}, got ${api.unitCost}`);

  const shownPrice = await page.evaluate(() => {
    const el = document.querySelector('.inv-card[data-part-id="PART-001"] .inv-price-host');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  check('the card repaints with the new price',
    !!shownPrice && shownPrice.includes('13,500'), shownPrice);

  const editorClosed = await page.evaluate(() => !document.querySelector('.inv-price-input'));
  check('the editor closes after saving', editorClosed === true);

  // Reject nonsense without losing the stored value.
  await page.click(card('.inv-price-btn'));
  await sleep(400);
  await page.click(card('.inv-price-input'));
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.type(card('.inv-price-input'), '-5');
  await page.keyboard.press('Enter');
  await sleep(1200);
  api = await readPart(page);
  check('a negative price is refused and the stored value survives',
    Number(api.unitCost) === NEW_PRICE, api.unitCost);
  await page.keyboard.press('Escape');
  await sleep(400);

  // ================================================ 3. PERSISTENCE
  console.log('\n=== 3. THE CHANGES SURVIVE A RELOAD ===');
  // The signed-in app polls in the background, so `networkidle0` can legitimately
  // never settle (there is always a request either in flight or about to be) —
  // it intermittently timed out here. Wait for the document and then give the
  // session restore + first render a fixed budget.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3200);
  await page.evaluate(() => switchTab('inventory'));
  await sleep(1600);
  const afterReload = await page.evaluate(() => {
    const c = document.querySelector('.inv-card[data-part-id="PART-001"]');
    return c ? {
      stock: Number(c.querySelector('.inv-stock-number').textContent.trim()),
      price: c.querySelector('.inv-price-host').textContent.replace(/\s+/g, ' ').trim(),
    } : null;
  });
  check('stock persisted across the reload',
    !!afterReload && afterReload.stock === startStock + 3, afterReload);
  check('price persisted across the reload',
    !!afterReload && afterReload.price.includes('13,500'), afterReload);

  // ================================================ 4. NON-ADMIN
  // Customers are not granted the inventory tab at all (ROLE_ACCESS), so the
  // UI check is really "they never get there". The boundary that actually
  // matters is the API: hiding a button is not a permission.
  console.log('\n=== 4. A CUSTOMER CANNOT RESTOCK OR REPRICE ===');
  {
    const cctx = await browser.createBrowserContext();
    const cp = await cctx.newPage();
    await cp.setViewport({ width: 1440, height: 900 });
    await cp.setCacheEnabled(false);
    await login(cp, 'orgen', '123123');
    await cp.evaluate(() => switchTab('inventory'));
    await sleep(1800);
    const cust = await cp.evaluate(() => ({
      tab: state.currentTab,
      cards: document.querySelectorAll('.inv-card').length,
      restock: document.querySelectorAll('.inv-restock-btn').length,
      priceBtn: document.querySelectorAll('.inv-price-btn').length,
      deleteBtn: document.querySelectorAll('.inv-delete-btn').length,
    }));
    check('a customer is bounced off the inventory view',
      cust.tab !== 'inventory' && cust.cards === 0, cust);
    check('no Restock buttons are rendered for a customer', cust.restock === 0, cust);
    check('the price is not editable for a customer', cust.priceBtn === 0, cust);
    check('no Delete buttons are rendered for a customer', cust.deleteBtn === 0, cust);

    const denied = await cp.evaluate(async (id) => {
      const post = await fetch(`/api/inventory/${id}/restock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 1 }),
      });
      const patch = await fetch(`/api/inventory/${id}/price`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitCost: 1 }),
      });
      return { restock: post.status, price: patch.status };
    }, PART);
    check('the restock API refuses a customer (403)', denied.restock === 403, denied);
    check('the price API refuses a customer (403)', denied.price === 403, denied);

    await cctx.close();
  }

  check('no page errors during the session', errs.length === 0, errs.slice(0, 3).join(' | '));

  // ================================================ 5. RESTORE
  console.log('\n=== 5. FIXTURE RESTORED ===');
  await restorePart(page, snapshot);
  const restored = await readPart(page);
  check('stock restored to its starting value',
    restored.stockQuantity === snapshot.stockQuantity,
    `${snapshot.stockQuantity} expected, got ${restored.stockQuantity}`);
  check('price restored to its starting value',
    Number(restored.unitCost) === Number(snapshot.unitCost),
    `${snapshot.unitCost} expected, got ${restored.unitCost}`);

  await ctx.close();
  await browser.close();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
