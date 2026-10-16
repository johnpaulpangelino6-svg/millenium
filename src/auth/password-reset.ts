import crypto from 'node:crypto';
import { db } from '../db/database-supabase.js';
import { sendPasswordResetCode } from './mailer.js';

/**
 * Password reset by one-time code.
 *
 * Flow
 * ----
 *   1. POST /auth/forgot-password   { email }                 -> emails a 6-digit code
 *   2. POST /auth/verify-reset-code { email, code }           -> confirms the code is good
 *   3. POST /auth/reset-password    { email, code, password } -> consumes the code, sets the password
 *
 * Design notes
 * ------------
 * - The code is a bearer credential and travels ONLY to the mailbox. Step 1
 *   never returns it, in any environment — no dev fallback, no debug flag. If
 *   it were returned, anyone able to type an email address on the sign-in
 *   screen could reset that account. With SMTP unconfigured the code goes to
 *   the server console for an administrator to relay.
 * - Only the SHA-256 of the code is stored, so read access to the table cannot
 *   be replayed into a reset.
 * - The reply to step 1 is IDENTICAL whether or not the address exists. Telling
 *   the caller "no such account" would turn this endpoint into a way to
 *   enumerate who has an account here.
 * - Step 3 re-checks the code rather than trusting a token issued by step 2.
 *   There is deliberately no "reset token": the session-token helper signs a
 *   payload that verifyToken() would happily accept as a *login*, so minting a
 *   reset token from it would hand out a session. Re-checking the code avoids
 *   that class of bug entirely.
 * - Guessing is capped: 5 wrong codes kills the code, and codes expire in 10
 *   minutes.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateCode(): string {
  // crypto.randomInt is uniform; Math.random would bias the low digits.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Constant-time compare of two hex digests. */
function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface IssueResult {
  /** Always true for a well-formed address — never reveals whether it exists. */
  ok: boolean;
  emailed: boolean;
  /**
   * True only when a send was actually attempted, i.e. the address exists AND
   * was not inside the resend cooldown.
   *
   * Needed because `emailed: false` is otherwise ambiguous — it means "unknown
   * address", "too soon to resend", or "the provider rejected the send". Those
   * need very different responses, and conflating them is how a broken mail
   * setup ends up telling users to check an inbox that will never receive
   * anything.
   *
   * NOT for the client: `attempted` differs between existing and non-existing
   * accounts, so exposing it would be an account-enumeration oracle. It is used
   * server-side, and only in development, to report a real delivery failure.
   */
  attempted: boolean;
  /** Provider/transport error, when a send was attempted and failed. */
  deliveryError?: string;
  /**
   * Deliberately absent: the code is NEVER returned to the caller.
   *
   * Handing it back would let anyone who can type an email address into the
   * sign-in screen reset that account's password — the reset code is a bearer
   * credential, so it may only travel to the mailbox. When SMTP is
   * unconfigured the code goes to the server console instead, for an
   * administrator to relay by hand.
   */
}

export async function issuePasswordResetCode(rawEmail: string): Promise<IssueResult> {
  const email = String(rawEmail || '').trim().toLowerCase();
  const user = await db.findUserByEmail(email);

  // Unknown address: report success and stop. No code, no email, no signal.
  if (!user) {
    console.log(`  ℹ️  Password reset requested for unknown address: ${email}`);
    return { ok: true, emailed: false, attempted: false };
  }

  // Respect a short cooldown so the endpoint cannot be used to spam a mailbox.
  // The comparison happens in SQL — see createPasswordResetCode for why.
  if (await db.hasRecentPasswordResetCode(email, RESEND_COOLDOWN_MS / 1000)) {
    console.log(`  ℹ️  Reset code for ${email} re-requested within cooldown; not resending.`);
    return { ok: true, emailed: false, attempted: false };
  }

  const code = generateCode();
  await db.createPasswordResetCode(
    user.id,
    email,
    hashCode(code),
    CODE_TTL_MS / 60000
  );

  const result = await sendPasswordResetCode(email, code, user.fullName || user.username || '');

  return {
    ok: true,
    emailed: result.delivered,
    attempted: true,
    ...(result.error ? { deliveryError: result.error } : {}),
  };
}

export interface VerifyResult {
  ok: boolean;
  error?: string;
}

/**
 * Check a code without consuming it — lets the UI confirm step 2 before asking
 * for a new password. Wrong guesses are still counted, so this cannot be used
 * to brute-force a code for free.
 */
export async function verifyPasswordResetCode(
  rawEmail: string,
  rawCode: string
): Promise<VerifyResult> {
  const email = String(rawEmail || '').trim().toLowerCase();
  const code = String(rawCode || '').trim();

  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: 'Enter the 6-digit code from your email.' };
  }

  const record = await db.getActivePasswordResetCode(email);
  if (!record) {
    return { ok: false, error: 'That code has expired or is no longer valid. Request a new one.' };
  }

  if (Number(record.attempts) >= MAX_ATTEMPTS) {
    await db.consumePasswordResetCode(record.id);
    return { ok: false, error: 'Too many incorrect attempts. Request a new code.' };
  }

  if (!safeEqualHex(record.codeHash, hashCode(code))) {
    const attempts = await db.bumpPasswordResetAttempts(record.id);
    const left = Math.max(0, MAX_ATTEMPTS - attempts);
    return {
      ok: false,
      error: left > 0
        ? `That code is not correct. ${left} attempt${left === 1 ? '' : 's'} left.`
        : 'Too many incorrect attempts. Request a new code.',
    };
  }

  return { ok: true };
}

export interface ResetResult {
  ok: boolean;
  error?: string;
}

/** Verify the code, burn it, and set the new password. */
export async function resetPasswordWithCode(
  rawEmail: string,
  rawCode: string,
  newPassword: string
): Promise<ResetResult> {
  const email = String(rawEmail || '').trim().toLowerCase();

  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return { ok: false, error: 'Your new password must be at least 6 characters.' };
  }

  const record = await db.getActivePasswordResetCode(email);
  if (!record) {
    return { ok: false, error: 'That code has expired or is no longer valid. Request a new one.' };
  }

  if (Number(record.attempts) >= MAX_ATTEMPTS) {
    await db.consumePasswordResetCode(record.id);
    return { ok: false, error: 'Too many incorrect attempts. Request a new code.' };
  }

  if (!safeEqualHex(record.codeHash, hashCode(String(rawCode || '').trim()))) {
    await db.bumpPasswordResetAttempts(record.id);
    return { ok: false, error: 'That code is not correct.' };
  }

  // Burn first: a failure while writing the password must not leave the code
  // reusable.
  await db.consumePasswordResetCode(record.id);

  const updated = await db.setUserPassword(record.userId, newPassword);
  if (!updated) {
    return { ok: false, error: 'We could not update that password. Contact your administrator.' };
  }

  return { ok: true };
}
