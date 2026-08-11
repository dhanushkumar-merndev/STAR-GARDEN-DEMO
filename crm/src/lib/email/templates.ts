import 'server-only';

import { appEnv } from '@/lib/env';

/**
 * Email templates.
 *
 * Deliberately plain: a single-column table layout that survives Outlook, an
 * inline palette matching the CRM, and a plain-text twin for every message.
 * There is no template engine and no builder — the add-on asks for lightweight
 * and professional, not a marketing tool.
 *
 * Staff emails carry enough to act on and a link back to the CRM. Customer
 * emails carry less still: the CRM is not a customer portal (§3.2), so nothing
 * here exposes internal notes, other leads, or file links.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface Row {
  label: string;
  value: string | null | undefined;
}

interface TemplateInput {
  subject: string;
  heading: string;
  intro?: string;
  rows?: Row[];
  note?: string;
  action?: { label: string; path: string };
  /** Customer-facing mail omits the internal footer. */
  audience?: 'staff' | 'customer';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function absoluteUrl(path: string): string {
  return `${appEnv.url}${path.startsWith('/') ? path : `/${path}`}`;
}

export function renderEmail(input: TemplateInput): RenderedEmail {
  const rows = (input.rows ?? []).filter(
    (row): row is Row & { value: string } => Boolean(row.value && row.value.trim()),
  );

  const url = input.action ? absoluteUrl(input.action.path) : null;
  const isStaff = (input.audience ?? 'staff') === 'staff';

  const rowsHtml = rows
    .map(
      (row) => `
        <tr>
          <td style="padding:6px 12px 6px 0;color:#6b7c74;font-size:13px;vertical-align:top;white-space:nowrap">${escapeHtml(row.label)}</td>
          <td style="padding:6px 0;color:#1f2a24;font-size:14px;font-weight:600">${escapeHtml(row.value)}</td>
        </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.subject)}</title></head>
<body style="margin:0;padding:0;background:#f7faf8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2a24">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7faf8;padding:24px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;background:#ffffff;border:1px solid #e3eae6;border-radius:14px;overflow:hidden">
          <tr>
            <td style="padding:20px 24px 0">
              <p style="margin:0;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#4f7d64;font-weight:700">Star Garden</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 0">
              <h1 style="margin:0 0 12px;font-size:19px;line-height:1.35;font-weight:700">${escapeHtml(input.heading)}</h1>
              ${input.intro ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#42514a">${escapeHtml(input.intro)}</p>` : ''}
            </td>
          </tr>
          ${
            rowsHtml
              ? `<tr><td style="padding:0 24px">
                   <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f4f8f6;border-radius:10px;padding:12px 14px">
                     ${rowsHtml}
                   </table>
                 </td></tr>`
              : ''
          }
          ${
            url
              ? `<tr><td style="padding:20px 24px 0">
                   <a href="${escapeHtml(url)}" style="display:inline-block;background:#2f6b4f;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600">${escapeHtml(input.action!.label)}</a>
                 </td></tr>`
              : ''
          }
          ${
            input.note
              ? `<tr><td style="padding:16px 24px 0"><p style="margin:0;font-size:13px;line-height:1.6;color:#6b7c74">${escapeHtml(input.note)}</p></td></tr>`
              : ''
          }
          <tr>
            <td style="padding:20px 24px 22px">
              <hr style="border:none;border-top:1px solid #e3eae6;margin:0 0 12px">
              <p style="margin:0;font-size:11px;line-height:1.6;color:#8a9891">
                ${
                  isStaff
                    ? 'Sent by the Star Garden CRM because you are assigned to this work. Sign in to see the full record.'
                    : 'Sent by Star Garden. Please reply to this email if anything looks wrong.'
                }
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    input.heading,
    '',
    ...(input.intro ? [input.intro, ''] : []),
    ...rows.map((row) => `${row.label}: ${row.value}`),
    ...(rows.length ? [''] : []),
    ...(url ? [`${input.action!.label}: ${url}`, ''] : []),
    ...(input.note ? [input.note, ''] : []),
    isStaff ? 'Star Garden CRM — sign in to see the full record.' : 'Star Garden',
  ].join('\n');

  return { subject: input.subject, html, text };
}

/* -------------------------------------------------------------------------- */
/* Staff templates                                                             */
/* -------------------------------------------------------------------------- */

export function leadAssignedEmail(input: {
  leadId: string;
  leadCode: string;
  customerName: string;
  mobile: string;
  location?: string | null;
  source?: string | null;
  campaign?: string | null;
  nextAction?: string | null;
}): RenderedEmail {
  return renderEmail({
    subject: 'New lead assigned — Star Garden',
    heading: 'A new lead is assigned to you',
    intro: `${input.customerName} has been added to your list.`,
    rows: [
      { label: 'Lead', value: input.leadCode },
      { label: 'Customer', value: input.customerName },
      { label: 'Phone', value: input.mobile },
      { label: 'Location', value: input.location },
      { label: 'Source', value: input.source },
      { label: 'Campaign', value: input.campaign },
      { label: 'Next action', value: input.nextAction },
    ],
    action: { label: 'Open the lead', path: `/leads/${input.leadId}` },
    note: 'Call from your own phone using the Call button in the CRM, then record the outcome.',
  });
}

