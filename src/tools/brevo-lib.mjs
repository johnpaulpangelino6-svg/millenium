/**
 * Pure-ish helpers behind the Brevo connection wizard.
 *
 * Split out from brevo-connect.mjs so the decision logic can be unit-tested
 * in-process with a stubbed fetch. The CLI cannot be tested end-to-end here
 * because this sandbox routes outbound connections through a proxy that does
 * not forward to a sibling process's localhost port — so a mock server in the
 * test process is unreachable from the child. Injecting fetch sidesteps that
 * entirely and tests the branching we actually care about.
 *
 * Nothing here reads process.env or touches the filesystem except
 * `writeEnvValues`, which takes an explicit path.
 */

import fs from 'node:fs';
import path from 'node:path';

export const BREVO_API_DEFAULT = 'https://api.brevo.com/v3';

/**
 * Brevo hands out two different secrets whose names are one letter apart, and
 * reaching for the wrong one is the most common cause of a 401:
 *
 *   xkeysib-...   API key   -> what this app needs (goes in the `api-key` header)
 *   xsmtpsib-...  SMTP key  -> for the SMTP relay only; api.brevo.com rejects it
 *
 * Normalisation matters for the same reason it does for Gmail App Passwords: a
 * key pasted from a browser or a terminal can pick up surrounding quotes, a
 * trailing newline, or a hard wrap in the middle. A key never contains
 * whitespace, so removing all of it is always safe.
 */
