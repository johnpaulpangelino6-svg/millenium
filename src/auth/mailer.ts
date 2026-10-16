import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Outbound mail for the password-reset flow.
 *
 * Three transports are supported, picked automatically from whichever
 * credentials are present. This exists because the two obvious ways to send
 * mail have very different friction:
 *
 *   SMTP (Gmail)  — needs a 16-character App Password, which in turn needs
 *                   2-Step Verification switched on. Nothing is mailable until
 *                   the user clears that hurdle.
 *   Brevo / Resend — an HTTP API key, no 2-Step Verification, no app password.
 *                   Brevo verifies a single sender *address*, so it can mail
 *                   arbitrary recipients without owning a domain — which is
 *                   what a password-reset flow actually needs.
 *
 * Resolution order: BREVO_API_KEY → RESEND_API_KEY → SMTP_*. The first one that
 * is fully configured wins, so adding an API key silently supersedes a
 * half-filled SMTP block rather than fighting with it.
 *
 * The reset code is NEVER returned to the caller, in any environment. It is
 * only ever emailed — or, when nothing is configured, written to this server's
 * console for an administrator to read and relay.
 *
 * Returning the code in the API response would mean anyone who can type an
 * email address into the sign-in screen could reset that account's password.
 * There is deliberately no client-side fallback, and none to switch back on:
 * see `issuePasswordResetCode`, which does not even carry the code in its
 * result type.
 *
 * Diagnosing a connection: run `npm run mail:test` (add an address to also
 * deliver a real message). It checks reachability and credentials without going
 * through the app, which separates "wrong credentials" from "wrong app logic".
 */

export type MailProvider = 'brevo' | 'resend' | 'smtp' | 'none';

export interface MailConfig {
  provider: MailProvider;
  /** smtp only */
  host: string;
  port: number;
  user: string;
  pass: string;
  /** brevo / resend only */
  apiKey: string;
  /** Ready-to-send From header, e.g. `Millennium SmartBoard <a@b.com>`. */
  from: string;
}

/**
 * Gmail displays App Passwords grouped for readability — "abcd efgh ijkl mnop" —
 * but the SMTP server wants the bare 16 characters. People paste exactly what
 * Google showed them, and the failure that follows is an opaque
 * "535-5.7.8 Username and Password not accepted", which reads like a wrong
 * password rather than a stray space.
 *
 * Only the 16-character App Password shape is compacted, so a genuine password
 * that happens to contain a space is left untouched.
 */
function normalizePassword(raw: string): string {
  const trimmed = raw.trim();
  const compact = trimmed.replace(/\s+/g, '');
  return compact.length === 16 && /\s/.test(trimmed) ? compact : trimmed;
}

/**
 * Live `.env` reload.
 *
 * `dotenv` reads `.env` exactly once, at boot, so credentials written *after*
 * the server started are invisible to it. That was a real trap: the setup
 * wizard writes `.env`, the running server keeps the old (empty) environment,
 * and password reset stays broken with no visible reason why. Worse,
 * `tsx watch` does not watch `.env`, so nothing would ever pick the change up.
 *
 * So the mail config re-reads `.env` whenever its mtime changes. Precedence
 * still matches dotenv: a value that came from the real environment (a shell
 * export, a Render dashboard variable) is never overwritten by the file.
 */
const DOTENV_PATH = process.env.MILLENIUM_DOTENV_PATH
  ? path.resolve(process.env.MILLENIUM_DOTENV_PATH)
  : path.resolve(process.cwd(), '.env');

/** Values this module has itself pushed into `process.env` from `.env`. */
const envOwned = new Map<string, string>();
let envMtime = 0;

function parseDotenv(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1);
    if (quoted) value = value.slice(1, -1);
    out.set(key, value);
  }
  return out;
}

