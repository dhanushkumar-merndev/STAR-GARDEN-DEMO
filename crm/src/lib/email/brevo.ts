import 'server-only';

/**
 * Brevo transactional email.
 *
 * Chosen over raw SMTP for the customer-facing mail because Brevo's
 * transactional endpoint is authenticated per-message with an API key rather
 * than a mailbox password, and because its delivery reporting is what makes a
 * "did the customer actually get it?" question answerable.
 *
 * Two properties this module must preserve, both inherited from the SMTP path:
 *
 *   1. **Optional.** No API key means `isBrevoConfigured()` is false and the
 *      caller falls back to SMTP, or to nothing. Never throws on startup.
 *   2. **Never authoritative.** A failed send is recorded and returned; it does
 *      not roll back the business action that triggered it.
 *
 * This is the *transactional* endpoint, not the marketing one. Transactional
 * mail is sent because the recipient asked for the underlying thing to happen —
 * an assignment, a status update they requested — so there is no opt-in list
 * and no unsubscribe flow attached to it.
 */

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/** Brevo's own ceiling is higher, but a slow send should not hold a request. */
const SEND_TIMEOUT_MS = 10_000;

export interface BrevoConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
}

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * The API key.
 *
 * `BREVO_API_KEY` is the documented name; `BREVO_API` is accepted because that
 * is what the deployment's `.env` already uses, and silently ignoring a key
 * that is plainly present is the worst possible behaviour here.
 */
function brevoApiKey(): string | undefined {
  return read('BREVO_API_KEY') ?? read('BREVO_API');
}

/**
 * The sender address.
 *
 * Brevo rejects any sender that is not verified on the account, so this cannot
 * be defaulted — a guess would only produce a 400 at send time, after the
 * business action had already committed.
 */
function brevoFromEmail(): string | undefined {
  return read('BREVO_FROM_EMAIL') ?? read('SMTP_FROM_EMAIL');
}

export function getBrevoConfig(): BrevoConfig | null {
  const apiKey = brevoApiKey();
  const fromEmail = brevoFromEmail();

  if (!apiKey || !fromEmail) return null;

  return {
    apiKey,
    fromEmail,
    fromName: read('BREVO_FROM_NAME') ?? read('SMTP_FROM_NAME') ?? 'Star Gardens',
    replyToEmail: read('BREVO_REPLY_TO') ?? null,
  };
}

export function isBrevoConfigured(): boolean {
  return getBrevoConfig() !== null;
}

/**
 * Why Brevo is not active, for the Admin screen.
 *
 * "Not configured" is useless when a key IS present and one variable is
 * missing; this says which one, so the fix is obvious.
 */
export function brevoSetupGap(): string | null {
  const hasKey = Boolean(brevoApiKey());
  const hasSender = Boolean(brevoFromEmail());

  if (hasKey && hasSender) return null;
  if (!hasKey && !hasSender) return null; // Brevo simply is not being used.

  if (hasKey) {
    return (
      'A Brevo API key is set, but no sender address. Add BREVO_FROM_EMAIL using an ' +
      'address or domain you have verified in Brevo, then redeploy.'
    );
  }

  return 'A sender address is set, but no Brevo API key. Add BREVO_API_KEY, then redeploy.';
}

export interface BrevoSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

interface BrevoErrorBody {
  code?: string;
  message?: string;
}

/**
 * Posts one message. Never throws.
 *
 * Brevo returns `{ messageId }` on success and `{ code, message }` on failure;
 * both are mapped into the same shape the SMTP path returns so `sendEmail()`
 * does not have to care which transport ran.
 */
export async function sendViaBrevo(params: {
  config: BrevoConfig;
  to: string[];
  subject: string;
  html: string;
  text: string;
  /** Surfaces in Brevo's dashboard so a delivery problem can be traced. */
  tags?: string[];
}): Promise<BrevoSendResult> {
  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': params.config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: params.config.fromEmail, name: params.config.fromName },
        to: params.to.map((email) => ({ email })),
        ...(params.config.replyToEmail
          ? { replyTo: { email: params.config.replyToEmail } }
          : {}),
        subject: params.subject,
        htmlContent: params.html,
        textContent: params.text,
        ...(params.tags?.length ? { tags: params.tags.slice(0, 10) } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as BrevoErrorBody | null;
      return {
        ok: false,
        error: redactBrevoError(
          `${response.status}${body?.code ? ` ${body.code}` : ''}: ${
            body?.message ?? 'Brevo rejected the message.'
          }`,
        ),
      };
    }

    const body = (await response.json().catch(() => null)) as { messageId?: string } | null;
    return { ok: true, messageId: body?.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A timeout is by far the most common failure and deserves plain language;
    // anything else is passed through redacted.
    return {
      ok: false,
      error:
        error instanceof Error && error.name === 'TimeoutError'
          ? 'Brevo did not respond within 10 seconds.'
          : redactBrevoError(message),
    };
  }
}

/**
 * Strips the API key out of an error before it is stored or shown.
 *
 * Brevo echoes request context in some failures, and the key travels in a
 * header that a verbose fetch error can include.
 */
function redactBrevoError(raw: string): string {
  return raw
    .replace(/xkeysib-[A-Za-z0-9-]+/gi, '[redacted-key]')
    .replace(/(api-key)\s*[:=]\s*\S+/gi, '$1: [redacted]')
    .slice(0, 400);
}

/**
 * Confirms the key works without sending anything.
 *
 * Uses the account endpoint rather than a real send so the Admin's "test
 * connection" does not put a message in someone's inbox.
 */
export async function verifyBrevoConnection(): Promise<{
  ok: boolean;
  plan?: string;
  error?: string;
}> {
  const config = getBrevoConfig();
  if (!config) return { ok: false, error: 'Brevo is not configured.' };

  try {
    const response = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': config.apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        ok: false,
        error:
          response.status === 401
            ? 'Brevo rejected the API key.'
            : `Brevo returned ${response.status}.`,
      };
    }

    const body = (await response.json().catch(() => null)) as {
      plan?: { type?: string }[];
    } | null;

    return { ok: true, plan: body?.plan?.[0]?.type };
  } catch (error) {
    return { ok: false, error: redactBrevoError(String(error)) };
  }
}