export function siteVisitAssignedEmail(input: {
  siteVisitId: string;
  customerName: string;
  address?: string | null;
  scheduledAt: string;
  bdmName?: string | null;
  notes?: string | null;
  changed?: boolean;
}): RenderedEmail {
  return renderEmail({
    subject: input.changed ? 'Site visit updated — Star Garden' : 'Site visit scheduled — Star Garden',
    heading: input.changed ? 'A site visit you are on has changed' : 'You are on a site visit',
    rows: [
      { label: 'Customer', value: input.customerName },
      { label: 'When', value: input.scheduledAt },
      { label: 'Where', value: input.address },
      { label: 'BDM', value: input.bdmName },
      { label: 'Notes', value: input.notes },
    ],
    action: { label: 'Open the visit', path: `/site-visits/${input.siteVisitId}` },
  });
}

export function designAssignedEmail(input: {
  designProjectId: string;
  leadCode: string;
  customerName: string;
  requirement?: string | null;
  dueAt?: string | null;
}): RenderedEmail {
  return renderEmail({
    subject: 'New design assigned — Star Garden',
    heading: 'A design project is assigned to you',
    rows: [
      { label: 'Lead', value: input.leadCode },
      { label: 'Customer', value: input.customerName },
      { label: 'Due', value: input.dueAt },
      { label: 'Requirement', value: input.requirement?.slice(0, 300) },
    ],
    action: { label: 'Open the design project', path: `/designs/${input.designProjectId}` },
  });
}

export function designRevisionEmail(input: {
  designProjectId: string;
  leadCode: string;
  versionNumber: number;
  notes: string;
}): RenderedEmail {
  return renderEmail({
    subject: 'Revision requested — Star Garden',
    heading: `Version ${input.versionNumber} needs a revision`,
    rows: [
      { label: 'Lead', value: input.leadCode },
      { label: 'Version', value: `v${input.versionNumber}` },
      { label: 'What to change', value: input.notes.slice(0, 500) },
    ],
    action: { label: 'Open the design project', path: `/designs/${input.designProjectId}` },
    note: 'Upload a new version — the previous one stays in the history.',
  });
}

export function executionAssignedEmail(input: {
  executionProjectId: string;
  leadCode: string;
  customerName: string;
  dueAt?: string | null;
}): RenderedEmail {
  return renderEmail({
    subject: 'Execution project assigned — Star Garden',
    heading: 'You are assigned to an execution project',
    rows: [
      { label: 'Lead', value: input.leadCode },
      { label: 'Customer', value: input.customerName },
      { label: 'Target completion', value: input.dueAt },
    ],
    action: { label: 'Open the project', path: `/execution/${input.executionProjectId}` },
  });
}

export function overdueWorkEmail(input: {
  heading: string;
  title: string;
  detail?: string | null;
  path: string;
}): RenderedEmail {
  return renderEmail({
    subject: `${input.heading} — Star Garden`,
    heading: input.heading,
    rows: [
      { label: 'Item', value: input.title },
      { label: 'Detail', value: input.detail },
    ],
    action: { label: 'Open in the CRM', path: input.path },
  });
}

/* -------------------------------------------------------------------------- */
/* Customer templates                                                          */
/*                                                                             */
/* Sent only from an explicit staff action — never automatically on an internal */
/* status change (add-on §6B).                                                  */
/* -------------------------------------------------------------------------- */

export function customerSiteVisitConfirmationEmail(input: {
  customerName: string;
  scheduledAt: string;
  address?: string | null;
  contactName?: string | null;
  contactMobile?: string | null;
}): RenderedEmail {
  return renderEmail({
    audience: 'customer',
    subject: 'Your site visit is confirmed — Star Garden',
    heading: `Thank you, ${input.customerName.split(' ')[0] ?? input.customerName}`,
    intro: 'Your site visit with Star Garden is confirmed. Here are the details.',
    rows: [
      { label: 'When', value: input.scheduledAt },
      { label: 'Where', value: input.address },
      { label: 'Your contact', value: input.contactName },
      { label: 'Phone', value: input.contactMobile },
    ],
    note: 'If this time does not suit you, reply to this email or call us and we will rearrange it.',
  });
}

/* -------------------------------------------------------------------------- */
/* Admin test                                                                  */
/* -------------------------------------------------------------------------- */

export function testEmail(sentBy: string): RenderedEmail {
  return renderEmail({
    subject: 'Star Garden CRM — test email',
    heading: 'Email is working',
    intro: `This test was sent from the Star Garden CRM by ${sentBy}.`,
    rows: [{ label: 'Sent at', value: new Date().toLocaleString('en-IN') }],
    note: 'If you received this, the SMTP settings on this deployment are correct.',
  });
}
