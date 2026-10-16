/**
 * Regression test for the reset dialog's resend cooldown.
 *
 * The bug: the server enforces a 60-second resend cooldown and, inside that
 * window, deliberately sends NOTHING while still answering "success" — it has
 * to, because a different answer would reveal which email addresses have
 * accounts. The dialog had no matching client-side cooldown, so clicking
 * "send a new code" during the window produced:
 *
 *     "A new code is on its way."
 *
 * for an email that was never even attempted. The user waits, nothing arrives,
 * and the flow looks broken when it is in fact working as designed.
 *
 * There is no DOM library in this project (jsdom / puppeteer / linkedom are all
 * absent), so this extracts the REAL `resendWaitMs` body out of
 * public/js/app.js and runs it in a vm against controlled state, rather than
 * testing a re-implementation that could drift.
 *
 * Run: node tests/reset-dialog-cooldown.test.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_JS = path.join(__dirname, '..', 'public', 'js', 'app.js');
const src = fs.readFileSync(APP_JS, 'utf8');

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}`);
    if (detail) console.log(`        ${detail}`);
  }
}

/** Pull `function name(...) { ... }` out of the source by brace matching. */
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`function ${name} not found in ${APP_JS}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces while extracting ${name}`);
}

/** Read the real cooldown constant out of the source rather than hardcoding it. */
function readCooldownMs(source) {
  const m = source.match(/const\s+RESEND_COOLDOWN_MS\s*=\s*(\d+)\s*;/);
  if (!m) throw new Error('RESEND_COOLDOWN_MS not found in app.js');
  return Number(m[1]);
}

const COOLDOWN_MS = readCooldownMs(src);
const body = extractFunction(src, 'resendWaitMs');

/**
 * Build a callable resendWaitMs with controlled state. The extracted function
 * closes over lastCodeEmail / lastCodeRequestAt / RESEND_COOLDOWN_MS, so those
 * are supplied as vm globals — mirroring how they exist in the real closure.
 */
function makeResendWaitMs({ lastCodeEmail, lastCodeRequestAt, cooldownMs = COOLDOWN_MS }) {
  const context = vm.createContext({
    RESEND_COOLDOWN_MS: cooldownMs,
    lastCodeEmail,
    lastCodeRequestAt,
  });
  return vm.runInContext(`${body}\nresendWaitMs;`, context);
}

console.log('Reset dialog resend-cooldown regression test');
console.log('===========================================');
console.log(`  source:   ${path.relative(path.join(__dirname, '..'), APP_JS)}`);
console.log(`  cooldown: ${COOLDOWN_MS} ms (read from source)`);
console.log('');

const T0 = 1_700_000_000_000;

// --- 1. the cooldown is real and enforced ---------------------------------
console.log('1. A resend inside the window is refused');
{
  const wait = makeResendWaitMs({ lastCodeEmail: 'a@b.com', lastCodeRequestAt: T0 });

  check('blocks immediately after a send', wait('a@b.com', T0) > 0, `got ${wait('a@b.com', T0)}`);
  check('blocks halfway through', wait('a@b.com', T0 + COOLDOWN_MS / 2) > 0);
  check('blocks one ms before expiry', wait('a@b.com', T0 + COOLDOWN_MS - 1) > 0);
  check('counts down', wait('a@b.com', T0 + COOLDOWN_MS / 2) < wait('a@b.com', T0 + 1));
}

// --- 2. it expires exactly on time ----------------------------------------
console.log('');
console.log('2. It expires at the boundary');
{
  const wait = makeResendWaitMs({ lastCodeEmail: 'a@b.com', lastCodeRequestAt: T0 });

  check('allows at exactly the cooldown', wait('a@b.com', T0 + COOLDOWN_MS) === 0, `got ${wait('a@b.com', T0 + COOLDOWN_MS)}`);
  check('allows after the cooldown', wait('a@b.com', T0 + COOLDOWN_MS + 1) === 0);
  check('allows long after', wait('a@b.com', T0 + COOLDOWN_MS * 10) === 0);
  check('never returns a negative wait', wait('a@b.com', T0 + COOLDOWN_MS * 100) === 0);
}

// --- 3. a different address is never blocked ------------------------------
// The cooldown is per-address on the server, so typing another address must not
// be held back by the previous one.
console.log('');
console.log('3. A different address is not blocked');
{
  const wait = makeResendWaitMs({ lastCodeEmail: 'a@b.com', lastCodeRequestAt: T0 });

  check('a different address is allowed immediately', wait('other@b.com', T0) === 0, `got ${wait('other@b.com', T0)}`);
  check('a different address is allowed mid-cooldown', wait('other@b.com', T0 + 1000) === 0);
  check('the original address is still blocked', wait('a@b.com', T0 + 1000) > 0);
}

// --- 4. the very first request is never blocked ---------------------------
console.log('');
console.log('4. No prior send means no wait');
{
  const fresh = makeResendWaitMs({ lastCodeEmail: '', lastCodeRequestAt: 0 });

  check('first request is allowed', fresh('a@b.com', T0) === 0, `got ${fresh('a@b.com', T0)}`);
  check('empty email is allowed through (validation happens elsewhere)', fresh('', T0) === 0);
}

// --- 5. the wait never exceeds the cooldown -------------------------------
console.log('');
console.log('5. The wait is bounded by the cooldown');
{
  const wait = makeResendWaitMs({ lastCodeEmail: 'a@b.com', lastCodeRequestAt: T0 });

  check('immediately after is at most the cooldown', wait('a@b.com', T0) <= COOLDOWN_MS, `got ${wait('a@b.com', T0)}`);
  check('immediately after is essentially the cooldown', wait('a@b.com', T0) === COOLDOWN_MS);
}

// --- 6. the guard is actually wired into requestCode ----------------------
// The pure function is useless if nothing calls it, which is precisely how the
// original bug survived: the dialog had no cooldown check at all.
console.log('');
console.log('6. The dialog actually uses it');
{
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  check('requestCode consults resendWaitMs', /const\s+waitMs\s*=\s*resendWaitMs\(/.test(code));
  check('requestCode returns early on a wait', /if\s*\(\s*waitMs\s*>\s*0\s*\)/.test(code));
  check('the cooldown countdown calls resendWaitMs', /Math\.ceil\(resendWaitMs\(/.test(code));
  check('the resend control is disabled during the countdown', /resend\.disabled\s*=\s*true/.test(code));
  check('the resend control is re-enabled when it expires', /resend\.disabled\s*=\s*false/.test(code));
  check('the local cooldown is armed only after a send is accepted',
    /lastCodeRequestAt\s*=\s*Date\.now\(\)/.test(code));
}

console.log('');
console.log(`===== ${passed} passed, ${failed} failed =====`);
process.exit(failed === 0 ? 0 : 1);
