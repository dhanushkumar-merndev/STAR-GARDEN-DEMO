import 'server-only';

import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { appEnv } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/env';
import type { EmailLogStatus } from '@/types/database';

/**
 * Email transport (EMAIL add-on).
 *
 * One service, one transport, driven entirely by environment variables. The
 * rest of the application calls `sendEmail()` and never learns whether the
 * mail actually leaves via Google Workspace, GoDaddy, Microsoft 365 or anything
 * else — switching provider is an environment change and a redeploy, with no
 * code edit. No provider hostname appears anywhere in this file.
 *
 * Two properties the CRM depends on:
 *
 *   1. **Optional.** With SMTP unset the CRM runs exactly as before: in-app
 *      notifications still fire, workflows still complete, and the Admin sees
 *      "Not configured". Nothing crashes and nothing is retried forever.
 *   2. **Never authoritative.** Email is a secondary channel. A send failure is
 *      recorded in `email_logs` and never rolls back the business action that
 *      triggered it — a lead stays assigned whether or not the mail went out.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
}

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Reads SMTP settings, or returns null when the deployment has none yet.
 *
 * Returning null rather than throwing is the whole point: §4 of the add-on
 * requires the app to start and keep working before credentials arrive.
 */
export function getSmtpConfig(): SmtpConfig | null {
  const host = read('SMTP_HOST');
  const user = read('SMTP_USER');
  const password = read('SMTP_PASSWORD');
  const fromEmail = read('SMTP_FROM_EMAIL') ?? user;

  if (!host || !user || !password || !fromEmail) return null;

  const port = Number.parseInt(read('SMTP_PORT') ?? '587', 10);
  const resolvedPort = Number.isFinite(port) && port > 0 ? port : 587;

  return {
    host,
    port: resolvedPort,
    // 465 is implicit TLS; 587 and 25 negotiate STARTTLS. Deriving this from
    // the port keeps one fewer variable for the owner to get wrong.
    secure: resolvedPort === 465,
    user,
    password,
    fromEmail,
    fromName: read('SMTP_FROM_NAME') ?? 'Star Garden',
  };
}

export function isEmailConfigured(): boolean {
  return getSmtpConfig() !== null;
}

/** Non-secret status for the Admin screen. Never exposes the password. */
export function emailStatus(): {
  configured: boolean;
  host: string | null;
  port: number | null;
  sender: string | null;
  senderName: string | null;
} {
  const config = getSmtpConfig();

  if (!config) {
    return { configured: false, host: null, port: null, sender: null, senderName: null };
  }

  return {
    configured: true,
    host: config.host,
    port: config.port,
    sender: config.fromEmail,
    senderName: config.fromName,
  };
}

let cachedTransporter: Transporter | null = null;
let cachedFingerprint = '';

function transporter(config: SmtpConfig): Transporter {
  const fingerprint = `${config.host}:${config.port}:${config.user}`;

  if (!cachedTransporter || cachedFingerprint !== fingerprint) {
    const options: SMTPTransport.Options = {
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      // No connection pool: serverless invocations are short-lived, so a pool
      // would be torn down before it paid for itself. (Omitting `pool` is what
      // selects the non-pooled transport.)
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    };

    cachedTransporter = nodemailer.createTransport(options);
    cachedFingerprint = fingerprint;
  }

  return cachedTransporter;
}

/* -------------------------------------------------------------------------- */
/* Sending                                                                     */
/* -------------------------------------------------------------------------- */

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** Classifies the message in `email_logs`, e.g. `lead.assigned`. */
  emailType: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}

export interface SendEmailResult {
  ok: boolean;
  skipped: boolean;
  messageId?: string;
  error?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sends one message and records the attempt.
 *
 * Never throws. Callers treat email as fire-and-forget; the outcome lives in
 * `email_logs` for the Admin to inspect.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const recipients = (Array.isArray(params.to) ? params.to : [params.to])
    .map((address) => address.trim().toLowerCase())
    .filter((address) => EMAIL_PATTERN.test(address));

  if (recipients.length === 0) {
    return { ok: false, skipped: true, error: 'No valid recipient address.' };
  }

  const config = getSmtpConfig();

  if (!config) {
    // Not an error condition — the deployment simply has no mail transport yet.
    await recordEmailLog({
      recipient: recipients.join(', '),
      emailType: params.emailType,
      relatedEntityType: params.relatedEntityType,
      relatedEntityId: params.relatedEntityId,
      subject: params.subject,
      status: 'FAILED',
      errorSummary: 'SMTP is not configured on this deployment.',
    });
    return { ok: false, skipped: true, error: 'Email service is not configured.' };
  }

