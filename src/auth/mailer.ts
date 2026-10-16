import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Outbound mail for the password-reset flow.
 *
 * Configuration (all optional — the app must boot without them):
 *   SMTP_HOST   e.g. smtp.gmail.com
 *   SMTP_PORT   587 (STARTTLS) or 465 (implicit TLS)
 *   SMTP_USER   the sending mailbox, e.g. noreply@brains.asia
 *   SMTP_PASS   an app password (Gmail requires an App Password, not the
 *               account password, when 2FA is on)
 *   SMTP_FROM   optional display sender; defaults to SMTP_USER
 *
 * When SMTP is NOT configured the code is printed to the server console
 * instead, so the whole reset flow stays usable and testable without
 * credentials. In that mode the API also returns the code to the client when
 * NODE_ENV is not 'production' — see isMailConfigured().
 */

let cached: Transporter | null = null;
let announcedFallback = false;

function readConfig() {
  return {
    host: (process.env.SMTP_HOST || '').trim(),
    port: Number(process.env.SMTP_PORT || 587),
    user: (process.env.SMTP_USER || '').trim(),
    pass: (process.env.SMTP_PASS || '').trim(),
    from: (process.env.SMTP_FROM || process.env.SMTP_USER || '').trim(),
  };
}

/** True when a real transport can be built. */
export function isMailConfigured(): boolean {
  const { host, user, pass } = readConfig();
  return Boolean(host && user && pass);
}

/**
 * The reset code may only be echoed back to the caller when there is no way to
 * deliver it AND we are not in production. A production deploy without SMTP
 * must fail closed rather than hand the code to whoever asked.
 */
export function mayExposeCodeToClient(): boolean {
  return !isMailConfigured() && process.env.NODE_ENV !== 'production';
}

function getTransporter(): Transporter | null {
  if (cached) return cached;
  const { host, port, user, pass } = readConfig();
  if (!host || !user || !pass) return null;

  cached = nodemailer.createTransport({
    host,
    port,
    // 465 is implicit TLS; 587 upgrades via STARTTLS.
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
  });
  return cached;
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
  const transporter = getTransporter();
  const { from } = readConfig();

  if (!transporter) {
    if (!announcedFallback) {
      announcedFallback = true;
      console.warn(
        '  ⚠️  SMTP is not configured — password-reset codes will be printed ' +
        'to this console instead of emailed. Set SMTP_HOST / SMTP_PORT / ' +
        'SMTP_USER / SMTP_PASS to send real mail.'
      );
    }
    console.log(
      '\n  ┌──────────────────────────────────────────────┐' +
      '\n  │  PASSWORD RESET CODE (email not configured)  │' +
      `\n  │   ${to.padEnd(40).slice(0, 40)} │` +
      `\n  │   CODE: ${code.padEnd(34)} │` +
      '\n  └──────────────────────────────────────────────┘\n'
    );
    return { delivered: false, fellBackToConsole: true };
  }

  try {
    await transporter.sendMail({
      from: from || readConfig().user,
      to,
      subject: 'Your Millennium SmartBoard password reset code',
      text:
        `Your Millennium SmartBoard password reset code is ${code}.\n\n` +
        `It expires in 10 minutes and can be used once.\n` +
        `If you did not request this, you can ignore this email.`,
      html: codeEmailHtml(code, fullName),
    });
    return { delivered: true, fellBackToConsole: false };
  } catch (err: any) {
    console.error(`  ❌ Failed to email reset code to ${to}: ${err.message}`);
    // Still surface the code on the console so an admin can relay it.
    console.log(`  ℹ️  Reset code for ${to} is: ${code}`);
    return { delivered: false, fellBackToConsole: true, error: err.message };
  }
}