function refreshEnvFromDotenv(): void {
  let mtime: number;
  try {
    mtime = fs.statSync(DOTENV_PATH).mtimeMs;
  } catch {
    return; // no .env (e.g. deployed, where vars come from the environment)
  }
  if (mtime === envMtime) return;
  envMtime = mtime;

  let parsed: Map<string, string>;
  try {
    parsed = parseDotenv(fs.readFileSync(DOTENV_PATH, 'utf8'));
  } catch {
    return;
  }

  for (const [key, value] of parsed) {
    const current = process.env[key];
    if (envOwned.has(key)) {
      // Already ours: the file is authoritative.
      if (current !== value) process.env[key] = value;
      envOwned.set(key, value);
      continue;
    }
    // First sighting. Adopt it only if nothing outside .env appears to own it —
    // an empty/absent value, or one that matches the file (which is what
    // dotenv itself would have loaded at boot).
    if (current === undefined || current === '' || current === value) {
      process.env[key] = value;
      envOwned.set(key, value);
    }
  }
}

const env = (key: string): string => (process.env[key] || '').trim();

/**
 * A shared sender, so an API-key setup does not have to also learn about
 * SMTP_FROM. Explicit MAIL_FROM wins; otherwise fall back to the SMTP vars so
 * existing configurations keep working unchanged.
 *
 * `onboarding@resend.dev` is Resend's shared test sender and is meaningful ONLY
 * on Resend — handing it to Brevo would produce a confusing "sender not
 * verified" error, so Brevo is left empty instead and fails with a message that
 * names the real fix.
 */
function resolveFrom(fallbackAddress: string, provider: MailProvider): string {
  const explicit = env('MAIL_FROM') || env('SMTP_FROM');
  if (explicit) return explicit;
  if (fallbackAddress) return `Millennium SmartBoard <${fallbackAddress}>`;
  if (provider === 'resend') return 'Millennium SmartBoard <onboarding@resend.dev>';
  return '';
}

export function readConfig(): MailConfig {
  refreshEnvFromDotenv();
  const smtpUser = env('SMTP_USER');
  const smtpPass = normalizePassword(process.env.SMTP_PASS || '');
  const smtpHost = env('SMTP_HOST');

  const brevoKey = env('BREVO_API_KEY');
  const resendKey = env('RESEND_API_KEY');

  if (brevoKey) {
    return {
      provider: 'brevo',
      host: '', port: 0, user: '', pass: '',
      apiKey: brevoKey,
      from: resolveFrom(env('MAIL_FROM') || smtpUser || env('BREVO_SENDER'), 'brevo'),
    };
  }

  if (resendKey) {
    return {
      provider: 'resend',
      host: '', port: 0, user: '', pass: '',
      apiKey: resendKey,
      from: resolveFrom(env('MAIL_FROM') || smtpUser, 'resend'),
    };
  }

  if (smtpHost && smtpUser && smtpPass) {
    return {
      provider: 'smtp',
      host: smtpHost,
      port: Number(env('SMTP_PORT') || 587),
      user: smtpUser,
      pass: smtpPass,
      apiKey: '',
      // Gmail rejects a From that is not the authenticated mailbox, so an unset
      // sender must fall back to SMTP_USER rather than to something arbitrary.
      // A display name is attached so the mail reads as the product instead of
      // as a bare gmail.com address; Gmail permits this as long as the address
      // itself is the authenticated account.
      from: resolveFrom(smtpUser, 'smtp'),
    };
  }

  return { provider: 'none', host: '', port: 0, user: '', pass: '', apiKey: '', from: '' };
}

/** Split `Name <a@b.com>` into its parts; a bare address yields an empty name. */
function splitFrom(from: string): { name: string; email: string } {
  const angled = from.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (angled) return { name: angled[1].replace(/^"|"$/g, '').trim(), email: angled[2].trim() };
  return { name: '', email: from.trim() };
}

/**
 * Turn a transport failure into something actionable. Raw errors are usually
 * opaque — "535-5.7.8" does not tell you that the fix is an App Password, and a
 * bare "401" does not tell you the key is wrong.
 */