  try {
    const info = await transporter(config).sendMail({
      from: { name: config.fromName, address: config.fromEmail },
      to: recipients,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    await recordEmailLog({
      recipient: recipients.join(', '),
      emailType: params.emailType,
      relatedEntityType: params.relatedEntityType,
      relatedEntityId: params.relatedEntityId,
      subject: params.subject,
      status: 'SENT',
      providerMessageId: info.messageId ?? null,
      sentAt: new Date().toISOString(),
    });

    return { ok: true, skipped: false, messageId: info.messageId };
  } catch (error) {
    const summary = redactSmtpError(error);

    // Logged, not thrown. The caller's business action has already committed.
    console.error('[email] send failed', { emailType: params.emailType, summary });

    await recordEmailLog({
      recipient: recipients.join(', '),
      emailType: params.emailType,
      relatedEntityType: params.relatedEntityType,
      relatedEntityId: params.relatedEntityId,
      subject: params.subject,
      status: 'FAILED',
      errorSummary: summary,
    });

    return { ok: false, skipped: false, error: summary };
  }
}

/**
 * Strips credentials out of an SMTP error before it is stored or shown.
 *
 * Nodemailer and several providers echo the AUTH exchange — which is the
 * base64-encoded username and password — straight into the error message.
 * Storing that verbatim would put the mailbox password in the database and on
 * an Admin screen.
 */
function redactSmtpError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  const cleaned = raw
    // AUTH LOGIN / PLAIN payloads.
    .replace(/AUTH\s+(LOGIN|PLAIN|XOAUTH2)[^\n]*/gi, 'AUTH [redacted]')
    // Long base64 runs — the encoded credentials.
    .replace(/\b[A-Za-z0-9+/]{24,}={0,2}\b/g, '[redacted]')
    // Anything that looks like an explicit password field.
    .replace(/(pass(word)?|pwd|secret)\s*[:=]\s*\S+/gi, '$1: [redacted]');

  const code = (error as { code?: string })?.code;
  const withCode = code ? `${code}: ${cleaned}` : cleaned;

  return withCode.slice(0, 400);
}

/* -------------------------------------------------------------------------- */
/* Logging                                                                     */
/* -------------------------------------------------------------------------- */

interface EmailLogEntry {
  recipient: string;
  emailType: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  subject: string;
  status: EmailLogStatus;
  providerMessageId?: string | null;
  errorSummary?: string | null;
  sentAt?: string | null;
}

/**
 * Writes to `email_logs` with the service-role client — the table is Admin-read
 * and never client-written, same reasoning as the audit log.
 */
async function recordEmailLog(entry: EmailLogEntry): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const admin = createAdminClient();
    await admin.from('email_logs').insert({
      recipient: entry.recipient.slice(0, 500),
      email_type: entry.emailType,
      related_entity_type: entry.relatedEntityType ?? null,
      related_entity_id: entry.relatedEntityId ?? null,
      subject: entry.subject.slice(0, 300),
      status: entry.status,
      provider_message_id: entry.providerMessageId ?? null,
      error_summary: entry.errorSummary ?? null,
      sent_at: entry.sentAt ?? null,
    });
  } catch (error) {
    // Logging the log failure is as far as this can reasonably go.
    console.error('[email] could not record email log', error);
  }
}

/**
 * Sends a rendered template to a staff member, looked up by user id.
 *
 * The address comes from `profiles`, never from the caller — a Server Action
 * must not be able to redirect a CRM notification to an arbitrary inbox. A
 * deactivated user is skipped: they have lost application access, so they
 * should stop receiving its mail too (§15).
 */
export async function sendStaffEmail(params: {
  userId: string | null | undefined;
  rendered: { subject: string; html: string; text: string };
  emailType: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}): Promise<SendEmailResult> {
  if (!params.userId || !isEmailConfigured() || !isSupabaseConfigured()) {
    return { ok: false, skipped: true };
  }

  try {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('email, is_active')
      .eq('id', params.userId)
      .maybeSingle();

    if (!profile?.email || !profile.is_active) return { ok: false, skipped: true };

    return await sendEmail({
      to: profile.email,
      subject: params.rendered.subject,
      html: params.rendered.html,
      text: params.rendered.text,
      emailType: params.emailType,
      relatedEntityType: params.relatedEntityType,
      relatedEntityId: params.relatedEntityId,
    });
  } catch (error) {
    console.error('[email] staff lookup failed', error);
    return { ok: false, skipped: true };
  }
}

/**
 * Verifies the SMTP connection without sending anything.
 * Used by the Admin settings screen to explain *why* email is failing.
 */
export async function verifySmtpConnection(): Promise<{ ok: boolean; error?: string }> {
  const config = getSmtpConfig();
  if (!config) return { ok: false, error: 'SMTP is not configured.' };

  try {
    await transporter(config).verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: redactSmtpError(error) };
  }
}

export { appEnv };
