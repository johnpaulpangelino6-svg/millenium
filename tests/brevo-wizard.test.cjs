/**
 * Tests for the Brevo connection wizard's decision logic.
 *
 * The wizard is what a non-expert runs to get password-reset mail working, so
 * its branching is worth testing properly — especially the case it exists for:
 * a VALID key with NO verified sender. Brevo only reports that at send time, as
 * a rejected sender, which is the most confusing failure to hit blind.
 *
 * These call brevo-lib.mjs directly with an injected `fetch` rather than
 * spawning the CLI against a mock server. Reason: this sandbox routes outbound
 * connections through a proxy that does not forward to a sibling process's
 * localhost port, so a mock server in the test process is unreachable from a
 * child process. Injecting fetch tests the same branching with no network.
 *
 * Run: node tests/brevo-wizard.test.cjs
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const LIB = pathToFileURL(path.join(__dirname, '..', 'src', 'tools', 'brevo-lib.mjs')).href;

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

/** Build a fake fetch that answers Brevo's endpoints from a scenario table. */
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    calls.push({ url, key: opts.headers?.['api-key'], method: opts.method || 'GET' });
    for (const [match, responder] of Object.entries(routes)) {
      if (url.includes(match)) {
        const { status = 200, body = {} } = responder;
        return {
          ok: status >= 200 && status < 300,
          status,
          json: async () => body,
          text: async () => JSON.stringify(body),
        };
      }
    }
    return { ok: false, status: 404, json: async () => ({ message: 'not found' }), text: async () => 'not found' };
  };
  impl.calls = calls;
  return impl;
}

const GOOD_KEY = 'xkeysib-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SENDER = { id: 1, name: 'Millennium SmartBoard', email: 'johnpaulpangelino6@gmail.com', active: true };

