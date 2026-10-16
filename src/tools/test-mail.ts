import 'dotenv/config';
import {
  isMailConfigured,
  verifyMailConnection,
  sendPasswordResetCode,
  readConfig,
  describeMailConfig,
} from '../auth/mailer.js';

/**
 * Password-reset mail diagnostics.
 *
 *   npm run mail:test                    -> check credentials/reachability only
 *   npm run mail:test you@gmail.com      -> also deliver a real message
 *
 * This deliberately bypasses the app. When "forgot password" is not delivering,
 * the two candidate causes are "the credentials are wrong" and "the app logic is
 * wrong" — running this first settles which one it is in a few seconds, instead
 * of reading reset codes out of the API response and guessing.
 */

const target = process.argv[2];

function maskSecret(raw: string): string {
  const compact = raw.replace(/\s+/g, '');
  if (!compact) return '(empty)';
  const hadSpaces = /\s/.test(raw.trim()) && compact.length === 16;
  return `(set, ${compact.length} characters${hadSpaces ? ' — formatting spaces stripped' : ''})`;
}

(async () => {
  const cfg = readConfig();

  console.log('Password-reset mail check');
  console.log('========================');
  console.log(`  transport   ${cfg.provider}`);
  console.log(`  resolved    ${describeMailConfig()}`);
  console.log('');

  if (cfg.provider === 'smtp') {
    console.log(`  SMTP_HOST   ${cfg.host || '(empty)'}`);
    console.log(`  SMTP_PORT   ${cfg.port}`);
    console.log(`  SMTP_USER   ${cfg.user || '(empty)'}`);
    console.log(`  SMTP_PASS   ${maskSecret(cfg.pass)}`);
    console.log(`  sender      ${cfg.from || '(empty)'}`);
  } else if (cfg.provider === 'brevo' || cfg.provider === 'resend') {
    console.log(`  ${cfg.provider.toUpperCase()}_API_KEY  ${maskSecret(cfg.apiKey)}`);
    console.log(`  sender      ${cfg.from || '(empty)'}`);
  } else {
    console.log('  BREVO_API_KEY   (empty)');
    console.log('  RESEND_API_KEY  (empty)');
    console.log('  SMTP_USER       (empty)');
    console.log('  SMTP_PASS       (empty)');
  }
  console.log(`  NODE_ENV    ${process.env.NODE_ENV || '(unset)'}`);
  console.log('');

  if (!isMailConfigured()) {
    console.error('✗ NOT CONFIGURED — no mail can be sent.');
    console.error('');
    console.error('  EASIEST — Brevo, needs no App Password and no 2-Step Verification:');
    console.error('    1. Sign up at https://www.brevo.com (free, 300 emails/day)');
    console.error('    2. Senders & IP  ->  Senders  ->  add and verify the address you send from');
    console.error('    3. SMTP & API    ->  API Keys  ->  generate a key');
    console.error('    4. Put it in .env:   BREVO_API_KEY=xkeysib-...');
    console.error('       and optionally:   MAIL_FROM=Millennium SmartBoard <you@gmail.com>');
    console.error('');
    console.error('  ALTERNATIVE — Gmail SMTP, needs 2-Step Verification switched on first:');
    console.error('    SMTP_HOST=smtp.gmail.com');
    console.error('    SMTP_PORT=587');
    console.error('    SMTP_USER=<the gmail that sends>');
    console.error('    SMTP_PASS=<16-character Google App Password>');
    console.error('    https://myaccount.google.com/apppasswords');
    console.error('');
    console.error('  A normal Gmail password will NOT work — Google requires an App Password.');
    process.exit(1);
  }

  console.log(`1. Checking ${cfg.provider} credentials...`);
  const check = await verifyMailConnection();
  if (!check.ok) {
    console.error(`✗ ${check.error}`);
    process.exit(1);
  }
  console.log('   ✓ Credentials accepted — the transport is usable.');
  console.log('');

  if (!target) {
    console.log('2. No address supplied, so no message was sent.');
    console.log('');
    console.log('   To deliver a real test message:');
    console.log('     npm run mail:test you@gmail.com');
    return;
  }

  console.log(`2. Delivering a real test message to ${target}...`);
  // The code is fixed and obviously fake so a test message can never be
  // mistaken for a live reset.
  const result = await sendPasswordResetCode(target, '000000', 'Test');
  if (result.delivered) {
    console.log(`   ✓ Sent via ${cfg.provider}. Check the inbox (and the spam folder) for ${target}.`);
  } else {
    console.error(`   ✗ Send failed: ${result.error || 'unknown error'}`);
    process.exit(1);
  }
})().catch((err) => {
  console.error('Unexpected failure:', err?.message || err);
  process.exit(1);
});
