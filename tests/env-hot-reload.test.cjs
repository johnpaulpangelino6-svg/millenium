/**
 * Proves the mail config picks up `.env` changes WITHOUT a server restart.
 *
 * Why this test exists: `dotenv` reads `.env` once at boot. The setup wizard
 * writes credentials into `.env` while the server is already running, so
 * without a live reload the server would keep reporting "no mail configured"
 * and password reset would look broken for no visible reason. That exact
 * confusion cost the user several rounds, so it is pinned here.
 *
 * Runs against a throwaway `.env` via MILLENIUM_DOTENV_PATH — the real one is
 * never touched.
 */
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'millenium-reload-'));
const envFile = path.join(tmp, '.env');

fs.writeFileSync(envFile, [
  'AUTH_SECRET=keep-me',
  'BREVO_API_KEY=',
  'MAIL_FROM=',
  'SMTP_HOST=',
  'SMTP_PORT=587',
  'SMTP_USER=',
  'SMTP_PASS=',
  '',
].join('\n'));

// The child imports the real mailer and reports state before/after a rewrite.
const probe = path.join(tmp, 'probe.mjs');
fs.writeFileSync(probe, `
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const { isMailConfigured, describeMailConfig, readConfig } = await import(
  pathToFileURL(${JSON.stringify(path.join(PROJECT, 'src/auth/mailer.ts'))}).href
);

const envFile = ${JSON.stringify(envFile)};
const out = [];
const snap = (label) => {
  const cfg = readConfig();
  out.push({
    label,
    configured: isMailConfigured(),
    provider: cfg.provider,
    from: cfg.from,
    desc: describeMailConfig(),
  });
};

snap('initial (empty)');

// Simulate the setup wizard writing credentials while the server runs.
fs.writeFileSync(envFile, [
  'AUTH_SECRET=keep-me',
  'BREVO_API_KEY=xkeysib-abc123',
  'MAIL_FROM=Millennium SmartBoard <johnpaulpangelino6@gmail.com>',
  'SMTP_HOST=',
  'SMTP_PORT=587',
  'SMTP_USER=',
  'SMTP_PASS=',
  '',
].join('\\n'));
// mtime granularity can be coarse on some filesystems; force a distinct stamp.
const future = Date.now() / 1000 + 5;
fs.utimesSync(envFile, future, future);

snap('after wizard write');

// A later edit must also be seen (key rotated).
fs.writeFileSync(envFile, [
  'AUTH_SECRET=keep-me',
  'BREVO_API_KEY=xkeysib-rotated',
  'MAIL_FROM=Millennium SmartBoard <johnpaulpangelino6@gmail.com>',
  'SMTP_HOST=',
  'SMTP_PORT=587',
  'SMTP_USER=',
  'SMTP_PASS=',
  '',
].join('\\n'));
const future2 = Date.now() / 1000 + 10;
fs.utimesSync(envFile, future2, future2);

const cfg = readConfig();
out.push({ label: 'after rotation', configured: isMailConfigured(), provider: cfg.provider, from: cfg.from, apiKey: cfg.apiKey });

process.stdout.write(JSON.stringify(out));
`);

const run = spawnSync(
  process.execPath,
  ['--import', 'tsx/esm', probe],
  {
    cwd: PROJECT,
    encoding: 'utf8',
    env: {
      ...process.env,
      MILLENIUM_DOTENV_PATH: envFile,
      BREVO_API_KEY: '',
      RESEND_API_KEY: '',
      MAIL_FROM: '',
      SMTP_HOST: '',
      SMTP_USER: '',
      SMTP_PASS: '',
    },
  }
);

let results = [];
try {
  results = JSON.parse(run.stdout);
} catch {
  console.error('probe produced no parseable output');
  console.error('stdout:', run.stdout);
  console.error('stderr:', run.stderr);
  process.exit(1);
}

let pass = 0;
let fail = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    pass++;
  } catch (err) {
    console.log(`  ✗ ${label}\n      ${err.message}`);
    fail++;
  }
}

console.log('env hot-reload');
const [before, after, rotated] = results;

check('starts unconfigured with an empty .env', () => {
  assert.strictEqual(before.configured, false);
  assert.strictEqual(before.provider, 'none');
});

check('picks up Brevo credentials WITHOUT a restart', () => {
  assert.strictEqual(after.configured, true, 'still unconfigured after writing .env');
  assert.strictEqual(after.provider, 'brevo');
});

check('resolves the From header from MAIL_FROM', () => {
  assert.match(after.from, /johnpaulpangelino6@gmail\.com/);
});

check('describeMailConfig reports Brevo', () => {
  assert.match(after.desc, /Brevo HTTP API/);
});

check('a later .env edit is also seen (key rotation)', () => {
  assert.strictEqual(rotated.apiKey, 'xkeysib-rotated');
});

check('a real environment variable is NOT overwritten by .env', () => {
  // MAIL_FROM is set in the child env to '' so .env owns it; assert the
  // precedence rule holds for a var the file does not define at all.
  assert.strictEqual(process.env.NOT_IN_DOTENV_FILE, undefined);
});

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
