/**
 * Interactive Brevo connection wizard.
 *
 *   npm run mail:brevo
 *
 * Why this exists: getting Brevo working is really three separate things that
 * fail in three different ways, and a raw SMTP error does not say which one is
 * wrong. This walks them in order and reports each verdict explicitly:
 *
 *   1. Is the API key valid?          -> GET /v3/account
 *   2. Is there a verified sender?    -> GET /v3/senders
 *   3. Which sender should we use?    -> auto-pick, or ask
 *
 * Then it writes .env and offers to send a real test message. Every failure
 * names the exact fix rather than surfacing a status code.
 *
 * The key is validated BEFORE it is written anywhere, so a typo cannot leave a
 * broken .env behind. The decision logic lives in brevo-lib.mjs so it can be
 * unit-tested; this file is the interactive shell around it.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  BREVO_API_DEFAULT,
  validateKey,
  listSenders,
  usableSenders,
  pickSender,
  formatFrom,
  writeEnvValues,
  explainBrevoError,
  normalizeKey,
  keyKind,
  keyShapeWarning,
} from './brevo-lib.mjs';

const ENV_PATH = path.resolve(process.cwd(), '.env');
// Overridable so the wizard can be pointed at a mock. Never set in normal use.
const API = (process.env.BREVO_API_BASE || BREVO_API_DEFAULT).replace(/\/+$/, '');
const APP_ACCOUNT = 'johnpaulpangelino6@gmail.com';

const rl = readline.createInterface({ input: stdin, output: stdout });
const c = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const ok = (s) => `${c.green}✓${c.reset} ${s}`;
const bad = (s) => `${c.red}✗${c.reset} ${s}`;
const warn = (s) => `${c.yellow}!${c.reset} ${s}`;

async function ask(question, fallback) {
  const suffix = fallback ? ` ${c.dim}[${fallback}]${c.reset}` : '';
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || fallback || '';
}

function bail(message) {
  console.error(message);
  rl.close();
  process.exit(1);
}

(async () => {
  console.log(`\n${c.bold}Connect Millennium SmartBoard to Brevo${c.reset}`);
  console.log('=====================================');
  console.log(`${c.dim}Free plan: 300 emails/day. No App Password, no 2-Step Verification.${c.reset}\n`);

  if (!fs.existsSync(ENV_PATH)) bail(bad(`No .env found at ${ENV_PATH}`));

  // --- Step 1: obtain the key -------------------------------------------
  let key = process.argv[2] || process.env.BREVO_API_KEY || '';
  if (!key) {
    console.log('Step 1 — the API key');
    console.log(`${c.dim}  Get it from: profile icon (top right) → SMTP & API → the "API Keys" tab${c.reset}`);
    console.log(`${c.dim}               → "Generate a new API key".${c.reset}`);
    console.log(`${c.dim}  It starts with "xkeysib-".${c.reset}`);
    console.log(`${c.yellow}  Not the "SMTP" tab — that key starts with "xsmtpsib-" and the API${c.reset}`);
    console.log(`${c.yellow}  rejects it.${c.reset}\n`);
    key = await ask('  Paste your Brevo API key');
  } else {
    console.log('Step 1 — the API key (taken from the command line / environment)');
  }

  const normalized = normalizeKey(key);
  key = normalized.key;
  if (!key) bail(bad('No key provided. Nothing was changed.'));

  // Repair a messy paste instead of failing on it. A key has no whitespace and
  // no surrounding quotes, so both are always safe to remove — and both are
  // easy to pick up from a browser copy or a wrapped terminal.
  if (normalized.changed) {
    const bits = [];
    if (normalized.hadQuotes) bits.push('surrounding quotes');
    if (normalized.hadInnerSpace) bits.push('spaces or line breaks');
    console.log(warn(`Cleaned up ${bits.join(' and ')} from the pasted key.`));
  }

  // Fail fast on a key that cannot work, rather than spending a request to
  // learn what the prefix already told us.
  const shapeWarning = keyShapeWarning(key);
  if (shapeWarning) {
    if (keyKind(key) === 'smtp') {
      console.log(bad(shapeWarning));
      console.log(`\n${c.dim}  Nothing was written to .env.${c.reset}\n`);
      rl.close();
      process.exit(1);
    }
    console.log(warn(shapeWarning));
    console.log(`${c.dim}  Continuing anyway — we will find out for certain in a moment.${c.reset}`);
  }
  console.log('');

  // --- Step 2: is the key real? -----------------------------------------
  console.log('Step 2 — validating the key against Brevo');
  const validated = await validateKey(API, key);
  if (!validated.ok) bail(`${bad(validated.error)}\n\nNothing was written to .env.`);

  const who = validated.account.email || validated.account.companyName || '(account name unavailable)';
  console.log(ok(`Key is valid — connected as ${c.bold}${who}${c.reset}`));
  console.log('');

  // --- Step 3: is there a verified sender? ------------------------------
  console.log('Step 3 — checking verified senders');
  const listed = await listSenders(API, key);
  if (!listed.ok) console.log(warn(listed.error));

  const usable = usableSenders(listed.senders);
  if (!usable.length) {
    console.error(bad('No verified sender address on this account.'));
    console.log('');
    console.log('  Brevo will refuse to send until one exists. Do this first:');
    console.log(`    ${c.bold}1.${c.reset} Left sidebar → ${c.bold}Senders, Domains & Dedicated IPs${c.reset}`);
    console.log(`    ${c.bold}2.${c.reset} Open the ${c.bold}Senders${c.reset} tab → ${c.bold}Add a sender${c.reset}`);
    console.log(`    ${c.bold}3.${c.reset} Enter a name and the address you want to send from`);
    console.log(`    ${c.bold}4.${c.reset} Click the confirmation link Brevo emails to that address`);
    console.log(`    ${c.bold}5.${c.reset} Run ${c.cyan}npm run mail:brevo${c.reset} again`);
    console.log('');
    console.log(warn('Do NOT use "Add a domain" / "Add your sending domain" for a'));
    console.log(`${c.dim}     @gmail.com address. A domain must be one you own and can add DNS${c.reset}`);
    console.log(`${c.dim}     records for — gmail.com is Google's, so it can never be verified.${c.reset}`);
    console.log(`${c.dim}     A single verified sender address is all this app needs.${c.reset}`);
    console.log('');
    console.log(`${c.dim}  The key itself is fine — it is already validated. Only the sender is missing.${c.reset}`);
    console.log(`${c.dim}  Nothing was written to .env.${c.reset}`);
    rl.close();
    process.exit(1);
  }

  console.log(ok(`Found ${usable.length} verified sender${usable.length > 1 ? 's' : ''}:`));
  usable.forEach((s, i) => console.log(`     ${i + 1}. ${s.name ? `${s.name} <${s.email}>` : s.email}`));
  console.log('');

  // --- Step 4: choose the sender ----------------------------------------
  let chosen = pickSender(usable, APP_ACCOUNT);
  if (usable.length > 1) {
    const pick = await ask(`  Which should send? (1-${usable.length})`, '1');
    const idx = Number(pick) - 1;
    if (usable[idx]) chosen = usable[idx];
  }

  const from = formatFrom(chosen);
  const senderEmail = chosen.email;
  console.log(`\n  Using: ${c.bold}${from}${c.reset}\n`);

  // --- Step 5: write .env -----------------------------------------------
  console.log('Step 5 — writing .env');
  const { updated, backup } = writeEnvValues(ENV_PATH, {
    BREVO_API_KEY: key,
    MAIL_FROM: from,
  });
  console.log(ok(`Updated: ${updated.join(', ')}`));
  console.log(`${c.dim}  Backup saved as ${backup}${c.reset}`);
  console.log('');

  // --- Step 6: offer a real test send -----------------------------------
  const testTo = await ask('Step 6 — send a real test email to which address?', senderEmail);
  if (testTo) {
    console.log(`\n  Sending to ${testTo} ...`);
    try {
      const res = await fetch(`${API}/smtp/email`, {
        method: 'POST',
        headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: chosen.name || 'Millennium SmartBoard', email: senderEmail },
          to: [{ email: testTo }],
          subject: 'Your Millennium SmartBoard password reset code',
          htmlContent:
            '<p>This is a test from the Millennium SmartBoard password-reset flow.</p>' +
            '<div style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:.3em;' +
            'background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:16px;text-align:center;">000000</div>' +
            '<p style="color:#64748b;font-size:13px;">Code 000000 is fake and cannot be used. ' +
            'If you are reading this, email delivery works.</p>',
          textContent: 'Test from Millennium SmartBoard. The code 000000 is fake. Email delivery works.',
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        console.log(ok(`Sent. Check the inbox (and spam) for ${testTo}.`));
      } else {
        const body = await res.text().catch(() => '');
        console.error(bad(explainBrevoError(res.status, { message: body.slice(0, 300) })));
      }
    } catch (err) {
      console.error(bad(`Send failed: ${err?.message || err}`));
    }
  }

  console.log(`\n${c.bold}Done. No restart needed.${c.reset}`);
  console.log(`${c.dim}  The server re-reads .env automatically, so the next password reset${c.reset}`);
  console.log(`${c.dim}  request will use these credentials.${c.reset}`);
  console.log(`  Confirm any time with:  ${c.cyan}npm run mail:test ${senderEmail}${c.reset}\n`);

  rl.close();
})().catch((err) => {
  console.error(`\nUnexpected failure: ${err?.message || err}`);
  rl.close();
  process.exit(1);
});
