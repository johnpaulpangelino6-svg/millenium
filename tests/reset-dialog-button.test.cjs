/**
 * Regression test for the reset dialog's primary-button label.
 *
 * The bug: `busy()` restored the button label with
 *     primary.textContent = on ? (label || 'Working…') : primary.textContent;
 * The else-branch assigns the property to itself — a no-op — so the label set
 * on the way in ("Sending code…", "Verifying…", "Saving…") was never cleared.
 * The button stayed frozen on in-flight text forever, which made the dialog look
 * hung and hid the fact that it was ready to retry.
 *
 * There is no DOM library in this project (jsdom / puppeteer / linkedom are all
 * absent from node_modules), so rather than assert against a re-implementation
 * that could drift, this test EXTRACTS the real function bodies out of
 * public/js/app.js and executes them against a stub element. If someone reverts
 * the fix, or introduces a new step that sets primary.textContent directly
 * instead of going through setPrimaryLabel, this fails.
 *
 * Run: node tests/reset-dialog-button.test.cjs
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

/** Pull a top-level `function name(...) { ... }` out of the source by brace matching. */
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

console.log('Reset dialog button-label regression test');
console.log('=========================================');
console.log(`  source: ${path.relative(path.join(__dirname, '..'), APP_JS)}`);
console.log('');

// --- 1. the source must not contain the self-assignment no-op -------------
console.log('1. The self-assignment no-op is gone');
{
  // Strip comments first: the fix's explanatory comment quotes the old code.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const noop = /primary\.textContent\s*=\s*[^;\n]*?:\s*primary\.textContent/;
  check('no `… : primary.textContent` self-assignment', !noop.test(code));
}

// --- 2. every label change goes through setPrimaryLabel -------------------
console.log('');
console.log('2. Steps set their label via setPrimaryLabel');
{
  const setters = [...src.matchAll(/setPrimaryLabel\('([^']+)'\)/g)].map((m) => m[1]);
  check("renderStep1 sets 'Send code'", setters.includes('Send code'), `found: ${setters.join(', ')}`);
  check("renderStep2 sets 'Verify code'", setters.includes('Verify code'), `found: ${setters.join(', ')}`);
  check("renderStep3 sets 'Set new password'", setters.includes('Set new password'), `found: ${setters.join(', ')}`);

  // A step assigning primary.textContent directly would bypass restingLabel and
  // reintroduce the freeze on that step.
  const direct = [...src.matchAll(/^\s*primary\.textContent\s*=\s*'/gm)];
  check('no step assigns primary.textContent a literal', direct.length === 0,
    direct.length ? `${direct.length} direct assignment(s) found` : '');
}

// --- 3. execute the real bodies against a stub element -------------------
console.log('');
console.log('3. busy(false) restores the step label (executed from real source)');
{
  const restingDecl = /let restingLabel = '([^']*)';/.exec(src);
  check('restingLabel is declared with a default', Boolean(restingDecl));

  const harness = `
    ${extractFunction(src, 'setPrimaryLabel')}
    ${extractFunction(src, 'busy')}
    module.exports = { setPrimaryLabel, busy, getResting: () => restingLabel };
  `;
  const sandbox = {
    primary: { textContent: 'Send code', disabled: false },
    restingLabel: restingDecl ? restingDecl[1] : 'Send code',
    module: { exports: {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(harness, sandbox);
  const { setPrimaryLabel, busy, getResting } = sandbox.module.exports;
  const el = sandbox.primary;

  // Simulate the exact sequence the dialog performs on a failed request.
  setPrimaryLabel('Send code');
  check('restingLabel tracks the step', getResting() === 'Send code', `got ${getResting()}`);

  busy(true, 'Sending code…');
  check('in-flight label is applied', el.textContent === 'Sending code…', `got ${el.textContent}`);
  check('button is disabled in flight', el.disabled === true);

  busy(false);
  check('label is RESTORED after the request', el.textContent === 'Send code',
    `got "${el.textContent}" — the freeze bug is back`);
  check('button is re-enabled', el.disabled === false);

  // The other two steps must restore their own labels, not step 1's.
  setPrimaryLabel('Verify code');
  busy(true, 'Verifying…');
  busy(false);
  check("step 2 restores 'Verify code'", el.textContent === 'Verify code', `got "${el.textContent}"`);

  setPrimaryLabel('Set new password');
  busy(true, 'Saving…');
  busy(false);
  check("step 3 restores 'Set new password'", el.textContent === 'Set new password', `got "${el.textContent}"`);

  // A retry after the "no mail configured" error must be possible, which is the
  // real-world case that produced the screenshot.
  busy(true, 'Sending code…');
  busy(false);
  check('button is clickable again after a failed send', el.disabled === false && el.textContent === 'Set new password');
}

console.log('');
console.log(`===== ${passed} passed, ${failed} failed =====`);
process.exit(failed === 0 ? 0 : 1);