export function normalizeKey(raw) {
  const original = String(raw ?? '');
  const trimmed = original.replace(/^[\s"'`]+/, '').replace(/[\s"'`]+$/, '');
  const compact = trimmed.replace(/\s+/g, '');
  return {
    key: compact,
    changed: compact !== original,
    hadQuotes: trimmed.length !== original.trim().length,
    hadInnerSpace: /\s/.test(trimmed),
  };
}

/** `'api'` | `'smtp'` | `'unknown'` — which kind of Brevo secret this looks like. */
export function keyKind(key) {
  const k = String(key || '');
  if (k.startsWith('xkeysib-')) return 'api';
  if (k.startsWith('xsmtpsib-')) return 'smtp';
  return 'unknown';
}

/**
 * A warning for a key that cannot possibly work, phrased as the fix rather than
 * as a rule. Returns null when the shape looks fine.
 */
export function keyShapeWarning(key) {
  const k = String(key || '');
  if (keyKind(k) === 'smtp') {
    return [
      'That is an SMTP key ("xsmtpsib-..."), not an API key.',
      '  → Brevo gives you two secrets and api.brevo.com only accepts the API one.',
      '  → Go to: profile icon (top right) → SMTP & API → the "API Keys" tab',
      '    (not the "SMTP" tab), then "Generate a new API key".',
    ].join('\n');
  }
  if (keyKind(k) === 'unknown' && k && !k.startsWith('xkey')) {
    return `This does not start with "xkeysib-", which Brevo API keys normally do — it may be the wrong value.`;
  }
  return null;
}

/**
 * Explain a failed Brevo call in terms of what the user should do next.
 * A bare status code is not actionable for someone who has never used Brevo.
 */
export function explainBrevoError(status, body, key = '') {
  const message = body?.message || body?.error || '';

  // An account-level IP allowlist also answers with 401, which makes it look
  // identical to a bad key. It is a completely different problem with a
  // completely different fix — and regenerating the key, the obvious response
  // to "rejected key", would waste the user's time without helping at all.
  if (/unrecogni[sz]ed IP address|authori[sz]ed_ips/i.test(message)) {
    const ip = (message.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/) || [])[0];
    return [
      `Brevo blocked this request (HTTP ${status}): ${ip ? `the IP address ${ip} is` : 'this IP address is'} not on the account allowlist.`,
      '  → Your API key is FINE. Do not regenerate it.',
      '  → Brevo has "Authorized IPs" active, so it only accepts requests from',
      '    addresses you have listed. Brevo switches this on by itself once an',
      '    API key goes unused for 30 days, so it can appear out of nowhere.',
      '  → Easiest fix: Brevo emails you every time it blocks an IP, and that',
      '    notification has a "Deactivate" action — search your inbox for Brevo.',
      '  → Or turn it off:  Settings > Security > Authorized IPs',
      '                     → "Blocking unauthorized IP addresses" → API keys row',
      '                     → "Deactivate for API" → confirm.',
      '    Or open https://app.brevo.com/security/authorised_ips',
      '  → Deactivating is usually the right call: home and server IPs change,',
      '    so an allowlist breaks sending again later.',
    ].join('\n');
  }

  if (status === 401 || status === 403) {
    const lines = [`Brevo rejected the key (HTTP ${status}).`];
    if (keyKind(key) === 'smtp') {
      lines.push('  → This is an SMTP key, which the API endpoint always rejects.');
      lines.push('  → Generate an API key instead: profile icon (top right) →');
      lines.push('    SMTP & API → "API Keys" tab (not the "SMTP" tab).');
    } else {
      lines.push('  → The key was copied incompletely, or it has been deleted.');
      lines.push('  → Note Brevo has two secrets: "xkeysib-" is the API key this');
      lines.push('    app needs; "xsmtpsib-" is the SMTP key and will be rejected.');
      lines.push('  → Generate a fresh one: profile icon (top right) → SMTP & API → API Keys.');
    }
    if (message) lines.push(`  → Brevo said: ${message}`);
    return lines.join('\n');
  }
  if (status === 402) {
    return 'Brevo says the account needs activating (HTTP 402). Finish the signup / activation email first.';
  }
  if (status === 429) {
    return 'Brevo rate-limited this request (HTTP 429). Wait a minute and try again.';
  }
  return `Brevo returned HTTP ${status}${message ? `: ${message}` : ''}`;
}

/** GET a Brevo endpoint. `fetchImpl` is injectable for tests. */
async function getJson(apiBase, pathname, key, fetchImpl) {
  const res = await fetchImpl(`${apiBase}${pathname}`, {
    headers: { 'api-key': key, accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  let body = null;
  try { body = await res.json(); } catch { /* some errors carry no body */ }
  return { status: res.status, ok: res.ok, body };
}

/**
 * Confirm the key is real. Returns `{ ok, account }` or `{ ok: false, error }`.
 */
export async function validateKey(apiBase, key, fetchImpl = fetch) {
  try {
    const res = await getJson(apiBase, '/account', key, fetchImpl);
    if (!res.ok) return { ok: false, error: explainBrevoError(res.status, res.body, key) };
    return { ok: true, account: res.body || {} };
  } catch (err) {
    return {
      ok: false,
      error: `Could not reach api.brevo.com: ${err?.message || err}\n` +
        '  → Check your internet connection or any VPN/proxy.',
    };
  }
}

/**
 * List senders. A failure here is NOT fatal — the key may simply lack the
 * scope — so the caller is told but can continue.
 */
export async function listSenders(apiBase, key, fetchImpl = fetch) {
  try {
    const res = await getJson(apiBase, '/senders', key, fetchImpl);
    if (!res.ok) {
      return { ok: false, error: explainBrevoError(res.status, res.body, key), senders: [] };
    }
    const raw = Array.isArray(res.body) ? res.body : (res.body?.senders || []);
    return { ok: true, senders: raw.filter((s) => s && s.email) };
  } catch (err) {
    return { ok: false, error: `Could not list senders: ${err?.message || err}`, senders: [] };
  }
}

/** Brevo only sends from an address that has been verified, so `active` gates use. */
export function usableSenders(senders) {
  return senders.filter((s) => s.active !== false && s.email);
}

/**
 * Choose a sender without asking when the choice is obvious: prefer the app's
 * own account address, otherwise the first verified one.
 */
export function pickSender(usable, preferredEmail = '') {
  if (!usable.length) return null;
  if (preferredEmail) {
    const escaped = preferredEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = usable.find((s) => new RegExp(`^${escaped}$`, 'i').test(s.email));
    if (match) return match;
  }
  return usable[0];
}

/** Brevo requires a `Name <email>` sender; synthesise one when the name is absent. */
export function formatFrom(sender) {
  const name = (sender?.name || '').trim() || 'Millennium SmartBoard';
  return `${name} <${sender.email}>`;
}

/**
 * Rewrite only the given keys, appending any that are absent, after backing the
 * file up. Returns the keys touched and the backup filename.
 */
export function writeEnvValues(envPath, values) {
  const original = fs.readFileSync(envPath, 'utf8');
  let text = original;
  const updated = [];

  for (const [key, value] of Object.entries(values)) {
    const line = new RegExp(`^${key}=.*$`, 'm');
    if (line.test(text)) {
      text = text.replace(line, `${key}=${value}`);
      updated.push(key);
    } else {
      text = `${text.replace(/\s*$/, '')}\n${key}=${value}\n`;
      updated.push(`${key} (appended)`);
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${envPath}.backup-${stamp}`;
  fs.copyFileSync(envPath, backup);
  fs.writeFileSync(envPath, text, 'utf8');

  return { updated, backup: path.basename(backup) };
}
