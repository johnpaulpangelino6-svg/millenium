/**
 * Rental form layout + customer profile verification.
 *
 * Covers the two reported issues:
 *   1. The rental booking form layout (it referenced --surface /
 *      --surface-elevated, which do not exist, so it fell back to hard-coded
 *      dark colours that broke in the light theme).
 *   2. The customer profile: view + edit.
 */
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3000';

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}

async function login(page, username, password) {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));
  await page.type('#loginUsername', username);
  await page.type('#loginPassword', password);
  await page.click('#loginSubmitBtn');
  await new Promise((r) => setTimeout(r, 6000));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // =====================================================================
  // 1. RENTAL FORM LAYOUT
  // =====================================================================
  console.log('\n=== 1. RENTAL FORM LAYOUT (customer) ===');
  const ctx1 = await browser.createBrowserContext();
  const page = await ctx1.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 'orgen', '123123');

  const layout = await page.evaluate(async () => {
    openRentalModal();
    await new Promise((r) => setTimeout(r, 700));

    const overlay = document.getElementById('rentalModalOverlay');
    if (!overlay) return { error: 'modal did not open' };

    const content = overlay.querySelector('.modal-content');
    const body = overlay.querySelector('.form-body');
    const inputs = Array.from(overlay.querySelectorAll('.form-input, .form-select, .form-textarea'));
    const first = inputs[0];

    // Resolve the token colour the modal SHOULD be using.
    const cs = getComputedStyle(document.body);
    const surfaceToken = cs.getPropertyValue('--bg-surface').trim();

    return {
      hasBackdropClass: overlay.classList.contains('modal-backdrop'),
      hasContent: !!content,
      contentMaxHeight: content ? getComputedStyle(content).maxHeight : null,
      hasHeader: !!overlay.querySelector('.modal-header'),
      hasFooter: !!overlay.querySelector('.modal-footer'),
      hasScrollBody: !!body,
      sectionCount: overlay.querySelectorAll('.form-section').length,
      sectionTitles: Array.from(overlay.querySelectorAll('.form-section-title')).map((e) => e.textContent.trim()),
      inputCount: inputs.length,
      usesFormInputClass: !!first,
      firstInputBg: first ? getComputedStyle(first).backgroundColor : null,
      firstInputColor: first ? getComputedStyle(first).color : null,
      // Overflow checks
      bodyOverflowX: body ? body.scrollWidth - body.clientWidth : null,
      contentOverflowX: content ? content.scrollWidth - content.clientWidth : null,
      // Does any input stick out of the modal?
      widestInputOverflow: inputs.reduce((max, el) => {
        const r = el.getBoundingClientRect();
        const cr = content.getBoundingClientRect();
        return Math.max(max, Math.round(r.right - cr.right));
      }, 0),
      surfaceToken,
      inlineStyleAttrs: overlay.querySelectorAll('[style*="--surface,"]').length,
    };
  });

  console.log(JSON.stringify(layout, null, 2));

  check('modal opens', !layout.error, layout.error);
  check('uses .modal-backdrop (design system)', layout.hasBackdropClass === true);
  check('has a header', layout.hasHeader === true);
  check('has a footer', layout.hasFooter === true);
  check('field area is the scroll region', layout.hasScrollBody === true);
  check('form is sectioned (4+ sections)', layout.sectionCount >= 4, `got ${layout.sectionCount}`);
  check('no leftover inline var(--surface,...) usages', layout.inlineStyleAttrs === 0);
  check('no horizontal overflow in the field area', layout.bodyOverflowX <= 0, `overflow ${layout.bodyOverflowX}px`);
  check('no input overflows the modal box', layout.widestInputOverflow <= 0, `${layout.widestInputOverflow}px past edge`);
  check('inputs use the theme surface colour, not #15151f',
    layout.firstInputBg !== 'rgb(21, 21, 31)', `bg=${layout.firstInputBg}`);
  check('--bg-surface token resolves', !!layout.surfaceToken, `got "${layout.surfaceToken}"`);

  // Same checks in the LIGHT theme, where the old modal was unreadable.
  // The app applies its theme to <html> via applyTheme(), not to <body>.
  console.log('\n=== 2. RENTAL FORM IN LIGHT THEME ===');
  const light = await page.evaluate(async () => {
    applyTheme('light');
    document.getElementById('rentalModalOverlay')?.remove();
    await new Promise((r) => setTimeout(r, 250));
    openRentalModal();
    await new Promise((r) => setTimeout(r, 700));

    const overlay = document.getElementById('rentalModalOverlay');
    // An enabled field is the common case a user actually types into.
    const input = overlay.querySelector('.form-input:not(:disabled), .form-select:not(:disabled)');
    const content = overlay.querySelector('.modal-content');
    const bg = getComputedStyle(input).backgroundColor;
    const fg = getComputedStyle(input).color;

    const lum = (c) => {
      const m = c.match(/\d+/g);
      if (!m) return null;
      const [r, g, b] = m.slice(0, 3).map(Number);
      return 0.299 * r + 0.587 * g + 0.114 * b;
    };

    const title = overlay.querySelector('.modal-title');
    return {
      themeAttr: document.documentElement.getAttribute('data-theme'),
      inputBg: bg,
      inputColor: fg,
      bgLum: lum(bg),
      fgLum: lum(fg),
      contentBg: getComputedStyle(content).backgroundColor,
      bodyTextColor: getComputedStyle(overlay.querySelector('.form-label')).color,
      titleColor: getComputedStyle(title).color,
      titleLum: lum(getComputedStyle(title).color),
      headerBg: getComputedStyle(overlay.querySelector('.modal-header')).backgroundColor,
    };
  });
  console.log(JSON.stringify(light, null, 2));

  check('light theme applied', light.themeAttr === null, `data-theme=${light.themeAttr}`);
  check('input background is LIGHT in light theme', light.bgLum !== null && light.bgLum > 200,
    `luminance ${light.bgLum} (bg=${light.inputBg})`);
  check('input text is DARK in light theme', light.fgLum !== null && light.fgLum < 90,
    `luminance ${light.fgLum} (color=${light.inputColor})`);
  check('input background and text contrast is readable',
    Math.abs(light.bgLum - light.fgLum) > 120,
    `bg=${light.bgLum} fg=${light.fgLum}`);
  check('the modal body is light, not a hard-coded dark surface',
    light.contentBg !== 'rgb(30, 30, 46)' && light.contentBg !== 'rgb(21, 21, 31)',
    `contentBg=${light.contentBg}`);
  check('the modal title is dark and readable on the light header',
    light.titleLum !== null && light.titleLum < 120,
    `title luminance ${light.titleLum} (color=${light.titleColor}, headerBg=${light.headerBg})`);

  await page.evaluate(() => {
    applyTheme('dark');
    document.getElementById('rentalModalOverlay')?.remove();
  });

  // =====================================================================
  // 3. PROFILE — view and edit
  // =====================================================================
  console.log('\n=== 3. CUSTOMER PROFILE — VIEW ===');
  const profile = await page.evaluate(async () => {
    await openProfileModal();
    await new Promise((r) => setTimeout(r, 800));
    const overlay = document.getElementById('profileModalOverlay');
    if (!overlay) return { error: 'profile modal did not open' };
    return {
      hasIdentity: !!overlay.querySelector('.profile-identity'),
      fields: Array.from(overlay.querySelectorAll('.profile-field')).map((f) => ({
        label: f.querySelector('.profile-field-label')?.textContent.trim(),
        value: f.querySelector('.profile-field-value')?.textContent.trim(),
      })),
      hasFullName: !!overlay.querySelector('#profileFullName'),
      hasEmail: !!overlay.querySelector('#profileEmail'),
      hasLocation: !!overlay.querySelector('#profileLocation'),
      hasCurrentPw: !!overlay.querySelector('#profileCurrentPassword'),
      hasNewPw: !!overlay.querySelector('#profileNewPassword'),
      hasConfirmPw: !!overlay.querySelector('#profileConfirmPassword'),
      sections: Array.from(overlay.querySelectorAll('.form-section-title')).map((e) => e.textContent.trim()),
    };
  });
  console.log(JSON.stringify(profile, null, 2));

  check('profile dialog opens from the chip', !profile.error, profile.error);
  check('shows an identity header', profile.hasIdentity === true);
  check('lists account fields', (profile.fields || []).length >= 4, `got ${(profile.fields || []).length}`);
  check('has editable full name field', profile.hasFullName === true);
  check('has editable email field', profile.hasEmail === true);
  check('has editable location field', profile.hasLocation === true);
  check('has change-password fields', profile.hasCurrentPw && profile.hasNewPw && profile.hasConfirmPw);

  // --- Edit: change the full name, save, then restore -------------------
  console.log('\n=== 4. PROFILE — SAVE AN EDIT ===');
  const before = await page.evaluate(async () => {
    const r = await fetch('/api/auth/me');
    const j = await r.json();
    return { fullName: j.user.fullName, email: j.user.email, location: j.user.location, id: j.user.id };
  });
  console.log(`        original: ${JSON.stringify(before)}`);

  const newName = 'QCU Test Contact';
  const saved = await page.evaluate(async (name) => {
    document.querySelector('#profileFullName').value = name;
    document.getElementById('profileForm').requestSubmit();
    await new Promise((r) => setTimeout(r, 3000));
    const chipName = document.getElementById('authUserName')?.textContent.trim();
    const stillOpen = !!document.getElementById('profileModalOverlay');
    const r = await fetch('/api/auth/me');
    const j = await r.json();
    return { chipName, stillOpen, serverName: j.user.fullName, stateName: state.currentUser.fullName };
  }, newName);
  console.log(`        after save: ${JSON.stringify(saved)}`);

  check('save closes the dialog', saved.stillOpen === false);
  check('server persisted the new name', saved.serverName === newName, `got "${saved.serverName}"`);
  check('sidebar chip reflects the new name', saved.chipName === newName, `got "${saved.chipName}"`);
  check('client session reflects the new name', saved.stateName === newName);

  // Restore the original value so the database is left exactly as found.
  const restored = await page.evaluate(async (orig) => {
    const r = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: orig }),
    });
    const j = await r.json();
    return { ok: j.success, fullName: j.data && j.data.fullName };
  }, before.fullName);
  check('original name restored', restored.fullName === before.fullName,
    `expected "${before.fullName}", got "${restored.fullName}"`);

  // =====================================================================
  // 5. PROFILE — security constraints
  // =====================================================================
  console.log('\n=== 5. PROFILE — SECURITY CONSTRAINTS ===');
  const sec = await page.evaluate(async (orig) => {
    const out = {};

    // a) role / organization must NOT be self-editable
    const r1 = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: orig, role: 'admin', organization: 'HACKED ORG' }),
    });
    const j1 = await r1.json();
    out.roleAttempt = { status: r1.status, role: j1.data && j1.data.role, org: j1.data && j1.data.organization };

    const me = await (await fetch('/api/auth/me')).json();
    out.liveRole = me.user.role;
    out.liveOrg = me.user.organization;

    // b) wrong current password must be rejected
    const r2 = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'definitely-wrong', newPassword: 'newpass123' }),
    });
    out.wrongPassword = { status: r2.status };

    // c) invalid email must be rejected
    const r3 = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    out.badEmail = { status: r3.status };

    // d) short password must be rejected
    const r4 = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: '123123', newPassword: 'abc' }),
    });
    out.shortPassword = { status: r4.status };

    // e) no-token case is checked from Node below (the page's fetch wrapper
    //    would attach the token automatically, making it a false test here).

    return out;
  }, before.fullName);

  console.log(JSON.stringify(sec, null, 2));

  check('role cannot be self-escalated to admin', sec.liveRole === 'customer', `role is now "${sec.liveRole}"`);
  check('organization cannot be self-changed', sec.liveOrg !== 'HACKED ORG', `org is "${sec.liveOrg}"`);
  check('wrong current password is rejected (403)', sec.wrongPassword.status === 403, `got ${sec.wrongPassword.status}`);
  check('invalid email is rejected (400)', sec.badEmail.status === 400, `got ${sec.badEmail.status}`);
  check('too-short new password is rejected (400)', sec.shortPassword.status === 400, `got ${sec.shortPassword.status}`);

  // Unauthenticated PATCH /auth/me, issued from Node so no token is attached.
  const anonPatch = await fetch(`${BASE}/api/auth/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Hacker' }),
  });
  check('unauthenticated PATCH /auth/me is rejected (401)', anonPatch.status === 401, `got ${anonPatch.status}`);

  // =====================================================================
  // 6. ADMIN USER ROUTES now require auth
  // =====================================================================
  console.log('\n=== 6. ADMIN USER ROUTES PROTECTED ===');
  const admin = await page.evaluate(async () => {
    // Customer token must NOT be able to create/patch/delete users.
    const post = await fetch('/api/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'x', email: 'x@x.com', password: 'x', fullName: 'X', role: 'admin' }),
    });
    const patch = await fetch('/api/auth/users/USR-1789630177571', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    });
    const del = await fetch('/api/auth/users/USR-1789630177571', { method: 'DELETE' });
    return { post: post.status, patch: patch.status, del: del.status };
  });
  console.log(JSON.stringify(admin));
  check('customer cannot create users (403)', admin.post === 403, `got ${admin.post}`);
  check('customer cannot PATCH users (403)', admin.patch === 403, `got ${admin.patch}`);
  check('customer cannot DELETE users (403)', admin.del === 403, `got ${admin.del}`);

  const realErrors = errors.filter((e) => !/favicon|manifest|icon-192|Download error/i.test(e));
  check('no page errors during the whole run', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  await ctx1.close();
  await browser.close();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
