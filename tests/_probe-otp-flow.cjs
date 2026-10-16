/**
 * Probe: the password-reset-by-code flow.
 *
 * The reset code is NEVER returned by the API (see src/auth/password-reset.ts),
 * so this probe cannot read it from the response. Instead it injects a code it
 * already knows — the row stores only SHA-256, so writing sha256('123456') lets
 * the probe redeem '123456' through the real endpoints.
 *
 * It uses a THROWAWAY account. The previous version of this probe reset the
 * real `admin` account's password to a fixed value, which silently locked
 * anyone out of admin with their own password.
 */
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve('.env') });
const { Pool } = require('pg');

const BASE = 'http://127.0.0.1:3000/api';
const EMAIL = 'wb.otp.probe@example.com';
const USERNAME = 'wb_otp_probe';
const OLD_PW = 'ProbeOld@123';
const NEW_PW = 'ProbeNew@456';
const KNOWN_CODE = '123456';

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

let pass = 0, fail = 0;
const check = (n, ok, d) => {
  ok ? (pass++, console.log(`  PASS  ${n}`))
     : (fail++, console.log(`  FAIL  ${n} -> ${JSON.stringify(d)}`));
};
const post = async (p, body) => {
  const r = await fetch(BASE + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};

(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const cleanup = async () => {
    await pool.query(`DELETE FROM password_reset_codes WHERE LOWER(email) = LOWER($1)`, [EMAIL]);
    await pool.query(`DELETE FROM users WHERE LOWER(email) = LOWER($1)`, [EMAIL]);
  };
  await cleanup();

  const reg = await post('/auth/register', {
    username: USERNAME, email: EMAIL, password: OLD_PW,
    fullName: 'OTP Probe', role: 'technician',
  });
  check('throwaway account created', reg.body.success === true, reg.body);

  const userId = (await pool.query(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [EMAIL])).rows[0].id;

  // ------------------------------------------------------------------ security
  console.log('\n=== 1. UNKNOWN EMAIL MUST NOT LEAK ===');
  const unk = await post('/auth/forgot-password', { email: 'definitely-not-here-xyz@example.com' });
  check('unknown email -> 200', unk.status === 200, unk.status);
  check('unknown email -> response carries no code',
    !unk.body.devCode && !unk.body.code, unk.body);

  console.log('\n=== 2. INVALID EMAIL FORMAT ===');
  const bad = await post('/auth/forgot-password', { email: 'not-an-email' });
  check('bad format -> 400', bad.status === 400, bad.status);

  console.log('\n=== 3. THE CODE IS NEVER RETURNED TO THE CALLER ===');
  const req1 = await post('/auth/forgot-password', { email: EMAIL });
  check('request -> 200', req1.status === 200, req1.status);
  check('no devCode field in the response', req1.body.devCode === undefined, req1.body);
  check('no code/otp field in the response',
    req1.body.code === undefined && req1.body.otp === undefined, Object.keys(req1.body));
  // Belt and braces: the raw body must not contain the stored code either.
  const live = await pool.query(
    `SELECT code_hash, attempts, expires_at FROM password_reset_codes
     WHERE LOWER(email) = LOWER($1) AND consumed = false
     ORDER BY created_at DESC LIMIT 1`, [EMAIL]);
  check('exactly one live code exists in the DB', live.rows.length === 1, live.rows.length);
  check('the stored code is a sha256 hash, not the code itself',
    /^[0-9a-f]{64}$/.test(live.rows[0].code_hash), live.rows[0].code_hash);

  console.log('\n=== 4. EXPIRY IS REALLY ~10 MINUTES (DB-side) ===');
  const exp = await pool.query(
    `SELECT EXTRACT(EPOCH FROM (expires_at - NOW())) AS secs FROM password_reset_codes
     WHERE LOWER(email) = LOWER($1) AND consumed = false
     ORDER BY created_at DESC LIMIT 1`, [EMAIL]);
  const secs = Number(exp.rows[0].secs);
  console.log('     seconds until expiry:', secs.toFixed(0));
  check('expiry is between 9 and 10 minutes', secs > 540 && secs <= 600, secs);

  console.log('\n=== 5. COOLDOWN BLOCKS AN IMMEDIATE RESEND ===');
  const req2 = await post('/auth/forgot-password', { email: EMAIL });
  check('re-request -> 200', req2.status === 200, req2.status);
  const cnt = await pool.query(
    `SELECT COUNT(*)::int AS n FROM password_reset_codes
     WHERE LOWER(email) = LOWER($1) AND consumed = false`, [EMAIL]);
  check('still exactly one live code', cnt.rows[0].n === 1, cnt.rows[0].n);

  // ------------------------------------------------------------- redemption
  console.log('\n=== 6. REDEEM A KNOWN CODE (injected, since the API never sends it) ===');
  await pool.query(`DELETE FROM password_reset_codes WHERE LOWER(email) = LOWER($1)`, [EMAIL]);
  await pool.query(
    `INSERT INTO password_reset_codes (id, user_id, email, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
    [`PRC-probe-${Date.now()}`, userId, EMAIL, sha256(KNOWN_CODE)]);

  console.log('\n=== 7. WRONG CODE REJECTED, ATTEMPTS COUNTED ===');
  const vw = await post('/auth/verify-reset-code', { email: EMAIL, code: '000000' });
  check('wrong code -> 400', vw.status === 400, vw.status);
  check('mentions attempts left', /attempt/i.test(vw.body.error || ''), vw.body.error);
  console.log('     err:', vw.body.error);

  console.log('\n=== 8. MALFORMED CODE ===');
  const vm = await post('/auth/verify-reset-code', { email: EMAIL, code: 'abc' });
  check('non-numeric -> 400', vm.status === 400, vm.status);

  console.log('\n=== 9. THE CORRECT CODE VERIFIES ===');
  const vok = await post('/auth/verify-reset-code', { email: EMAIL, code: KNOWN_CODE });
  check('correct code -> 200', vok.status === 200, vok.body);

  console.log('\n=== 10. WEAK NEW PASSWORD REJECTED ===');
  const weak = await post('/auth/reset-password', { email: EMAIL, code: KNOWN_CODE, password: '123' });
  check('short password -> 400', weak.status === 400, weak.body.error);

  console.log('\n=== 11. RESET ===');
  const rs = await post('/auth/reset-password', { email: EMAIL, code: KNOWN_CODE, password: NEW_PW });
  check('reset -> 200', rs.status === 200, rs.body);

  console.log('\n=== 12. CODE IS SINGLE-USE ===');
  const again = await post('/auth/reset-password', { email: EMAIL, code: KNOWN_CODE, password: NEW_PW });
  check('replayed code -> 400', again.status === 400, again.body.error);

  console.log('\n=== 13. OLD PASSWORD DIES, NEW PASSWORD WORKS ===');
  const oldLi = await post('/auth/login', { username: EMAIL, password: OLD_PW });
  check('old password rejected', oldLi.body.success === false, oldLi.body);
  const li = await post('/auth/login', { username: EMAIL, password: NEW_PW });
  check('new password logs in by EMAIL', li.status === 200 && !!li.body.token, li.status);

  console.log('\n=== 14. EXPIRED CODE IS REJECTED ===');
  await pool.query(`DELETE FROM password_reset_codes WHERE LOWER(email) = LOWER($1)`, [EMAIL]);
  await pool.query(
    `INSERT INTO password_reset_codes (id, user_id, email, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, NOW() - INTERVAL '1 minute')`,
    [`PRC-probe-exp-${Date.now()}`, userId, EMAIL, sha256('654321')]);
  const vex = await post('/auth/verify-reset-code', { email: EMAIL, code: '654321' });
  check('expired code -> 400', vex.status === 400, vex.status);
  console.log('     err:', vex.body.error);

  await cleanup();
  const left = await pool.query(
    `SELECT COUNT(*)::int AS n FROM users WHERE LOWER(email) = LOWER($1)`, [EMAIL]);
  console.log(`\ncleanup: throwaway rows remaining = ${left.rows[0].n}`);

  await pool.end();
  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('PROBE ERROR', e); process.exit(1); });
