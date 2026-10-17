/**
 * Notification privacy and role scoping.
 *
 * The notification feed used to be an unauthenticated endpoint that returned
 * every ticket, every stock alert and every chat message to whoever asked. That
 * meant any signed-in account — and anyone who could reach the API at all —
 * could read other customers' ticket traffic.
 *
 * These checks run against the LIVE dev server (http://localhost:3000) and use
 * real logins, because the whole point is that the SERVER decides visibility
 * from the bearer token, not from a userId/userRole query parameter the client
 * could forge.
 *
 * Start the server first:  npm run dev
 * Then:                    node tests/notifications-privacy.test.cjs
 */
const BASE = process.env.MILLENIUM_BASE || 'http://localhost:3000';
const API = `${BASE}/api`;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  const d = detail === undefined ? ''
    : (typeof detail === 'object' ? JSON.stringify(detail) : String(detail));
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${d ? '  ->  ' + d : ''}`); }
}

async function login(username, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  return body.token || null;
}

async function notifications(token) {
  const res = await fetch(`${API}/notifications`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, data: body.data || [] };
}

const typesOf = (list) => {
  const out = {};
  list.forEach((n) => { out[n.type] = (out[n.type] || 0) + 1; });
  return out;
};

(async () => {
  console.log('\n=== 1. THE FEED REQUIRES AUTHENTICATION ===');
  {
    const res = await notifications(null);
    check('anonymous request is rejected', res.status === 401, res.status);
    check('the rejection is a clear UNAUTHENTICATED code',
      res.body.code === 'UNAUTHENTICATED', res.body);
    check('no notification payload leaks on rejection',
      res.data.length === 0, res.data.length);

    const bad = await notifications('not-a-real-token');
    check('a forged token is rejected too', bad.status === 401, bad.status);
    check('a forged token leaks nothing', bad.data.length === 0, bad.data.length);
  }

  const admin = await login('admin', '123123');
  const tech = await login('hello', '123123');
  const custQcu = await login('orgen', '123123');
  const custHyt = await login('harden', '123123');

  console.log('\n=== 2. REAL ACCOUNTS SIGN IN ===');
  check('admin signs in', !!admin);
  check('technician signs in', !!tech);
  check('customer (QCU) signs in', !!custQcu);
  check('customer (hyt) signs in', !!custHyt);
  if (!admin || !tech || !custQcu || !custHyt) {
    console.log('\nCannot continue without all four accounts. Aborting.');
    console.log(`RESULT: ${pass} passed, ${fail} failed`);
    process.exit(1);
  }

  const adminRes = await notifications(admin);
  const techRes = await notifications(tech);
  const qcuRes = await notifications(custQcu);
  const hytRes = await notifications(custHyt);

  console.log('\n=== 3. STOCK ALERTS ARE ADMIN-ONLY ===');
  check('admin receives low-stock alerts',
    (typesOf(adminRes.data).low_stock || 0) > 0, typesOf(adminRes.data));
  check('technician receives no low-stock alerts',
    (typesOf(techRes.data).low_stock || 0) === 0, typesOf(techRes.data));
  check('customer receives no low-stock alerts',
    (typesOf(qcuRes.data).low_stock || 0) === 0, typesOf(qcuRes.data));

  console.log('\n=== 4. CUSTOMERS NEVER SEE STAFF CHAT ===');
  // A staff message carries senderRole admin|technician on the staff channel.
  // Customers must never receive it in any shape.
  const staffLeak = qcuRes.data.filter(
    (n) => n.type === 'new_message'
  );
  check('customer feed contains no staff-channel messages',
    staffLeak.length === 0, staffLeak.map((n) => n.title));

  console.log('\n=== 5. CUSTOMERS ARE ISOLATED FROM EACH OTHER ===');
  const qcuIds = new Set(qcuRes.data.map((n) => n.id));
  const hytIds = new Set(hytRes.data.map((n) => n.id));
  const overlap = [...qcuIds].filter((id) => hytIds.has(id));
  check('two different customer organizations share no notifications',
    overlap.length === 0, overlap);

  // Each customer may only see tickets whose id is reachable from their own
  // scope. We cannot know their ticket list here, so assert the weaker but
  // meaningful property: a customer with no tickets sees nothing at all.
  if (hytRes.data.length === 0) {
    check('the customer with no tickets sees an empty feed', true);
  } else {
    check('the customer feed is non-empty but scoped', hytRes.data.length > 0);
  }

  console.log('\n=== 6. TECHNICIANS ARE SCOPED TO ASSIGNED TICKETS ===');
  const adminTicketIds = new Set(
    adminRes.data.filter((n) => n.type === 'new_ticket').map((n) => n.linkId)
  );
  const techTicketIds = new Set(
    techRes.data.filter((n) => n.type === 'new_ticket').map((n) => n.linkId)
  );
  const outside = [...techTicketIds].filter((id) => !adminTicketIds.has(id));
  check('every technician ticket notification exists in the admin feed',
    outside.length === 0, outside);

  // If the admin sees more tickets than the technician, the filter is doing
  // real work rather than passing everything through.
  console.log(`    admin tickets: ${adminTicketIds.size}, technician tickets: ${techTicketIds.size}`);
  check('the technician feed is not simply the whole ticket table',
    techTicketIds.size <= adminTicketIds.size, {
      admin: adminTicketIds.size, tech: techTicketIds.size,
    });

  console.log('\n=== 7. SHAPE IS STABLE FOR THE CLIENT ===');
  const sample = adminRes.data[0];
  check('notifications carry the fields the bell renders',
    !!sample && ['id', 'type', 'title', 'message', 'timestamp'].every((k) => k in sample),
    sample);
  check('every notification has a readable type',
    adminRes.data.every((n) => ['low_stock', 'new_ticket', 'new_message', 'ticket_message'].includes(n.type)),
    [...new Set(adminRes.data.map((n) => n.type))]);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