export function explainMailError(err: any): string {
  const message = String(err?.message || err || 'unknown error');
  const responseCode = String(err?.responseCode || err?.status || err?.statusCode || '');

  // Brevo answers with 401 for an unlisted IP, which looks exactly like a bad
  // key. It is not: the key is fine and regenerating it would waste the user's
  // time. This must be checked before the generic 401 branch below.
  if (/unrecogni[sz]ed IP address|authori[sz]ed_ips/i.test(message)) {
    const ip = (message.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/) || [])[0];
    return `${message}\n     → Not a credential problem — the API key is valid.
       Brevo has "Authorized IPs" active and does not recognise this address${
         ip ? ` (${ip})` : ''
       }.
       Brevo switches this on by itself once an API key goes unused for 30
       days, so it can appear long after a key was created.
       Easiest fix: Brevo emails you every time it blocks an IP, and that
       notification has a "Deactivate" action — search your inbox for Brevo.
       Or turn it off in the dashboard:
         Settings > Security > Authorized IPs
         → "Blocking unauthorized IP addresses" → API keys row
         → "Deactivate for API" → confirm.
       Or open https://app.brevo.com/security/authorised_ips directly.
       Deactivating is usually the right call: home and server IPs change, so
       an allowlist breaks sending again later.`;
  }

  if (responseCode === '401' || responseCode === '403' || /unauthori[sz]ed|invalid api key|api key/i.test(message)) {
    return `${message}\n     → The provider rejected the API key. Check that BREVO_API_KEY /
       RESEND_API_KEY was copied whole and has not been revoked.`;
  }
  if (/sender|from address|not verified|domain is not verified/i.test(message)) {
    return `${message}\n     → The provider rejected the From address. Brevo needs the sender
       address verified under Senders; Resend needs a verified domain (or its
       onboarding@resend.dev test sender).`;
  }
  if (responseCode === '535' || /Username and Password not accepted|BadCredentials|Invalid login/i.test(message)) {
    return `${message}\n     → The mailbox rejected the login. For Gmail, SMTP_PASS must be a
       16-character App Password (2-Step Verification required), NOT the normal
       account password. Create one at https://myaccount.google.com/apppasswords
       — or switch to BREVO_API_KEY, which needs no App Password at all.`;
  }
  if (/self.signed|unable to verify|certificate|SSL|TLS/i.test(message)) {
    return `${message}\n     → TLS problem reaching the mail host. Check SMTP_PORT (587 = STARTTLS, 465 = implicit TLS).`;
  }
  if (/ETIMEDOUT|ECONNECTION|ESOCKET|EDNS|ENOTFOUND|timeout|fetch failed/i.test(message)) {
    return `${message}\n     → Could not reach the mail host. Check SMTP_HOST / SMTP_PORT and whether
       this network blocks outbound port 587 or 465.`;
  }
  if (/from address|553|Sender address rejected|not allowed to send/i.test(message)) {
    return `${message}\n     → The mail host rejected the From address. Gmail only permits the
       authenticated account (or a verified alias) as the sender.`;
  }
  return message;
}

/**
 * True when a real transport can be built.
 *
 * A sender is part of "configured": Brevo has no shared test sender, so a bare
 * BREVO_API_KEY with no MAIL_FROM would fail at send time. Treating that as
 * unconfigured routes the user to the diagnostic's setup instructions instead
 * of letting them discover the problem as a rejected email.
 */
export function isMailConfigured(): boolean {
  const cfg = readConfig();
  return cfg.provider !== 'none' && cfg.from !== '';
}

/** Human-readable one-liner for logs and diagnostics. */
export function describeMailConfig(): string {
  const cfg = readConfig();
  switch (cfg.provider) {
    case 'brevo': return `Brevo HTTP API (from ${cfg.from})`;
    case 'resend': return `Resend HTTP API (from ${cfg.from})`;
    case 'smtp': return `SMTP ${cfg.host}:${cfg.port} as ${cfg.user}`;
    default: return 'none — no mail can be sent';
  }
}

