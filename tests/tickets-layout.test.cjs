/**
 * Tickets view — structural layout guards.
 *
 * Two real bugs lived here and neither had a regression test:
 *   1. `.kanban-board` was `grid-template-columns: repeat(4, 1fr)`, so the
 *      customer's 2-lane board occupied only half the width (the other two
 *      tracks were reserved for lanes that do not exist).
 *   2. The ticket card carried ~10 inline hex/rgba values, and the priority
 *      chip's `background: rgba(255,255,255,.05)` was invisible on a white
 *      lane. Its footer also collided and pushed the buttons onto two lines.
 *
 * These checks are structural (geometry + class usage), so they stay valid when
 * the copy or the fixture data changes.
 */
const puppeteer = require('puppeteer-core');

const CHROME = require('./_chrome-path.cjs');
const BASE = 'http://127.0.0.1:3000';
const APP = BASE + '/app';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}

async function login(page, user) {
  await page.goto(APP, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.type('#loginUsername', user);
  await page.type('#loginPassword', '123123');
  await page.click('#loginSubmitBtn');
  await sleep(3500);
}

/** Wait until the tickets board has actually rendered its lanes. */
async function openTickets(page) {
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('.kanban-column').length);
    if (n > 0) return true;
    await page.evaluate(() => switchTab('tickets'));
    await sleep(300);
  }
  return false;
}

