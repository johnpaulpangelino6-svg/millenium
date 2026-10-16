/**
 * One-shot mail credential writer for the password-reset mailer.
 *
 *   # Brevo (easiest — no App Password, no 2-Step Verification)
 *   node src/tools/setup-mail.mjs --brevo "xkeysib-..." --from "you@gmail.com"
 *
 *   # Gmail SMTP
 *   node src/tools/setup-mail.mjs --user you@gmail.com --pass "abcd efgh ijkl mnop"
 *
 *   # Resend
 *   node src/tools/setup-mail.mjs --resend "re_..." --from "you@gmail.com"
 *
 * Why this exists: .env is hand-edited and easy to get subtly wrong (stray
 * quotes, a trailing space, the App Password's cosmetic spaces kept in). This
 * writes the keys deterministically, backs the file up first, and never prints
 * a secret back out.
 *
 * Google App Passwords are exactly 16 characters once spaces are removed.
 * Anything else is almost certainly a normal account password, which Gmail
 * rejects with "535-5.7.8 Username and Password not accepted" — so we flag it
 * here rather than letting it fail later at the SMTP layer.
 */

import fs from 'node:fs';
import path from 'node:path';

const ENV_PATH = path.resolve(process.cwd(), '.env');

function parseArgs(argv) {
  const out = { host: 'smtp.gmail.com', port: '587', from: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === '--user' && val) { out.user = val; i += 1; }
    else if (key === '--pass' && val) { out.pass = val; i += 1; }
    else if (key === '--brevo' && val) { out.brevo = val; i += 1; }
    else if (key === '--resend' && val) { out.resend = val; i += 1; }
    else if (key === '--from' && val) { out.from = val; i += 1; }
    else if (key === '--host' && val) { out.host = val; i += 1; }
    else if (key === '--port' && val) { out.port = val; i += 1; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const usingApiKey = Boolean(args.brevo || args.resend);

if (!usingApiKey && (!args.user || !args.pass)) {
  console.error('Usage:');
  console.error('  node src/tools/setup-mail.mjs --brevo "xkeysib-..." --from you@gmail.com');
  console.error('  node src/tools/setup-mail.mjs --resend "re_..."    --from you@gmail.com');
  console.error('  node src/tools/setup-mail.mjs --user you@gmail.com --pass "abcd efgh ijkl mnop"');
  process.exit(1);
}

if (args.brevo && args.resend) {
  console.error('✗ Pass only one of --brevo or --resend; the first configured key wins anyway.');
  process.exit(1);
}

if (!fs.existsSync(ENV_PATH)) {
  console.error(`✗ No .env found at ${ENV_PATH}`);
  process.exit(1);
}

/** Only rewrite the keys this run is actually responsible for. */
const values = {};

if (args.brevo) {
  values.BREVO_API_KEY = args.brevo.trim();
  // A Brevo key alone cannot send: the sender address must be verified in their
  // dashboard, so require it rather than letting the first send fail.
  if (!args.from.trim()) {
    console.error('✗ Brevo also needs a verified sender. Add --from you@gmail.com');
    console.error('  (verify it first under Senders & IP -> Senders)');
    process.exit(1);
  }
  values.MAIL_FROM = `Millennium SmartBoard <${args.from.trim()}>`;
}

if (args.resend) {
  values.RESEND_API_KEY = args.resend.trim();
  if (args.from.trim()) values.MAIL_FROM = `Millennium SmartBoard <${args.from.trim()}>`;
}

let pass = '';
let hadSpaces = false;

if (args.user && args.pass) {
  const user = args.user.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user)) {
    console.error(`✗ SMTP_USER does not look like an email address: ${user}`);
    process.exit(1);
  }
  // Google displays App Passwords grouped in fours for readability; the spaces
  // are cosmetic and must not be sent to the server.
  pass = args.pass.replace(/\s+/g, '');
  hadSpaces = /\s/.test(args.pass.trim());
  Object.assign(values, {
    SMTP_HOST: args.host,
    SMTP_PORT: args.port,
    SMTP_USER: user,
    SMTP_PASS: pass,
    SMTP_FROM: args.from.trim(),
  });
  if (!args.from.trim()) values.MAIL_FROM = `Millennium SmartBoard <${user}>`;
}

const original = fs.readFileSync(ENV_PATH, 'utf8');
let text = original;
const written = [];
const added = [];

for (const [key, value] of Object.entries(values)) {
  // Match the key at the start of a line, whether or not it currently has a value.
  const line = new RegExp(`^${key}=.*$`, 'm');
  if (line.test(text)) {
    text = text.replace(line, `${key}=${value}`);
    written.push(key);
  } else {
    text = `${text.replace(/\s*$/, '')}\n${key}=${value}\n`;
    added.push(key);
  }
}

// Back up before the first overwrite so a typo is always recoverable.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = `${ENV_PATH}.backup-${stamp}`;
fs.copyFileSync(ENV_PATH, backup);

fs.writeFileSync(ENV_PATH, text, 'utf8');

console.log('Mail credentials written to .env');
console.log('===============================');
if (values.BREVO_API_KEY) console.log(`  BREVO_API_KEY   (set, ${values.BREVO_API_KEY.length} characters)`);
if (values.RESEND_API_KEY) console.log(`  RESEND_API_KEY  (set, ${values.RESEND_API_KEY.length} characters)`);
if (values.SMTP_USER) {
  console.log(`  SMTP_HOST       ${values.SMTP_HOST}`);
  console.log(`  SMTP_PORT       ${values.SMTP_PORT}`);
  console.log(`  SMTP_USER       ${values.SMTP_USER}`);
  console.log(`  SMTP_PASS       (set, ${pass.length} characters${hadSpaces ? ' — formatting spaces stripped' : ''})`);
}
if (values.MAIL_FROM) console.log(`  MAIL_FROM       ${values.MAIL_FROM}`);
console.log('');
console.log(`  updated : ${written.join(', ') || '(none)'}`);
if (added.length) console.log(`  appended: ${added.join(', ')}`);
console.log(`  backup  : ${path.basename(backup)}`);
console.log('');

if (args.user && args.pass && pass.length !== 16) {
  console.log(`⚠  That password is ${pass.length} characters, not 16.`);
  console.log('   Google App Passwords are always 16 characters. If you pasted your');
  console.log('   normal Gmail password, login will fail with "535-5.7.8".');
  console.log('   Generate one at https://myaccount.google.com/apppasswords');
  console.log('   (2-Step Verification must be switched on first).');
  console.log('');
  console.log('   No App Password available? Brevo needs none:');
  console.log('     node src/tools/setup-mail.mjs --brevo "xkeysib-..." --from you@gmail.com');
  console.log('');
}

console.log('Done — no restart needed (the server re-reads .env automatically).');
console.log('Verify with:');
console.log(`  npm run mail:test ${args.from.trim() || args.user || 'you@gmail.com'}`);