let cached: Transporter | null = null;
let cachedSignature = '';
/** Guards the one-time "no mail configured" banner so it is not repeated per request. */
let announcedFallback = false;

function getTransporter(): Transporter | null {
  const cfg = readConfig();
  // Keyed on the live config: if `.env` changes underneath us (the setup wizard
  // does exactly that), a pool built from the old credentials must not be
  // reused, or the server would keep failing with credentials that no longer
  // exist on disk.
  const signature = `${cfg.provider}|${cfg.host}|${cfg.port}|${cfg.user}|${cfg.pass}|${cfg.from}`;
  if (cached && cachedSignature === signature) return cached;

  cached = null;
  cachedSignature = signature;
  if (cfg.provider !== 'smtp') return null;

  cached = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    // 465 is implicit TLS; 587 upgrades via STARTTLS.
    secure: cfg.port === 465,
    // On the submission port the upgrade must be mandatory. Without this a
    // server that fails to offer STARTTLS would silently send the credentials
    // in the clear. Only asserted for 587, where STARTTLS is guaranteed.
    ...(cfg.port === 587 ? { requireTLS: true } : {}),
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
  });
  return cached;
}

/**
 * Check that the configured transport is usable, WITHOUT sending anything.
 * Backs `npm run mail:test`.
 */
export async function verifyMailConnection(): Promise<{ ok: boolean; error?: string }> {
  const cfg = readConfig();

  if (cfg.provider === 'none') {
    return {
      ok: false,
      error:
        'No mail transport configured. Set either BREVO_API_KEY (easiest — no App Password ' +
        'needed) or SMTP_HOST + SMTP_USER + SMTP_PASS.',
    };
  }

  if (cfg.provider === 'smtp') {
    const transporter = getTransporter();
    if (!transporter) return { ok: false, error: 'SMTP is not configured.' };
    try {
      await transporter.verify();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: explainMailError(err) };
    }
  }

  // HTTP providers: confirm the key is accepted. A read-only account call is
  // enough and does not burn a send from the daily quota.
  const url = cfg.provider === 'brevo'
    ? 'https://api.brevo.com/v3/account'
    : 'https://api.resend.com/domains';
  const headers: Record<string, string> = cfg.provider === 'brevo'
    ? { 'api-key': cfg.apiKey, accept: 'application/json' }
    : { authorization: `Bearer ${cfg.apiKey}`, accept: 'application/json' };

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => '');
    return {
      ok: false,
      error: explainMailError({ status: res.status, message: `${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}` }),
    };
  } catch (err: any) {
    return { ok: false, error: explainMailError(err) };
  }
}

function codeEmailText(code: string, fullName: string): string {
  return (
    `Hi ${fullName || 'there'},\n\n` +
    `Your Millennium SmartBoard password reset code is ${code}.\n\n` +
    `It expires in 10 minutes and can be used once.\n` +
    `If you did not request this, you can ignore this email.\n`
  );
}