const GEOMETRY = () => {
  const cols = Array.from(document.querySelectorAll('.kanban-column'));
  const cards = Array.from(document.querySelectorAll('.ticket-card'));
  const board = document.querySelector('.kanban-board');
  const br = board ? board.getBoundingClientRect() : null;

  let cardOverflow = 0;
  cards.forEach((c) => {
    const lane = c.closest('.kanban-column');
    if (!lane) return;
    const lr = lane.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    if (cr.right > lr.right + 1) cardOverflow = Math.max(cardOverflow, Math.round(cr.right - lr.right));
  });

  return {
    boardW: br ? Math.round(br.width) : 0,
    lanes: cols.length,
    laneW: cols.map((c) => Math.round(c.getBoundingClientRect().width)),
    laneUsed: cols.reduce((s, c) => s + c.getBoundingClientRect().width, 0),
    cards: cards.length,
    cardH: cards.map((c) => Math.round(c.getBoundingClientRect().height)),
    cardOverflow,
    pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    emptyStates: document.querySelectorAll('.kanban-empty').length,
    // A footer that wrapped would be ~2 lines tall. Compare against the tallest
    // child plus the footer's own padding-top (9px) and top border (1px), rather
    // than a magic number: single line -> footH === 10 + tallest child.
    footH: cards.map((c) => {
      const f = c.querySelector('.ticket-foot');
      return f ? Math.round(f.getBoundingClientRect().height) : 0;
    }),
    footChildMax: cards.map((c) => {
      const f = c.querySelector('.ticket-foot');
      if (!f) return 0;
      return Math.round(Math.max(...Array.from(f.children).map((el) => el.getBoundingClientRect().height), 0));
    }),
    factsAreGrid: cards.map((c) => {
      const f = c.querySelector('.ticket-facts');
      return f ? getComputedStyle(f).display === 'grid' : false;
    }),
    // The old chip was an inline style; the new one is a class on the element.
    priorityViaClass: cards.map((c) => {
      const p = c.querySelector('.ticket-priority, .ticket-status');
      if (!p) return false;
      const inline = p.getAttribute('style') || '';
      return p.classList.length > 0 && !/background\s*:\s*rgba\(255,\s*255,\s*255/.test(inline);
    }),
    accentBars: cards.map((c) => {
      const v = getComputedStyle(c, '::before');
      return v.content !== 'none' && parseFloat(v.width) > 0;
    }),
    cardTabIndex: cards.map((c) => c.getAttribute('tabindex')),
  };
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // ================================================== ADMIN, light, desktop
  console.log('\n=== 1. ADMIN BOARD (light, 1440) ===');
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 950 });
    await page.setCacheEnabled(false);
    await page.evaluateOnNewDocument(() => localStorage.setItem('millennium-theme', 'light'));
    await login(page, 'admin');
    const ok = await openTickets(page);
    check('tickets board rendered', ok);

    const g = await page.evaluate(GEOMETRY);
    console.log(`        board=${g.boardW} lanes=${g.lanes} laneW=${JSON.stringify(g.laneW)}`);
    console.log(`        cards=${g.cards} cardH=${JSON.stringify(g.cardH)} footH=${JSON.stringify(g.footH)}`);

    check('admin board shows the 4 pipeline lanes', g.lanes === 4, `got ${g.lanes}`);
    check('lanes are equal width', new Set(g.laneW).size === 1, JSON.stringify(g.laneW));
    check('lanes fill the board (no dead tracks)', Math.abs(g.laneUsed + 16 * (g.lanes - 1) - g.boardW) <= 4,
      `used=${g.laneUsed} board=${g.boardW}`);
    check('no ticket card overflows its lane', g.cardOverflow === 0, `overflow=${g.cardOverflow}px`);
    check('the tickets page does not overflow the viewport', g.pageOverflow <= 0, `overflow=${g.pageOverflow}px`);
    check('empty lanes show a placeholder block', g.emptyStates >= 1, `empty states=${g.emptyStates}`);
    check('every card renders its facts as a grid', g.factsAreGrid.length > 0 && g.factsAreGrid.every(Boolean));
    check('priority/status chip is class-driven (themed in both modes)',
      g.priorityViaClass.length > 0 && g.priorityViaClass.every(Boolean));
    check('every card has a priority/status edge bar',
      g.accentBars.length > 0 && g.accentBars.every(Boolean));
    check('cards are keyboard-focusable', g.cardTabIndex.every((t) => t === '0'));
    check('the card footer stays on one line',
      g.footH.every((h, i) => h > 0 && h <= g.footChildMax[i] + 12),
      `footH=${JSON.stringify(g.footH)} childMax=${JSON.stringify(g.footChildMax)}`);
    check('cards stay compact (<= 290px tall, incl. a parts row)',
      g.cardH.every((h) => h <= 290), JSON.stringify(g.cardH));

    // Keyboard activation
    const kb = await page.evaluate(async () => {
      const card = document.querySelector('.ticket-card');
      if (!card) return { error: 'no card' };
      card.focus();
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise((r) => setTimeout(r, 800));
      const modal = document.getElementById('ticketDetailModal');
      const open = modal && getComputedStyle(modal).display !== 'none' && !!document.getElementById('ticketDetailBody')?.innerHTML;
      if (modal) modal.style.display = 'none';
      return { open: !!open };
    });
    check('pressing Enter on a focused card opens the detail modal', kb.open === true, JSON.stringify(kb));

    // Sidebar: the Tickets nav entry must not wrap onto three lines.
    const nav = await page.evaluate(() => {
      const item = document.querySelector('.nav-item[data-tab="tickets"]');
      if (!item) return { error: 'missing' };
      const sub = item.querySelector('.nav-sub');
      const badge = item.querySelector('.sidebar-badge');
      return {
        itemH: Math.round(item.getBoundingClientRect().height),
        subH: sub ? Math.round(sub.getBoundingClientRect().height) : 0,
        badge: badge ? badge.textContent.trim() : '',
        badgeTitle: badge ? (badge.getAttribute('title') || '') : '',
      };
    });
    console.log(`        nav: ${JSON.stringify(nav)}`);
    check('the Tickets nav entry stays compact (<= 56px, i.e. 2 lines)',
      nav.itemH > 0 && nav.itemH <= 56, `height=${nav.itemH}`);
    check('the nav sub-label does not wrap', nav.subH > 0 && nav.subH <= 20, `sub height=${nav.subH}`);
    check('the sidebar badge is a bare number', /^\d+$/.test(nav.badge), `badge="${nav.badge}"`);
    check('the badge keeps the wording in its tooltip', /ticket/i.test(nav.badgeTitle), `title="${nav.badgeTitle}"`);

    await ctx.close();
  }

  // ============================================= CUSTOMER, 2-lane board
  console.log('\n=== 2. CUSTOMER BOARD FILLS THE WIDTH (light, 1440) ===');
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 950 });
    await page.setCacheEnabled(false);
    await page.evaluateOnNewDocument(() => localStorage.setItem('millennium-theme', 'light'));
    await login(page, 'orgen');
    const ok = await openTickets(page);
    check('customer tickets board rendered', ok);

    const g = await page.evaluate(GEOMETRY);
    console.log(`        board=${g.boardW} lanes=${g.lanes} laneW=${JSON.stringify(g.laneW)} cards=${g.cards}`);
    check('customer board shows 2 lanes', g.lanes === 2, `got ${g.lanes}`);
    // New: (board - gap) / 2 = ~49% each. Old `repeat(4, 1fr)`: ~24% each
    // (25% of the tracks, the other two reserved for lanes that do not exist).
    // 45% sits cleanly between the two.
    check('the 2 lanes share the full board width (regression: used to be ~24% each)',
      g.laneW.length === 2 && g.laneW.every((w) => w > g.boardW * 0.45),
      `laneW=${JSON.stringify(g.laneW)} board=${g.boardW}`);
    check('customer cards do not overflow their lane', g.cardOverflow === 0, `overflow=${g.cardOverflow}px`);
    check('the customer page does not overflow the viewport', g.pageOverflow <= 0, `overflow=${g.pageOverflow}px`);
    check('customer cards render facts as a grid', g.factsAreGrid.every(Boolean));
    check('customer card footer stays on one line',
      g.footH.every((h, i) => h > 0 && h <= g.footChildMax[i] + 12),
      `footH=${JSON.stringify(g.footH)} childMax=${JSON.stringify(g.footChildMax)}`);

    await ctx.close();
  }

  // ============================================= MOBILE
  console.log('\n=== 3. MOBILE (light, 390) ===');
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.setCacheEnabled(false);
    await page.evaluateOnNewDocument(() => localStorage.setItem('millennium-theme', 'light'));
    await login(page, 'admin');
    const ok = await openTickets(page);
    check('tickets board rendered on a phone', ok);

    const g = await page.evaluate(GEOMETRY);
    console.log(`        board=${g.boardW} laneW=${JSON.stringify(g.laneW)} cardH=${JSON.stringify(g.cardH)}`);
    check('lanes stack one per row on a phone', g.laneW.every((w) => Math.abs(w - g.boardW) <= 2),
      `laneW=${JSON.stringify(g.laneW)} board=${g.boardW}`);
    check('phone: viewport does not expand', g.pageOverflow <= 0, `overflow=${g.pageOverflow}px`);
    check('phone: cards stay inside their lane', g.cardOverflow === 0, `overflow=${g.cardOverflow}px`);
    check('phone: card footer stays on one line',
      g.footH.every((h, i) => h > 0 && h <= g.footChildMax[i] + 12),
      `footH=${JSON.stringify(g.footH)} childMax=${JSON.stringify(g.footChildMax)}`);

    await ctx.close();
  }

  // ============================================= MODAL THEMING
  console.log('\n=== 4. TICKET DETAIL MODAL FOLLOWS THE THEME (light) ===');
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setCacheEnabled(false);
    await page.evaluateOnNewDocument(() => localStorage.setItem('millennium-theme', 'light'));
    await login(page, 'admin');
    await openTickets(page);
    await sleep(400);
    await page.evaluate(() => document.querySelector('.ticket-card')?.click());
    await sleep(900);

    // The conversation is gated behind "Open chat" now, so the panel — and its
    // message list — only exists once the gate is opened. Checking colours
    // before that would measure a display:none container.
    const gate = await page.evaluate(() => {
      const panel = document.getElementById('tixConvoPanel');
      const bar = document.getElementById('tixConvoBar');
      return {
        hasGate: !!bar,
        panelHidden: panel ? getComputedStyle(panel).display === 'none' : null,
        label: bar ? bar.textContent.trim() : '',
      };
    });
    check('the ticket dialog gates its chat behind an "Open chat" control', gate.hasGate && gate.panelHidden);
    check('the gate is labelled', /Open chat/i.test(gate.label), gate.label);

    await page.click('#tixConvoBar');
    await sleep(1800);

    const m = await page.evaluate(() => {
      const chat = document.getElementById('ticketChatMessages');
      if (!chat) return { error: 'no chat container' };
      const lum = (c) => {
        const m2 = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
        if (!m2) return -1;
        return 0.2126 * +m2[1] + 0.7152 * +m2[2] + 0.0722 * +m2[3];
      };
      const bubbles = Array.from(chat.querySelectorAll('.tix-chat-bubble'));
      return {
        chatBg: getComputedStyle(chat).backgroundColor,
        chatLum: lum(getComputedStyle(chat).backgroundColor),
        bubbleText: bubbles.length ? getComputedStyle(bubbles[bubbles.length - 1]).color : '',
        bubbleTextLum: bubbles.length ? lum(getComputedStyle(bubbles[bubbles.length - 1]).color) : -1,
        bubbles: bubbles.length,
        open: document.getElementById('tixConvo')?.classList.contains('is-open'),
      };
    });
    console.log(`        ${JSON.stringify(m)}`);
    check('opening the gate reveals the conversation', m.open === true);
    check('the chat panel is light in light mode (regression: was hardcoded #070c1d)',
      m.chatLum > 150, `chat bg=${m.chatBg} luminance=${m.chatLum}`);
    check('message text is dark in light mode (regression: was #f1f5f9, white-on-white)',
      m.bubbles > 0 && m.bubbleTextLum >= 0 && m.bubbleTextLum < 120,
      `bubbles=${m.bubbles} text=${m.bubbleText} luminance=${m.bubbleTextLum}`);

    await ctx.close();
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