(async () => {
  const lib = await import(LIB);
  const {
    validateKey, listSenders, usableSenders, pickSender,
    formatFrom, writeEnvValues, explainBrevoError, BREVO_API_DEFAULT,
  } = lib;

  console.log('Brevo wizard logic');
  console.log('==================');
  console.log('');

  // --- 1. key validation --------------------------------------------------
  console.log('1. validateKey');
  {
    const good = await validateKey('https://x/v3', GOOD_KEY, fakeFetch({ '/account': { body: { email: 'a@b.com' } } }));
    check('accepts a good key', good.ok === true, JSON.stringify(good));
    check('returns the account', good.account?.email === 'a@b.com');

    const f = fakeFetch({ '/account': { status: 401, body: { message: 'Key not found' } } });
    const bad = await validateKey('https://x/v3', 'xkeysib-wrong', f);
    check('rejects a 401', bad.ok === false);
    check('says the key was rejected', /Brevo rejected the key \(HTTP 401\)/.test(bad.error), bad.error);
    check('points at the API Keys page', /SMTP & API → API Keys/.test(bad.error));
    check('sends the key in the api-key header', f.calls[0]?.key === 'xkeysib-wrong');

    const net = await validateKey('https://x/v3', GOOD_KEY, async () => { throw new Error('getaddrinfo ENOTFOUND'); });
    check('explains a network failure', /Could not reach api\.brevo\.com/.test(net.error), net.error);
    check('mentions VPN/proxy for network failures', /VPN\/proxy/.test(net.error));
  }

  // --- 2. sender listing --------------------------------------------------
  console.log('');
  console.log('2. listSenders');
  {
    const wrapped = await listSenders('https://x/v3', GOOD_KEY, fakeFetch({ '/senders': { body: { senders: [SENDER] } } }));
    check('parses { senders: [...] }', wrapped.ok && wrapped.senders.length === 1);

    const bare = await listSenders('https://x/v3', GOOD_KEY, fakeFetch({ '/senders': { body: [SENDER] } }));
    check('also parses a bare array', bare.ok && bare.senders.length === 1);

    const empty = await listSenders('https://x/v3', GOOD_KEY, fakeFetch({ '/senders': { body: { senders: [] } } }));
    check('reports an empty list without erroring', empty.ok && empty.senders.length === 0);

    const denied = await listSenders('https://x/v3', GOOD_KEY, fakeFetch({ '/senders': { status: 403, body: {} } }));
    check('a 403 is non-fatal (ok:false, senders:[])', denied.ok === false && denied.senders.length === 0);

    const partial = await listSenders('https://x/v3', GOOD_KEY,
      fakeFetch({ '/senders': { body: { senders: [SENDER, { id: 9, name: 'NoEmail' }] } } }));
    check('drops entries with no email', partial.senders.length === 1);
  }

  // --- 3. usableSenders ---------------------------------------------------
  console.log('');
  console.log('3. usableSenders');
  {
    check('keeps active senders', usableSenders([SENDER]).length === 1);
    check('drops explicitly inactive senders', usableSenders([{ ...SENDER, active: false }]).length === 0);
    check('treats a missing active flag as usable', usableSenders([{ id: 2, email: 'x@y.com' }]).length === 1);
  }

  // --- 4. pickSender ------------------------------------------------------
  console.log('');
  console.log('4. pickSender');
  {
    const many = [
      { id: 1, name: 'Other', email: 'other@example.com', active: true },
      SENDER,
    ];
    check('prefers the app account over the first entry',
      pickSender(many, 'johnpaulpangelino6@gmail.com')?.email === 'johnpaulpangelino6@gmail.com');
    check('matches the preferred address case-insensitively',
      pickSender(many, 'JOHNPAULPANGELINO6@GMAIL.COM')?.email === 'johnpaulpangelino6@gmail.com');
    check('falls back to the first when nothing matches',
      pickSender(many, 'nobody@nowhere.com')?.email === 'other@example.com');
    check('returns null for an empty list', pickSender([], 'a@b.com') === null);
    // A regex metacharacter in the address must not break the match.
    const dotted = [{ id: 3, email: 'a.b+tag@example.com', active: true }];
    check('handles regex metacharacters in the address',
      pickSender(dotted, 'a.b+tag@example.com')?.email === 'a.b+tag@example.com');
  }

  // --- 5. formatFrom ------------------------------------------------------
  console.log('');
  console.log('5. formatFrom');
  {
    check('uses the Brevo sender name', formatFrom(SENDER) === 'Millennium SmartBoard <johnpaulpangelino6@gmail.com>');
    check('synthesises a name when absent', formatFrom({ email: 'x@y.com' }) === 'Millennium SmartBoard <x@y.com>');
    check('tolerates a blank name', formatFrom({ name: '   ', email: 'x@y.com' }) === 'Millennium SmartBoard <x@y.com>');
  }

  // --- 6. explainBrevoError ----------------------------------------------
  console.log('');
  console.log('6. explainBrevoError');
  {
    check('402 mentions activation', /needs activating/.test(explainBrevoError(402, {})));
    check('429 mentions rate limiting', /rate-limited/.test(explainBrevoError(429, {})));
    check('includes the API message when present', /Key not found/.test(explainBrevoError(500, { message: 'Key not found' })));
    check('still readable with no body', /HTTP 500/.test(explainBrevoError(500, null)));
  }

  // --- 7. writeEnvValues (real filesystem, temp dir) ---------------------
  console.log('');
  console.log('7. writeEnvValues');
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brevo-env-'));
    const envPath = path.join(dir, '.env');
    fs.writeFileSync(envPath, 'AUTH_SECRET=keepme\nBREVO_API_KEY=\nMAIL_FROM=\nSMTP_PASS=\n');

    const r = writeEnvValues(envPath, { BREVO_API_KEY: GOOD_KEY, MAIL_FROM: 'A <a@b.com>' });
    const after = fs.readFileSync(envPath, 'utf8');

    check('updates existing keys', /^BREVO_API_KEY=xkeysib-a+$/m.test(after));
    check('sets MAIL_FROM', /^MAIL_FROM=A <a@b\.com>$/m.test(after));
    check('preserves unrelated keys', /^AUTH_SECRET=keepme$/m.test(after));
    check('preserves an empty SMTP_PASS', /^SMTP_PASS=$/m.test(after));
    check('reports what it touched', r.updated.includes('BREVO_API_KEY') && r.updated.includes('MAIL_FROM'));

    const backups = fs.readdirSync(dir).filter((f) => f.startsWith('.env.backup-'));
    check('created exactly one backup', backups.length === 1, `${backups.length}`);
    check('backup holds the ORIGINAL contents',
      fs.readFileSync(path.join(dir, backups[0]), 'utf8').includes('BREVO_API_KEY=\n'));

    // A key absent from the file must be appended, not silently dropped.
    const r2 = writeEnvValues(envPath, { MAIL_SETUP_TEST: 'yes' });
    const after2 = fs.readFileSync(envPath, 'utf8');
    check('appends a key that was missing', /^MAIL_SETUP_TEST=yes$/m.test(after2));
    check('flags appended keys', r2.updated.some((k) => k.includes('appended')));

    fs.rmSync(dir, { recursive: true, force: true });
  }

  // --- 8. the default API base is the real one ---------------------------
  console.log('');
  console.log('8. Defaults');
  {
    check('points at the real Brevo API', BREVO_API_DEFAULT === 'https://api.brevo.com/v3', BREVO_API_DEFAULT);
  }

  // --- 9. normalizeKey ---------------------------------------------------
  // Brevo's two secrets differ by one letter, and a paste can carry quotes or
  // a hard wrap. Getting this wrong produced a real, confusing 401.
  console.log('');
  console.log('9. normalizeKey');
  {
    const { normalizeKey, keyKind, keyShapeWarning } = lib;

    check('leaves a clean key untouched', normalizeKey(GOOD_KEY).key === GOOD_KEY);
    check('reports no change for a clean key', normalizeKey(GOOD_KEY).changed === false);

    check('strips surrounding double quotes', normalizeKey(`"${GOOD_KEY}"`).key === GOOD_KEY);
    check('strips surrounding single quotes', normalizeKey(`'${GOOD_KEY}'`).key === GOOD_KEY);
    check('strips surrounding whitespace', normalizeKey(`  ${GOOD_KEY}\n`).key === GOOD_KEY);
    check('repairs a hard-wrapped paste', normalizeKey('xkeysib-aaaa\nbbbb').key === 'xkeysib-aaaabbbb');
    check('repairs an interior space', normalizeKey('xkeysib-aa aa').key === 'xkeysib-aaaa');
    check('flags a quoted paste as changed', normalizeKey(`"${GOOD_KEY}"`).changed === true);
    check('flags the quote specifically', normalizeKey(`"${GOOD_KEY}"`).hadQuotes === true);
    check('flags interior space specifically', normalizeKey('xkeysib-aa aa').hadInnerSpace === true);
    check('handles null', normalizeKey(null).key === '');
    check('handles undefined', normalizeKey(undefined).key === '');

    // --- keyKind: the distinction that causes the 401 ---------------------
    check('recognises an API key', keyKind(GOOD_KEY) === 'api');
    check('recognises an SMTP key', keyKind('xsmtpsib-abc123') === 'smtp');
    check('reports an unknown shape', keyKind('totally-wrong') === 'unknown');
    check('treats empty as unknown', keyKind('') === 'unknown');

    // --- keyShapeWarning: fail fast, with the exact fix -------------------
    check('no warning for a good API key', keyShapeWarning(GOOD_KEY) === null);

    const smtpWarn = keyShapeWarning('xsmtpsib-abc123');
    check('warns on an SMTP key', typeof smtpWarn === 'string' && smtpWarn.length > 0);
    check('names the SMTP prefix', /xsmtpsib-/.test(smtpWarn), smtpWarn);
    check('says it is not an API key', /not an API key/.test(smtpWarn), smtpWarn);
    check('points at the API Keys tab', /API Keys/.test(smtpWarn), smtpWarn);

    const oddWarn = keyShapeWarning('random-value');
    check('warns on an unrecognised shape', /does not start with "xkeysib-"/.test(oddWarn), oddWarn);
  }

  // --- 10. the 401 message adapts to the key type ------------------------
  console.log('');
  console.log('10. 401 diagnosis by key type');
  {
    const { explainBrevoError } = lib;

    const smtpMsg = explainBrevoError(401, { message: 'Key not found' }, 'xsmtpsib-abc123');
    check('names the SMTP key for a 401 on an xsmtpsib- key', /SMTP key/.test(smtpMsg), smtpMsg);
    check('does not tell an SMTP-key user to regenerate blindly', !/copied incompletely/.test(smtpMsg));

    const apiMsg = explainBrevoError(401, { message: 'Key not found' }, 'xkeysib-short');
    check('still says copied incompletely for an API-shaped key', /copied incompletely/.test(apiMsg));
    check('mentions both prefixes for an API-shaped key', /xkeysib-/.test(apiMsg) && /xsmtpsib-/.test(apiMsg), apiMsg);

    const legacy = explainBrevoError(401, { message: 'nope' });
    check('still works when no key is passed', /Brevo rejected the key/.test(legacy));
  }

  // --- 11. validateKey surfaces the SMTP-key diagnosis -------------------
  console.log('');
  console.log('11. validateKey passes the key through to the diagnosis');
  {
    const f = fakeFetch({ '/account': { status: 401, body: { message: 'Key not found' } } });
    const r = await validateKey('https://x/v3', 'xsmtpsib-abc123', f);
    check('rejects the SMTP key', r.ok === false);
    check('explains it is an SMTP key', /SMTP key/.test(r.error), r.error);
  }

  // --- 12. the IP-allowlist 401 (a real trap this user hit) --------------
  // Brevo answers with 401 for an unlisted IP, identical to a bad key. The
  // obvious response — regenerate the key — would not help at all.
  console.log('');
  console.log('12. IP-allowlist 401 is distinguished from a bad key');
  {
    const { explainBrevoError } = lib;
    const brevoSays = {
      message: 'We have detected you are using an unrecognised IP address 112.203.36.205. ' +
        'If you performed this action make sure to add the new IP address in this link: ' +
        'https://app.brevo.com/security/authorised_ips',
      code: 'unauthorized',
    };

    const msg = explainBrevoError(401, brevoSays, GOOD_KEY);
    check('names the IP allowlist', /allowlist/.test(msg), msg);
    check('extracts the offending IP', /112\.203\.36\.205/.test(msg), msg);
    check('tells the user the key is fine', /key is FINE/.test(msg), msg);
    check('says not to regenerate the key', /Do not regenerate/.test(msg), msg);
    check('links to the authorised IPs page', /security\/authorised_ips/.test(msg), msg);
    check('gives the exact Brevo click path', /Deactivate for API/.test(msg), msg);
    check('explains the 30-day auto-activation', /30 days/.test(msg), msg);
    check('points at the Brevo notification email as an easier route',
      /search your inbox for Brevo/.test(msg), msg);
    check('does NOT blame an incomplete copy', !/copied incompletely/.test(msg), msg);

    // Spelling variant and the authorized/authorised mix must both be caught.
    check('catches the American spelling',
      /allowlist/.test(explainBrevoError(401, { message: 'unrecognized IP address 1.2.3.4' }, GOOD_KEY)));
    check('catches a bare authorised_ips mention',
      /allowlist/.test(explainBrevoError(401, { message: 'see authorised_ips settings' }, GOOD_KEY)));

    // The key-type branch must still win when there is no IP message.
    check('a plain 401 is still treated as a key problem',
      /copied incompletely/.test(explainBrevoError(401, { message: 'Key not found' }, GOOD_KEY)));
  }

  // --- 13. listSenders explains a failure instead of just a status -------
  console.log('');
  console.log('13. listSenders failure carries the real reason');
  {
    const ipBody = { message: 'We have detected you are using an unrecognised IP address 5.6.7.8. authorised_ips' };
    const r = await listSenders('https://x/v3', GOOD_KEY, fakeFetch({ '/senders': { status: 401, body: ipBody } }));
    check('reports failure', r.ok === false);
    check('explains the allowlist, not just the status', /allowlist/.test(r.error), r.error);
    check('returns an empty sender list', Array.isArray(r.senders) && r.senders.length === 0);
  }

  console.log('');
  console.log(`===== ${passed} passed, ${failed} failed =====`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error('Harness failure:', err);
  process.exit(1);
});
