const path = require('path');
require('dotenv').config({ path: path.resolve('.env') });
const { Pool } = require('pg');
const BASE = 'http://127.0.0.1:3000/api';
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n} -> ${JSON.stringify(d)}`)); };
const post = async (p, body) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pool.query('DELETE FROM password_reset_codes');

  console.log('=== 1. UNKNOWN EMAIL MUST NOT LEAK ===');
  const unk = await post('/auth/forgot-password', { email: 'definitely-not-here-xyz@example.com' });
  check('unknown email -> 200', unk.status === 200, unk.status);
  check('unknown email -> no devCode', !unk.body.devCode, unk.body.devCode);

  console.log('\n=== 2. INVALID EMAIL FORMAT ===');
  const bad = await post('/auth/forgot-password', { email: 'not-an-email' });
  check('bad format -> 400', bad.status === 400, bad.status);

  console.log('\n=== 3. REQUEST A CODE ===');
  const req1 = await post('/auth/forgot-password', { email: 'admin@gmail.com' });
  check('request -> 200', req1.status === 200, req1.status);
  check('devCode returned (SMTP unconfigured)', !!req1.body.devCode, req1.body);
  const code = req1.body.devCode;
  console.log('     code:', code);

  console.log('\n=== 4. EXPIRY IS REALLY ~10 MINUTES (DB-side) ===');
  const exp = await pool.query(
    `SELECT EXTRACT(EPOCH FROM (expires_at - NOW())) AS secs FROM password_reset_codes
     WHERE consumed = false ORDER BY created_at DESC LIMIT 1`
  );
  const secs = Number(exp.rows[0].secs);
  console.log('     seconds until expiry:', secs.toFixed(0));
  check('expiry is between 9 and 10 minutes', secs > 540 && secs <= 600, secs);

  console.log('\n=== 5. COOLDOWN BLOCKS AN IMMEDIATE RESEND ===');
  const req2 = await post('/auth/forgot-password', { email: 'admin@gmail.com' });
  check('re-request -> 200', req2.status === 200, req2.status);
  check('re-request -> no new code (cooldown held)', !req2.body.devCode, req2.body.devCode);
  const cnt = await pool.query(`SELECT COUNT(*)::int AS n FROM password_reset_codes WHERE consumed = false`);
  check('still exactly one live code', cnt.rows[0].n === 1, cnt.rows[0].n);

  console.log('\n=== 6. WRONG CODE REJECTED, ATTEMPTS COUNTED ===');
  const wrong = code === '000000' ? '111111' : '000000';
  const vw = await post('/auth/verify-reset-code', { email: 'admin@gmail.com', code: wrong });
  check('wrong code -> 400', vw.status === 400, vw.status);
  check('mentions attempts left', /attempt/i.test(vw.body.error || ''), vw.body.error);
  console.log('     err:', vw.body.error);

  console.log('\n=== 7. MALFORMED CODE ===');
  const vm = await post('/auth/verify-reset-code', { email: 'admin@gmail.com', code: 'abc' });
  check('non-numeric -> 400', vm.status === 400, vm.status);

  console.log('\n=== 8. THE CORRECT CODE VERIFIES ===');
  const vok = await post('/auth/verify-reset-code', { email: 'admin@gmail.com', code });
  check('correct code -> 200', vok.status === 200, vok.body);

  console.log('\n=== 9. WEAK NEW PASSWORD REJECTED ===');
  const weak = await post('/auth/reset-password', { email: 'admin@gmail.com', code, password: '123' });
  check('short password -> 400', weak.status === 400, weak.body.error);

  console.log('\n=== 10. RESET (password set back to 123123) ===');
  const rs = await post('/auth/reset-password', { email: 'admin@gmail.com', code, password: '123123' });
  check('reset -> 200', rs.status === 200, rs.body);

  console.log('\n=== 11. CODE IS SINGLE-USE ===');
  const again = await post('/auth/reset-password', { email: 'admin@gmail.com', code, password: '123123' });
  check('replayed code -> 400', again.status === 400, again.body.error);

  console.log('\n=== 12. LOGIN STILL WORKS ===');
  const li = await post('/auth/login', { username: 'admin', password: '123123' });
  check('login -> 200 with token', li.status === 200 && !!li.body.token, li.status);

  console.log('\n=== 13. EXPIRED CODE IS REJECTED ===');
  await post('/auth/forgot-password', { email: 'hellooooooo@example.com' });
  await pool.query(`DELETE FROM password_reset_codes`);
  const req3 = await post('/auth/forgot-password', { email: 'admin@gmail.com' });
  const code3 = req3.body.devCode;
  await pool.query(`UPDATE password_reset_codes SET expires_at = NOW() - INTERVAL '1 minute'`);
  const vex = await post('/auth/verify-reset-code', { email: 'admin@gmail.com', code: code3 });
  check('expired code -> 400', vex.status === 400, vex.status);
  console.log('     err:', vex.body.error);

  await pool.end();
  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('PROBE ERROR', e); process.exit(1); });