function codeEmailHtml(code: string, fullName: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr>
        <td style="padding:26px 30px 10px;">
          <div style="font-size:13px;font-weight:700;letter-spacing:.14em;color:#0ea5e9;text-transform:uppercase;">Millennium SmartBoard</div>
          <h1 style="margin:10px 0 6px;font-size:21px;color:#0f172a;">Reset your password</h1>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
            Hi ${fullName || 'there'}, use the code below to choose a new password.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 30px;">
          <div style="font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:.34em;color:#0f172a;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:18px;text-align:center;">
            ${code}
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 30px 26px;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
            This code expires in <strong>10 minutes</strong> and can be used once.
            If you did not request a password reset you can ignore this email —
            your current password stays unchanged.
          </p>
          <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">
            Brains Infinite Innovations Inc. · This is an automated message.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

const SUBJECT = 'Your Millennium SmartBoard password reset code';

/** Send via an HTTP provider. Throws on failure so the caller can log it. */
async function sendViaHttp(
  cfg: MailConfig,
  to: string,
  code: string,
  fullName: string
): Promise<void> {
  const sender = splitFrom(cfg.from);
  const text = codeEmailText(code, fullName);
  const html = codeEmailHtml(code, fullName);

  const isBrevo = cfg.provider === 'brevo';
  const url = isBrevo ? 'https://api.brevo.com/v3/smtp/email' : 'https://api.resend.com/emails';
  const headers: Record<string, string> = isBrevo
    ? { 'api-key': cfg.apiKey, 'content-type': 'application/json', accept: 'application/json' }
    : { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' };

  const payload = isBrevo
    ? {
        sender: sender.name ? { name: sender.name, email: sender.email } : { email: sender.email },
        to: [{ email: to, ...(fullName ? { name: fullName } : {}) }],
        subject: SUBJECT,
        htmlContent: html,
        textContent: text,
      }
    : {
        from: cfg.from,
        to: [to],
        subject: SUBJECT,
        html,
        text,
      };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(
      new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 300)}` : ''}`),
      { status: res.status }
    );
  }
}

export interface SendResult {
  delivered: boolean;
  /** True when the code was written to the server console instead of emailed. */
  fellBackToConsole: boolean;
  error?: string;
}

/**
 * Send a reset code. Never throws: a mail outage must not 500 the endpoint,
 * because the caller has already been told "check your inbox" either way.
 */
export async function sendPasswordResetCode(
  to: string,
  code: string,
  fullName: string
): Promise<SendResult> {
  const cfg = readConfig();

  if (cfg.provider === 'none') {
    if (!announcedFallback) {
      announcedFallback = true;
      console.warn(
        '  ⚠️  No mail transport is configured — reset codes cannot be emailed.\n' +
        '     They are printed below for an administrator to relay by hand.\n' +
        '     The requester does NOT see this code.\n' +
        '     Easiest fix: set BREVO_API_KEY (no App Password needed).\n' +
        '     Alternative: SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS.'
      );
    }
    printConsoleCode(to, code);
    return { delivered: false, fellBackToConsole: true };
  }

  try {
    if (cfg.provider === 'smtp') {
      const transporter = getTransporter();
      if (!transporter) {
        printConsoleCode(to, code);
        return { delivered: false, fellBackToConsole: true };
      }
      await transporter.sendMail({
        from: cfg.from || cfg.user,
        to,
        subject: SUBJECT,
        text: codeEmailText(code, fullName),
        html: codeEmailHtml(code, fullName),
      });
    } else {
      await sendViaHttp(cfg, to, code, fullName);
    }
    return { delivered: true, fellBackToConsole: false };
  } catch (err: any) {
    console.error(`  ❌ Failed to email reset code to ${to} via ${cfg.provider}:`);
    console.error(`     ${explainMailError(err)}`);
    // Still surface the code on the console so an admin can relay it.
    printConsoleCode(to, code);
    return { delivered: false, fellBackToConsole: true, error: explainMailError(err) };
  }
}

/**
 * The operator-facing fallback. Alignment is computed rather than hand-padded:
 * an earlier version had drifted to a different width than its own border.
 */
function printConsoleCode(to: string, code: string): void {
  const row = (s: string) => `  │${s.padEnd(46).slice(0, 46)}│`;
  console.log(
    '\n  ┌' + '─'.repeat(46) + '┐' +
    '\n' + row('  RESET CODE - ADMIN RELAY ONLY') +
    '\n' + row('  Not shown to the user; no mail delivered.') +
    '\n' + row('  ' + to) +
    '\n' + row('  CODE: ' + code) +
    '\n  └' + '─'.repeat(46) + '┘\n'
  );
}
