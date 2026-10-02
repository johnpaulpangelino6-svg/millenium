/**
 * Rental privacy verification.
 *
 * Part 1 — live HTTP tests against the running server (no writes).
 * Part 2 — synthetic multi-customer test of the scoping predicates, extracted
 *          from the real source, to prove cross-tenant isolation for data that
 *          does not exist in the single-customer live database.
 */
const BASE = 'http://localhost:3000';
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
  return { status: r.status, body: j, token: j.token };
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
  const tech = await login('hello', '123123');

  console.log('\n=== LOGIN: token issued? ===');
  check('admin login returns a token', !!admin.token, `status=${admin.status}`);
  check('customer login returns a token', !!customer.token, `status=${customer.status}`);
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
  const techRes = await authGet('/api/rentals', tech.token);

  check('admin GET /rentals -> 200', adminRes.status === 200, `got ${adminRes.status}`);
  check('customer GET /rentals -> 200', custRes.status === 200, `got ${custRes.status}`);
  check('technician GET /rentals -> 403 (no rental access)',
    techRes.status === 403, `got ${techRes.status}`);

  check('admin response is NOT flagged scoped', adminJson.scoped === false);
  check('customer response IS flagged scoped', custJson.scoped === true);

  // ------------------------------------------- 3. customer sees only own org
  console.log('\n=== 3. CUSTOMER SEES ONLY THEIR OWN DATA ===');
  const orgsSeenByCustomer = [...new Set((custJson.data || []).map((r) => r.customerName))];
  const idsSeenByCustomer = [...new Set((custJson.data || []).map((r) => r.customerId))];

  console.log(`        admin sees ${adminJson.count} rentals`);
  console.log(`        customer sees ${custJson.count} rentals`);
  console.log(`        customer orgs present: ${JSON.stringify(orgsSeenByCustomer)}`);
  console.log(`        customer ids present:  ${JSON.stringify(idsSeenByCustomer)}`);

  check('customer list is non-empty', (custJson.data || []).length > 0);
  check('every rental the customer sees belongs to exactly one org',
    orgsSeenByCustomer.length <= 1, `saw ${JSON.stringify(orgsSeenByCustomer)}`);
  check('every rental the customer sees belongs to exactly one customerId',
    idsSeenByCustomer.length <= 1, `saw ${JSON.stringify(idsSeenByCustomer)}`);
  check('customer cannot see more rows than admin',
    custJson.count <= adminJson.count);

  // --------------------------------------- 4. single-rental ownership gate
  console.log('\n=== 4. SINGLE-RENTAL ACCESS ===');
  const sampleId = (adminJson.data || [])[0] && adminJson.data[0].id;
  if (sampleId) {
    const noTok = await authGet(`/api/rentals/${sampleId}`, null);
    const adminOne = await authGet(`/api/rentals/${sampleId}`, admin.token);
    const custOne = await authGet(`/api/rentals/${sampleId}`, customer.token);
    check('GET /rentals/:id with no token -> 401', noTok.status === 401, `got ${noTok.status}`);
    check('GET /rentals/:id as admin -> 200', adminOne.status === 200, `got ${adminOne.status}`);
    check('GET /rentals/:id as owning customer -> 200', custOne.status === 200, `got ${custOne.status}`);
  }

  // A foreign rental id: same shape, does not exist. Must 404, not leak.
  const ghost = await authGet('/api/rentals/RENT-DOES-NOT-EXIST-000', customer.token);
  check('GET /rentals/<unknown id> as customer -> 404', ghost.status === 404, `got ${ghost.status}`);

  // --------------------------------------------- 5. mutations are admin-only
  console.log('\n=== 5. MUTATIONS ARE ADMIN-ONLY ===');
  const patchStatus = await fetch(`${BASE}/api/rentals/${sampleId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer.token}` },
    body: JSON.stringify({ status: 'Cancelled' }),
  });
  check('customer PATCH /rentals/:id/status -> 403', patchStatus.status === 403, `got ${patchStatus.status}`);

  const delRes = await fetch(`${BASE}/api/rentals/${sampleId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${customer.token}` },
  });
  check('customer DELETE /rentals/:id -> 403', delRes.status === 403, `got ${delRes.status}`);

  const patchRes = await fetch(`${BASE}/api/rentals/${sampleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer.token}` },
    body: JSON.stringify({ notes: 'hacked' }),
  });
  check('customer PATCH /rentals/:id -> 403', patchRes.status === 403, `got ${patchRes.status}`);

  // Admin passes auth then fails validation (400) — proves admin is authorised
  // without writing anything (an invalid status never reaches the database).
  const adminBadStatus = await fetch(`${BASE}/api/rentals/${sampleId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
    body: JSON.stringify({ status: 'NotARealStatus' }),
  });
  check('admin PATCH with invalid status -> 400 (authorised, validation failed)',
    adminBadStatus.status === 400, `got ${adminBadStatus.status}`);

  // ------------------------------------------------- 6. stats are scoped too
  console.log('\n=== 6. STATS SCOPING ===');
  const custStats = await (await authGet('/api/rentals/stats/summary', customer.token)).json();
  const adminStats = await (await authGet('/api/rentals/stats/summary', admin.token)).json();
  check('customer stats flagged scoped', custStats.scoped === true);
  check('admin stats flagged unscoped', adminStats.scoped === false);
  check('customer stats total equals their visible rows',
    custStats.data && custStats.data.totalRentals === custJson.count,
    `stats=${custStats.data && custStats.data.totalRentals} list=${custJson.count}`);

  // ------------------------------------------------- 7. user list is protected
  console.log('\n=== 7. USER LIST PROTECTION ===');
  const custUsers = await authGet('/api/auth/users', customer.token);
  const adminUsers = await authGet('/api/auth/users', admin.token);
  const anonUsers = await authGet('/api/auth/users', null);
  check('customer GET /auth/users -> 403', custUsers.status === 403, `got ${custUsers.status}`);
  check('anonymous GET /auth/users -> 401', anonUsers.status === 401, `got ${anonUsers.status}`);
  check('admin GET /auth/users -> 200', adminUsers.status === 200, `got ${adminUsers.status}`);

  const me = await authGet('/api/auth/me', customer.token);
  const meJson = await me.json();
  check('GET /auth/me with token -> 200', me.status === 200, `got ${me.status}`);
  check('/auth/me returns the token owner',
    meJson.user && meJson.user.id === customer.body.user.id);
  check('/auth/me never returns a password hash',
    !JSON.stringify(meJson).toLowerCase().includes('passwordhash'));

  // =====================================================================
  // PART 2 — synthetic multi-customer proof (no database involvement)
  // =====================================================================
  console.log('\n=== 8. CROSS-CUSTOMER ISOLATION (synthetic, 2 tenants) ===');

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
  const code = [grab('rentalInScope'), grab('scopeRentalsForAuth')].join('\n');
  const { rentalInScope, scopeRentalsForAuth } = new Function(
    `${code}\nreturn { rentalInScope, scopeRentalsForAuth };`
  )();

  const TENANT_A = { customerId: 'CUST-AAA', organization: 'Alpha Academy' };
  const TENANT_B = { customerId: 'CUST-BBB', organization: 'Beta Corp' };

  const rentals = [
    { id: 'R-A1', customerId: 'CUST-AAA', customerName: 'Alpha Academy' },
    { id: 'R-A2', customerId: 'CUST-AAA', customerName: 'Alpha Academy' },
    { id: 'R-A3', customerId: 'CUST-AAA', customerName: 'alpha academy' }, // casing differs
    { id: 'R-B1', customerId: 'CUST-BBB', customerName: 'Beta Corp' },
    { id: 'R-B2', customerId: 'CUST-BBB', customerName: ' Beta Corp ' },   // padding differs
    { id: 'R-ORPHAN', customerId: '', customerName: 'Gamma Ltd' },          // unattributable
  ];

  const aIds = scopeRentalsForAuth(rentals, { role: 'customer', scope: TENANT_A }).map((r) => r.id);
  const bIds = scopeRentalsForAuth(rentals, { role: 'customer', scope: TENANT_B }).map((r) => r.id);
  const adminIds = scopeRentalsForAuth(rentals, { role: 'admin', scope: null }).map((r) => r.id);
  const techIds = scopeRentalsForAuth(rentals, { role: 'technician', scope: null }).map((r) => r.id);
  const noScopeIds = scopeRentalsForAuth(rentals, { role: 'customer', scope: null }).map((r) => r.id);

  console.log(`        tenant A sees: ${JSON.stringify(aIds)}`);
  console.log(`        tenant B sees: ${JSON.stringify(bIds)}`);
  console.log(`        admin sees:    ${JSON.stringify(adminIds)}`);
  console.log(`        technician:    ${JSON.stringify(techIds)}`);
  console.log(`        customer w/o scope: ${JSON.stringify(noScopeIds)}`);

  check('tenant A sees exactly its own 3 rentals', JSON.stringify(aIds) === JSON.stringify(['R-A1', 'R-A2', 'R-A3']));
  check('tenant B sees exactly its own 2 rentals', JSON.stringify(bIds) === JSON.stringify(['R-B1', 'R-B2']));
  check('tenant A sees ZERO of tenant B\'s rentals', !aIds.some((id) => id.startsWith('R-B')));
  check('tenant B sees ZERO of tenant A\'s rentals', !bIds.some((id) => id.startsWith('R-A')));
  check('admin sees all 6 rentals', adminIds.length === 6);
  check('technician sees nothing', techIds.length === 0);
  check('customer with no resolvable scope sees nothing (fail closed)', noScopeIds.length === 0);
  check('the unattributable orphan rental is hidden from every customer',
    !aIds.includes('R-ORPHAN') && !bIds.includes('R-ORPHAN'));

  // Direct predicate checks
  check('rentalInScope matches on customerId',
    rentalInScope(rentals[0], TENANT_A) === true);
  check('rentalInScope rejects the other tenant',
    rentalInScope(rentals[3], TENANT_A) === false);
  check('rentalInScope is case-insensitive on org name',
    rentalInScope(rentals[2], TENANT_A) === true);
  check('rentalInScope is whitespace-insensitive on org name',
    rentalInScope(rentals[4], TENANT_B) === true);
  check('rentalInScope rejects a rental with no customer info',
    rentalInScope(rentals[5], TENANT_A) === false);
  check('rentalInScope handles null/undefined safely',
    rentalInScope(null, TENANT_A) === false && rentalInScope(undefined, TENANT_A) === false);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
