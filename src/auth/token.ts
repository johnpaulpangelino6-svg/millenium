import crypto from 'node:crypto';

/**
 * Stateless signed tokens for API authentication.
 *
 * Format:  v1.<base64url(payload)>.<base64url(hmacSha256)>
 * Payload: { u: <userId>, iat: <unix seconds>, exp: <unix seconds> }
 *
 * Design notes
 * ------------
 * - The token carries ONLY the user id. The role and customer scope are re-read
 *   from the database on every request, so a role change or account deletion
 *   takes effect immediately instead of lingering until the token expires.
 * - No new dependencies; node:crypto only.
 * - The secret comes from AUTH_SECRET (falling back to SESSION_SECRET). A fixed
 *   development fallback is used only when neither is configured, so the app
 *   still runs out of the box — but a warning is printed in production.
 */

const TOKEN_VERSION = 'v1';

/**
 * Resolve the signing secret.
 *
 * Security posture:
 *  - A configured secret (AUTH_SECRET, else SESSION_SECRET) is used as-is. This
 *    is stable across restarts, so sessions survive a deploy.
 *  - In production with NO secret configured we generate a random per-process
 *    secret instead of falling back to a hard-coded value. A hard-coded default
 *    would be published in the source, letting anyone forge a valid token.
 *    The trade-off is that tokens do not survive a restart — users simply sign
 *    in again, which is far preferable to forgeable credentials.
 *  - In development a fixed fallback is used so sessions stay stable while
 *    working locally.
 */
function resolveSecret(): { secret: string; stable: boolean } {
  const configured = process.env.AUTH_SECRET || process.env.SESSION_SECRET;
  if (configured && configured.length >= 16) {
    return { secret: configured, stable: true };
  }

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '  ⚠️  AUTH_SECRET is not set. Using a RANDOM per-process secret — ' +
      'sessions will be invalidated on every restart. Set AUTH_SECRET in the ' +
      'environment to make logins persist.'
    );
    return { secret: crypto.randomBytes(48).toString('hex'), stable: false };
  }

  return { secret: 'millennium-smartboard-dev-secret-change-me', stable: true };
}

const resolved = resolveSecret();
const SECRET = resolved.secret;

/** False when a random per-process secret is in use (tokens die on restart). */
export const SECRET_IS_STABLE = resolved.stable;

/** Token lifetime in seconds. Default 7 days; override with AUTH_TOKEN_TTL_HOURS. */
export const TOKEN_TTL_SECONDS = (() => {
  const hours = Number(process.env.AUTH_TOKEN_TTL_HOURS);
  if (Number.isFinite(hours) && hours > 0) return Math.floor(hours * 3600);
  return 7 * 24 * 3600;
})();

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

function sign(payloadB64: string): string {
  return base64url(crypto.createHmac('sha256', SECRET).update(payloadB64).digest());
}

export interface TokenPayload {
  userId: string;
  issuedAt: number;
  expiresAt: number;
}

/** Issue a signed token for a user id. */
export function signToken(userId: string, ttlSeconds: number = TOKEN_TTL_SECONDS): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = { u: String(userId), iat: now, exp: now + ttlSeconds };
  const payloadB64 = base64url(JSON.stringify(payload));
  return `${TOKEN_VERSION}.${payloadB64}.${sign(payloadB64)}`;
}

/**
 * Verify a token's signature and expiry.
 * Returns the payload, or null for anything malformed/tampered/expired.
 */
export function verifyToken(token: string | undefined | null): TokenPayload | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [version, payloadB64, signature] = parts;
  if (version !== TOKEN_VERSION) return null;

  // Constant-time compare to avoid leaking the signature via timing.
  const expected = sign(payloadB64);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: any;
  try {
    payload = JSON.parse(fromBase64url(payloadB64).toString('utf8'));
  } catch {
    return null;
  }

  const userId = String(payload?.u || '');
  const issuedAt = Number(payload?.iat);
  const expiresAt = Number(payload?.exp);
  if (!userId || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;

  if (Math.floor(Date.now() / 1000) >= expiresAt) return null;

  return { userId, issuedAt, expiresAt };
}

/** Extract a bearer token from an Authorization header value. */
export function extractBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match ? match[1].trim() : null;
}
