/**
 * Rental privacy verification.
 *
 * Part 1 — live HTTP tests against the running server (no writes).
 * Part 2 — synthetic multi-account test of the scoping predicates, extracted
 *          from the real source, to prove cross-account isolation.
 *
 * The rule under test: a booking is visible to the ACCOUNT that created it and
 * to admins — never to another customer, even one in the same organization.
 */
const BASE = 'http://127.0.0.1:3000';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}

async function login(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const j = await r.json();
  // `user` is defaulted to {} so a failed login shows up as a run of failed
  // assertions naming the missing account, instead of a TypeError halfway
  // through the suite that hides every check after it.
  if (!j.user) j.user = {};
  return { status: r.status, body: j, token: j.token, user: j.user };
}

function authGet(path, token) {
  return fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

(async () => {
  // ---------------------------------------------------------------- tokens
  const admin = await login('admin', '123123');
  const customer = await login('orgen', '123123');
  // A SECOND customer account in the SAME organization. This is the account
  // that used to be able to read `orgen`'s bookings.
  const customer2 = await login('johnpaulpangelino6@gmail.com', '123123');
  const tech = await login('hello', '123123');

  console.log('\n=== LOGIN: token issued? ===');
  check('admin login returns a token', !!admin.token, `status=${admin.status}`);
  check('customer login returns a token', !!customer.token, `status=${customer.status}`);
  check('second (same-org) customer login returns a token', !!customer2.token, `status=${customer2.status}`);
  check('technician login returns a token', !!tech.token, `status=${tech.status}`);
  check('token has 3 parts (v1.payload.sig)',
    admin.token && admin.token.split('.').length === 3);
  check('wrong password is rejected', (await login('admin', 'wrong-password')).status === 401);

  // ------------------------------------------- expired token (real secret)
  const { signToken } = await import(
    'file:///' + path.resolve('dist/auth/token.js').replace(/\\/g, '/')
  );
  const expiredToken = signToken(admin.body.user.id, -60);

  // ------------------------------------------------------- 1. authentication
  console.log('\n=== 1. AUTHENTICATION IS REQUIRED ===');
  for (const [label, tok] of [
    ['no token', null],
    ['empty bearer', ''],
    ['malformed token', 'garbage'],
    ['valid structure, bogus signature', 'v1.eyJ1IjoiWFhYIiwiaWF0IjoxLCJleHAiOjk5OTk5OTk5OTl9.AAAA'],
    ['tampered signature', admin.token.slice(0, -4) + 'AAAA'],
    ['expired token', expiredToken],
  ]) {
    const res = await authGet('/api/rentals', tok);
    check(`GET /api/rentals with ${label} -> 401`, res.status === 401, `got ${res.status}`);
  }

  // ------------------------------------------------------- 2. role access
  console.log('\n=== 2. ROLE ACCESS ===');
  const adminRes = await authGet('/api/rentals', admin.token);
  const adminJson = await adminRes.json();
  const custRes = await authGet('/api/rentals', customer.token);
  const custJson = await custRes.json();
  const cust2Res = await authGet('/api/rentals', customer2.token);
  const cust2Json = await cust2Res.json();
  const techRes = await authGet('/api/rentals', tech.token);

  check('admin GET /rentals -> 200', adminRes.status === 200, `got ${adminRes.status}`);
  check('customer GET /rentals -> 200', custRes.status === 200, `got ${custRes.status}`);
  check('second customer GET /rentals -> 200', cust2Res.status === 200, `got ${cust2Res.status}`);
  check('technician GET /rentals -> 403 (no rental access)',
    techRes.status === 403, `got ${techRes.status}`);

  check('admin response is NOT flagged scoped', adminJson.scoped === false);
  check('customer response IS flagged scoped', custJson.scoped === true);
  check('second customer response IS flagged scoped', cust2Json.scoped === true);

  // ------------------------------------------- 3. customer sees only OWN rows
  console.log('\n=== 3. CUSTOMER SEES ONLY BOOKINGS THEIR ACCOUNT MADE ===');
  const mine = custJson.data || [];
  const foreignOwners = [...new Set(mine.map((r) => r.createdByUserId))];

  console.log(`        admin sees ${adminJson.count} rentals`);
  const custName = (customer.body && customer.body.user && customer.body.user.username) || 'orgen';
  const cust2Name = (customer2.body && customer2.body.user && customer2.body.user.username) || '(second account)';
  console.log(`        ${custName} (${customer.body.user.id}) sees ${custJson.count} rentals`);
  console.log(`        ${cust2Name} (${customer2.body.user ? customer2.body.user.id : 'n/a'}) sees ${cust2Json.count} rentals`);
  console.log(`        owner ids present in customer's list: ${JSON.stringify(foreignOwners)}`);

  check('customer list is non-empty', mine.length > 0);
  check('every rental the customer sees is owned by their own account',
    mine.every((r) => r.createdByUserId === customer.body.user.id),
    `owners seen: ${JSON.stringify(foreignOwners)}`);
  check('customer list contains no rental owned by another account',
    mine.every((r) => r.createdByUserId !== customer2.body.user.id));
  check('customer cannot see more rows than admin',
    custJson.count <= adminJson.count);

  // Prove the scenario is meaningful: there really are bookings owned by
  // someone else, and the customer's list is exactly the complement of them.
  const othersCount = (adminJson.data || [])
    .filter((r) => r.createdByUserId !== customer.body.user.id).length;
  check('the database really does hold bookings owned by other accounts',
    othersCount > 0, `others=${othersCount}`);
  check('customer sees exactly the bookings they own, and no others',
    custJson.count === (adminJson.data || []).length - othersCount,
    `customer=${custJson.count} admin=${adminJson.count} others=${othersCount}`);

  // ------------------------- 3b. same-org accounts must NOT see each other
  console.log('\n=== 3b. TWO ACCOUNTS IN THE SAME ORGANIZATION ===');
  const sameOrg = customer.body.user.organization &&
    customer.body.user.organization.toLowerCase() === (customer2.body.user.organization || '').toLowerCase();
  console.log(`        org of account 1: "${customer.body.user.organization}"`);
  console.log(`        org of account 2: "${customer2.body.user.organization}"`);
  console.log(`        same organization: ${!!sameOrg}`);

  const ids1 = new Set(mine.map((r) => r.id));
  const ids2 = new Set((cust2Json.data || []).map((r) => r.id));
  const shared = [...ids1].filter((id) => ids2.has(id));

  check('the two customer accounts share an organization (the leak scenario)',
    !!sameOrg, `"${customer.body.user.organization}" vs "${customer2.body.user.organization}"`);
  check('the two accounts do NOT see any of the same bookings',
    shared.length === 0, `shared rental ids: ${JSON.stringify(shared)}`);
  check('account 1 sees only bookings it created',
    mine.every((r) => r.createdByUserId === customer.body.user.id));
  check('account 2 sees only bookings it created',
    (cust2Json.data || []).every((r) => r.createdByUserId === customer2.body.user.id));

  // --------------------------------------- 4. single-rental ownership gate
  console.log('\n=== 4. SINGLE-RENTAL ACCESS ===');
  const ownId = mine[0] && mine[0].id;
  const otherId = (cust2Json.data || [])[0] && cust2Json.data[0].id;
  if (ownId) {
    const noTok = await authGet(`/api/rentals/${ownId}`, null);
    const adminOne = await authGet(`/api/rentals/${ownId}`, admin.token);
    const custOne = await authGet(`/api/rentals/${ownId}`, customer.token);
    check('GET /rentals/:id with no token -> 401', noTok.status === 401, `got ${noTok.status}`);
    check('GET /rentals/:id as admin -> 200', adminOne.status === 200, `got ${adminOne.status}`);
    check('GET /rentals/:id as owning customer -> 200', custOne.status === 200, `got ${custOne.status}`);
  }
  if (otherId) {
    const cross = await authGet(`/api/rentals/${otherId}`, customer.token);
    check('GET another account\'s rental by id -> 404 (not 200/403)',
      cross.status === 404, `got ${cross.status}`);
    const crossBack = await authGet(`/api/rentals/${ownId}`, customer2.token);
    check('the reverse direction is blocked too -> 404',
      crossBack.status === 404, `got ${crossBack.status}`);
  } else {
    console.log('        (second account owns no rentals — cross-fetch checks skipped)');
  }

  // A foreign rental id: same shape, does not exist. Must 404, not leak.
  const ghost = await authGet('/api/rentals/RENT-DOES-NOT-EXIST-000', customer.token);
  check('GET /rentals/<unknown id> as customer -> 404', ghost.status === 404, `got ${ghost.status}`);

  // --------------------------------------------- 5. mutations are admin-only
  console.log('\n=== 5. MUTATIONS ARE ADMIN-ONLY ===');
  const target = ownId || (adminJson.data || [])[0]?.id;
  const patchStatus = await fetch(`${BASE}/api/rentals/${target}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer.token}` },
    body: JSON.stringify({ status: 'Cancelled' }),
  });
  check('customer PATCH /rentals/:id/status -> 403', patchStatus.status === 403, `got ${patchStatus.status}`);

  const delRes = await fetch(`${BASE}/api/rentals/${target}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${customer.token}` },
  });
  check('customer DELETE /rentals/:id -> 403', delRes.status === 403, `got ${delRes.status}`);

  const patchRes = await fetch(`${BASE}/api/rentals/${target}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer.token}` },
    body: JSON.stringify({ notes: 'hacked' }),
  });
  check('customer PATCH /rentals/:id -> 403', patchRes.status === 403, `got ${patchRes.status}`);

  // Admin passes auth then fails validation (400) — proves admin is authorised
  // without writing anything (an invalid status never reaches the database).
  const adminBadStatus = await fetch(`${BASE}/api/rentals/${target}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
    body: JSON.stringify({ status: 'NotARealStatus' }),
  });
  check('admin PATCH with invalid status -> 400 (authorised, validation failed)',
    adminBadStatus.status === 400, `got ${adminBadStatus.status}`);

  // ------------------------------------------------- 6. stats are scoped too
  console.log('\n=== 6. STATS SCOPING ===');
  const custStats = await (await authGet('/api/rentals/stats/summary', customer.token)).json();
  const cust2Stats = await (await authGet('/api/rentals/stats/summary', customer2.token)).json();
  const adminStats = await (await authGet('/api/rentals/stats/summary', admin.token)).json();
  check('customer stats flagged scoped', custStats.scoped === true);
  check('second customer stats flagged scoped', cust2Stats.scoped === true);
  check('admin stats flagged unscoped', adminStats.scoped === false);
  check('customer stats total equals their visible rows',
    custStats.data && custStats.data.totalRentals === custJson.count,
    `stats=${custStats.data && custStats.data.totalRentals} list=${custJson.count}`);
  check('second customer stats total equals their visible rows',
    cust2Stats.data && cust2Stats.data.totalRentals === cust2Json.count,
    `stats=${cust2Stats.data && cust2Stats.data.totalRentals} list=${cust2Json.count}`);
  const custTotal  = (custStats.data  && custStats.data.totalRentals)  || 0;
  const cust2Total = (cust2Stats.data && cust2Stats.data.totalRentals) || 0;
  const adminTotal = (adminStats.data && adminStats.data.totalRentals) || 0;
  check('the two same-org customers get disjoint booking sets',
    custTotal + cust2Total <= adminTotal,
    `${custTotal} + ${cust2Total} vs admin ${adminTotal}`);

  // ------------------------------------------------- 7. admin-only feeds
  console.log('\n=== 7. ADMIN-ONLY FEEDS ===');
  const custUsers = await authGet('/api/auth/users', customer.token);
  const adminUsers = await authGet('/api/auth/users', admin.token);
  const anonUsers = await authGet('/api/auth/users', null);
  check('customer GET /auth/users -> 403', custUsers.status === 403, `got ${custUsers.status}`);
  check('anonymous GET /auth/users -> 401', anonUsers.status === 401, `got ${anonUsers.status}`);
  check('admin GET /auth/users -> 200', adminUsers.status === 200, `got ${adminUsers.status}`);

  // The audit log names other customers' rental numbers and organizations, so
  // it must not be readable by a customer, a technician, or anonymously.
  const anonAudit = await authGet('/api/audit-logs', null);
  const custAudit = await authGet('/api/audit-logs', customer.token);
  const cust2Audit = await authGet('/api/audit-logs', customer2.token);
  const techAudit = await authGet('/api/audit-logs', tech.token);
  const adminAudit = await authGet('/api/audit-logs', admin.token);
  check('anonymous GET /audit-logs -> 401', anonAudit.status === 401, `got ${anonAudit.status}`);
  check('customer GET /audit-logs -> 403', custAudit.status === 403, `got ${custAudit.status}`);
  check('second customer GET /audit-logs -> 403', cust2Audit.status === 403, `got ${cust2Audit.status}`);
  check('technician GET /audit-logs -> 403', techAudit.status === 403, `got ${techAudit.status}`);
  check('admin GET /audit-logs -> 200', adminAudit.status === 200, `got ${adminAudit.status}`);

  const me = await authGet('/api/auth/me', customer.token);
  const meJson = await me.json();
  check('GET /auth/me with token -> 200', me.status === 200, `got ${me.status}`);
  check('/auth/me returns the token owner',
    meJson.user && meJson.user.id === customer.body.user.id);
  check('/auth/me never returns a password hash',
    !JSON.stringify(meJson).toLowerCase().includes('passwordhash'));

  // =====================================================================
  // PART 2 — synthetic multi-account proof (no database involvement)
  // =====================================================================
  console.log('\n=== 8. CROSS-ACCOUNT ISOLATION (synthetic, 2 accounts / 1 org) ===');

  // Extract from the COMPILED output so the extracted code is plain JS
  // (the TypeScript source still carries type annotations).
  const src = fs.readFileSync('dist/routes/api.js', 'utf8');
  function grab(name) {
    const start = src.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`not found: ${name}`);
    let i = src.indexOf('(', start), pd = 0;
    for (; i < src.length; i++) {
      if (src[i] === '(') pd++;
      else if (src[i] === ')') { pd--; if (pd === 0) { i++; break; } }
    }
    for (; i < src.length; i++) {
      if (src[i] !== '{') continue;
      let depth = 1;
      for (let j = i + 1; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
      }
    }
    throw new Error(`unbalanced: ${name}`);
  }
  const code = [grab('rentalOwnedByUser'), grab('scopeRentalsForAuth')].join('\n');
  const { rentalOwnedByUser, scopeRentalsForAuth } = new Function(
    `${code}\nreturn { rentalOwnedByUser, scopeRentalsForAuth };`
  )();

  // Alice and Bob are two accounts inside ONE organization — exactly the
  // configuration that leaked when scoping compared organization names.
  const ALICE = { userId: 'U-ALICE', role: 'customer', scope: { customerId: 'CUST-AAA', organization: 'Alpha Academy' } };
  const BOB   = { userId: 'U-BOB',   role: 'customer', scope: { customerId: 'CUST-AAA', organization: 'Alpha Academy' } };
  const CAROL = { userId: 'U-CAROL', role: 'customer', scope: { customerId: 'CUST-BBB', organization: 'Beta Corp' } };

  const rentals = [
    { id: 'R-A1', createdByUserId: 'U-ALICE', customerId: 'CUST-AAA', customerName: 'Alpha Academy' },
    { id: 'R-A2', createdByUserId: 'U-ALICE', customerId: 'CUST-AAA', customerName: 'Alpha Academy' },
    { id: 'R-B1', createdByUserId: 'U-BOB',   customerId: 'CUST-AAA', customerName: 'Alpha Academy' }, // same org as Alice!
    { id: 'R-C1', createdByUserId: 'U-CAROL', customerId: 'CUST-BBB', customerName: 'Beta Corp' },
    { id: 'R-ORPHAN', createdByUserId: null,  customerId: 'CUST-AAA', customerName: 'Alpha Academy' }, // unattributed
  ];

  const aIds = scopeRentalsForAuth(rentals, ALICE).map((r) => r.id);
  const bIds = scopeRentalsForAuth(rentals, BOB).map((r) => r.id);
  const cIds = scopeRentalsForAuth(rentals, CAROL).map((r) => r.id);
  const adminIds = scopeRentalsForAuth(rentals, { userId: 'U-ADMIN', role: 'admin', scope: null }).map((r) => r.id);
  const techIds = scopeRentalsForAuth(rentals, { userId: 'U-TECH', role: 'technician', scope: null }).map((r) => r.id);
  const noScopeIds = scopeRentalsForAuth(rentals, { userId: 'U-NOSCOPE', role: 'customer', scope: null }).map((r) => r.id);

  console.log(`        Alice (U-ALICE, org Alpha) sees: ${JSON.stringify(aIds)}`);
  console.log(`        Bob   (U-BOB,   org Alpha) sees: ${JSON.stringify(bIds)}`);
  console.log(`        Carol (U-CAROL, org Beta)  sees: ${JSON.stringify(cIds)}`);
  console.log(`        admin sees:    ${JSON.stringify(adminIds)}`);
  console.log(`        technician:    ${JSON.stringify(techIds)}`);
  console.log(`        customer w/o scope: ${JSON.stringify(noScopeIds)}`);

  check('Alice sees exactly the 2 bookings her account made',
    JSON.stringify(aIds) === JSON.stringify(['R-A1', 'R-A2']));
  check('Bob sees exactly the 1 booking his account made',
    JSON.stringify(bIds) === JSON.stringify(['R-B1']));
  check('Carol sees exactly her own booking', JSON.stringify(cIds) === JSON.stringify(['R-C1']));
  check('two accounts in the SAME org do not see each other (Alice excludes R-B1)',
    !aIds.includes('R-B1'));
  check('two accounts in the SAME org do not see each other (Bob excludes R-A1/A2)',
    !bIds.includes('R-A1') && !bIds.includes('R-A2'));
  check('no cross-account overlap between Alice and Bob',
    aIds.filter((id) => bIds.includes(id)).length === 0);
  check('no cross-organization overlap',
    aIds.filter((id) => cIds.includes(id)).length === 0 && bIds.filter((id) => cIds.includes(id)).length === 0);
  check('admin sees all 5 rentals', adminIds.length === 5);
  check('technician sees nothing', techIds.length === 0);
  check('customer with no resolvable scope sees nothing (fail closed)', noScopeIds.length === 0);
  check('the unattributed orphan rental is hidden from every customer',
    !aIds.includes('R-ORPHAN') && !bIds.includes('R-ORPHAN') && !cIds.includes('R-ORPHAN'));

  // Direct predicate checks
  check('rentalOwnedByUser matches the creating account',
    rentalOwnedByUser(rentals[0], 'U-ALICE') === true);
  check('rentalOwnedByUser rejects a different account in the same organization',
    rentalOwnedByUser(rentals[2], 'U-ALICE') === false);
  check('rentalOwnedByUser ignores organization/customer identity',
    rentalOwnedByUser({ createdByUserId: 'U-ALICE', customerId: 'CUST-AAA', customerName: 'Alpha Academy' }, 'U-BOB') === false);
  check('rentalOwnedByUser rejects a rental with no owner (fail closed)',
    rentalOwnedByUser(rentals[4], 'U-ALICE') === false);
  check('rentalOwnedByUser rejects an empty owner string',
    rentalOwnedByUser({ createdByUserId: '   ' }, 'U-ALICE') === false);
  check('rentalOwnedByUser rejects an empty requester',
    rentalOwnedByUser(rentals[0], '') === false);
  check('rentalOwnedByUser handles null/undefined safely',
    rentalOwnedByUser(null, 'U-ALICE') === false && rentalOwnedByUser(undefined, 'U-ALICE') === false);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
