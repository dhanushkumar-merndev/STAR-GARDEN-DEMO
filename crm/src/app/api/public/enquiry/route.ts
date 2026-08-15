import { NextResponse, type NextRequest } from 'next/server';
import { publicEnquirySchema } from '@/lib/validation/schemas';
import { zodFieldErrors } from '@/lib/validation/common';
import { checkRateLimit, clientIpFromRequest } from '@/lib/rate-limit';
import { publicFormEnv } from '@/lib/env';
import { AuditAction, recordAudit } from '@/lib/audit';
import { findDuplicateLead, intakeLead, recordDuplicateAttempt } from '@/server/services/lead-intake';

/**
 * Public landing-page enquiry endpoint (AGENTS.md §11.8).
 *
 * The marketing site at stargardens.in posts here. Submissions become
 * `WEBSITE` leads through the same normalized intake service that Meta and
 * manual entry use, so duplicate detection and notification behave identically.
 *
 * This is the CRM's only anonymous write surface, so it carries three
 * defences (§15): an origin allowlist, per-IP rate limiting, and a honeypot,
 * with optional Turnstile on top.
 *
 * A duplicate returns success. The customer filled in a form and deserves a
 * "thank you", not a lecture about our database; the attempt is recorded in the
 * audit log for the Admin instead.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = publicFormEnv.allowedOrigins;
  const isAllowed = origin && allowed.some((o) => o === origin);

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : (allowed[0] ?? ''),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(origin);
  const allowed = publicFormEnv.allowedOrigins;

  // A browser POST always carries Origin. Server-to-server callers do not, and
  // are allowed through so the form can also be posted from a backend.
  if (origin && allowed.length > 0 && !allowed.includes(origin)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403, headers });
  }

  const ip = clientIpFromRequest(request);
  const rate = await checkRateLimit({
    bucket: 'public_enquiry',
    identifier: ip,
    limit: publicFormEnv.rateLimitPerHour,
    windowSeconds: 3600,
  });

  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many enquiries from this network. Please try again later.' },
      { status: 429, headers: { ...headers, 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  let payload: unknown;
  try {
    const contentType = request.headers.get('content-type') ?? '';
    payload = contentType.includes('application/json')
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400, headers });
  }

  const parsed = publicEnquirySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check the form.', fields: zodFieldErrors(parsed.error) },
      { status: 422, headers },
    );
  }

  const input = parsed.data;

  // Honeypot: a hidden field only a bot fills in. Answer 200 so the bot learns
  // nothing about why it failed.
  if (input.company_website && input.company_website.trim() !== '') {
    return NextResponse.json({ ok: true }, { status: 200, headers });
  }

  if (!(await verifyTurnstile(input.turnstile_token, ip))) {
    return NextResponse.json(
      { error: 'Could not verify that you are human. Please try again.' },
      { status: 403, headers },
    );
  }

  try {
    const duplicate = await findDuplicateLead(input.mobile.national, input.email ?? null);

    if (duplicate) {
      await recordDuplicateAttempt({
        source: 'WEBSITE',
        mobileNormalized: input.mobile.national,
        customerName: input.name,
        duplicate,
      });

      return NextResponse.json(
        { ok: true, message: 'We already have your enquiry and will be in touch shortly.' },
        { status: 200, headers },
      );
    }

    const requirement = [
      input.service ? `Service: ${input.service}` : null,
      input.message,
    ]
      .filter(Boolean)
      .join('\n');

    const { lead } = await intakeLead(
      {
        customerName: input.name,
        phone: input.mobile,
        email: input.email ?? null,
        locationText: input.city ?? null,
        requirementSummary: requirement || null,
        source: 'WEBSITE',
        sourceReference: origin ?? 'website',
        createdBy: null,
      },
      { allowDuplicate: true },
    );

    await recordAudit({
      actorUserId: null,
      action: AuditAction.WEBSITE_ENQUIRY_RECEIVED,
      entityType: 'lead',
      entityId: lead.id,
      after: { lead_code: lead.lead_code, origin: origin ?? null },
    });

    return NextResponse.json(
      { ok: true, message: 'Thank you. Our team will contact you shortly.' },
      { status: 201, headers },
    );
  } catch (error) {
    console.error('[public-enquiry] failed', error);
    return NextResponse.json(
      { error: 'We could not record your enquiry. Please call us instead.' },
      { status: 500, headers },
    );
  }
}

/** Cloudflare Turnstile. Disabled entirely when no secret is configured. */
async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = publicFormEnv.turnstileSecret;
  if (!secret) return true;
  if (!token) return false;

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5000),
    });

    const result = (await response.json()) as { success?: boolean; action?: string };
    return result.success === true && result.action === 'website_enquiry';
  } catch (error) {
    console.error('[public-enquiry] turnstile verification failed', error);
    return false;
  }
}
