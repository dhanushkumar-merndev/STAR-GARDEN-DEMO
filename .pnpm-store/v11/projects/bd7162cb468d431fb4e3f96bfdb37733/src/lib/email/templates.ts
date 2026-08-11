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

/**
 * One stage of the customer's job, as it appears in a status email.
 *
 * `DONE` / `CURRENT` / `PENDING` is spelled out in the label as well as drawn,
 * because a colour-only progress bar is unreadable in a dark-mode client and
 * invisible to a screen reader (§16).
 */
export interface PipelineStep {
  label: string;
  state: 'DONE' | 'CURRENT' | 'PENDING';
  detail?: string | null;
}

interface TemplateInput {
  subject: string;
  heading: string;
  intro?: string;
  rows?: Row[];
  steps?: PipelineStep[];
  note?: string | null;
  action?: { label: string; path: string };
  /** Overrides the CRM link with an arbitrary absolute URL (portal, WhatsApp). */
  externalAction?: { label: string; url: string };
  /** Customer-facing mail omits the internal footer. */
  audience?: 'staff' | 'customer';
  /** Replaces the default sign-off. Used for company contact details. */
  footerLines?: (string | null | undefined)[];
}

const STEP_STYLES: Record<
  PipelineStep['state'],
  { dot: string; border: string; label: string; mark: string; word: string }
> = {
  DONE: {
    dot: '#2f6b4f',
    border: '#2f6b4f',
    label: '#1f2a24',
    mark: '&#10003;',
    word: 'Done',
  },
  CURRENT: {
    dot: '#c98a1b',
    border: '#c98a1b',
    label: '#1f2a24',
    mark: '&#9679;',
    word: 'In progress',
  },
  PENDING: {
    dot: '#ffffff',
    border: '#cdd9d3',
    label: '#8a9891',
    mark: '&nbsp;',
    word: 'Not started',
  },
};

/**
 * Renders the pipeline as a table of rows, not a flex layout.
 *
 * Outlook's rendering engine is Word, which supports neither flexbox nor grid;
 * a table with fixed-width cells is the only construction that survives it.
 */
function renderSteps(steps: PipelineStep[]): string {
  const rows = steps
    .map((step, index) => {
      const style = STEP_STYLES[step.state];
      const isLast = index === steps.length - 1;

      return `
        <tr>
          <td width="28" style="padding:0;vertical-align:top">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="width:18px;height:18px;line-height:18px;text-align:center;border-radius:9px;background:${style.dot};border:2px solid ${style.border};color:#ffffff;font-size:11px;font-weight:700">${style.mark}</td>
              </tr>
              ${
                isLast
                  ? ''
                  : `<tr><td style="padding:0;text-align:center"><div style="width:2px;height:18px;background:#e3eae6;margin:0 auto"></div></td></tr>`
              }
            </table>
          </td>
          <td style="padding:0 0 ${isLast ? '0' : '10px'} 10px;vertical-align:top">
            <p style="margin:0;font-size:14px;font-weight:600;color:${style.label};line-height:18px">${escapeHtml(step.label)}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#6b7c74;line-height:1.5">
              ${style.word}${step.detail ? ` &middot; ${escapeHtml(step.detail)}` : ''}
            </p>
          </td>
        </tr>`;
    })
    .join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%">${rows}</table>`;
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

  const url = input.action
    ? absoluteUrl(input.action.path)
    : (input.externalAction?.url ?? null);
  const actionLabel = input.action?.label ?? input.externalAction?.label ?? '';
  const isStaff = (input.audience ?? 'staff') === 'staff';
  const stepsHtml = input.steps?.length ? renderSteps(input.steps) : '';
  const footerLines = (input.footerLines ?? []).filter(
    (line): line is string => Boolean(line && line.trim()),
  );

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
              <p style="margin:0;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#4f7d64;font-weight:700">Star Gardens</p>
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
            stepsHtml
              ? `<tr><td style="padding:${rowsHtml ? '16px' : '4px'} 24px 0">
                   <p style="margin:0 0 12px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b7c74;font-weight:700">Progress</p>
                   ${stepsHtml}
                 </td></tr>`
              : ''
          }
          ${
            url
              ? `<tr><td style="padding:20px 24px 0">
                   <a href="${escapeHtml(url)}" style="display:inline-block;background:#2f6b4f;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600">${escapeHtml(actionLabel)}</a>
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
                  footerLines.length
                    ? footerLines.map(escapeHtml).join('<br>')
                    : isStaff
                      ? 'Sent by the Star Gardens CRM because you are assigned to this work. Sign in to see the full record.'
                      : 'Sent by Star Gardens. Please reply to this email if anything looks wrong.'
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

  const stepLines = (input.steps ?? []).map((step) => {
    const marker = step.state === 'DONE' ? '[x]' : step.state === 'CURRENT' ? '[>]' : '[ ]';
    const suffix = step.detail ? ` — ${step.detail}` : '';
    return `${marker} ${step.label} (${STEP_STYLES[step.state].word})${suffix}`;
  });

  const text = [
    input.heading,
    '',
    ...(input.intro ? [input.intro, ''] : []),
    ...rows.map((row) => `${row.label}: ${row.value}`),
    ...(rows.length ? [''] : []),
    ...(stepLines.length ? ['Progress:', ...stepLines, ''] : []),
    ...(url ? [`${actionLabel}: ${url}`, ''] : []),
    ...(input.note ? [input.note, ''] : []),
    ...(footerLines.length
      ? footerLines
      : [isStaff ? 'Star Gardens CRM — sign in to see the full record.' : 'Star Gardens']),
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
    subject: 'New lead assigned — Star Gardens',
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
    subject: input.changed ? 'Site visit updated — Star Gardens' : 'Site visit scheduled — Star Gardens',
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
    subject: 'New design assigned — Star Gardens',
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
    subject: 'Revision requested — Star Gardens',
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
    subject: 'Execution project assigned — Star Gardens',
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
    subject: `${input.heading} — Star Gardens`,
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
    subject: 'Your site visit is confirmed — Star Gardens',
    heading: `Thank you, ${input.customerName.split(' ')[0] ?? input.customerName}`,
    intro: 'Your site visit with Star Gardens is confirmed. Here are the details.',
    rows: [
      { label: 'When', value: input.scheduledAt },
      { label: 'Where', value: input.address },
      { label: 'Your contact', value: input.contactName },
      { label: 'Phone', value: input.contactMobile },
    ],
    note: 'If this time does not suit you, reply to this email or call us and we will rearrange it.',
  });
}

/**
 * Company contact block, appended to every customer-facing message.
 *
 * Passed in rather than imported so the templates stay pure and testable — the
 * caller has already loaded the settings it needs.
 */
export interface BusinessContact {
  name: string;
  phone?: string | null;
  email?: string | null;
  whatsappUrl?: string | null;
}

function contactFooter(business: BusinessContact): string[] {
  return [
    business.name,
    business.phone ? `Phone: ${business.phone}` : null,
    business.email ? `Email: ${business.email}` : null,
    'You are receiving this because you enquired with us. Reply to this email if anything looks wrong.',
  ].filter((line): line is string => Boolean(line));
}

/**
 * Tells a staff member the role they have been given.
 *
 * Sent when an Admin activates an account or changes its role — §"after
 * assigning role admin needs to inform the users". Spells out what the role can
 * actually do, because "you are now an EXECUTION user" tells nobody anything.
 */
export function roleAssignedEmail(input: {
  fullName: string;
  roleLabel: string;
  roleSummary: string;
  assignedBy?: string | null;
  isNewAccount: boolean;
}): RenderedEmail {
  return renderEmail({
    subject: input.isNewAccount
      ? 'Your Star Gardens CRM access is ready'
      : 'Your Star Gardens CRM role has changed',
    heading: input.isNewAccount
      ? `Welcome, ${input.fullName.split(' ')[0] ?? input.fullName}`
      : 'Your role has been updated',
    intro: input.isNewAccount
      ? 'An Admin has approved your account. You can sign in now with the same Google address this message was sent to.'
      : `An Admin has changed what you can do in the CRM.`,
    rows: [
      { label: 'Your role', value: input.roleLabel },
      { label: 'Changed by', value: input.assignedBy },
    ],
    note: input.roleSummary,
    action: { label: 'Sign in to the CRM', path: '/login' },
  });
}

/* -------------------------------------------------------------------------- */
/* Customer portal                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Invites the customer to watch their own job.
 *
 * Deliberately not a "please confirm your subscription" mail. The customer gave
 * this address on their enquiry and the message contains only their own job's
 * progress, so an opt-in step would be a hurdle in front of something they
 * already asked for.
 */
export function clientPortalInviteEmail(input: {
  customerName: string;
  leadCode: string;
  loginEmail: string;
  business: BusinessContact;
}): RenderedEmail {
  return renderEmail({
    audience: 'customer',
    subject: `Track your garden project — ${input.business.name}`,
    heading: `Hello ${input.customerName.split(' ')[0] ?? input.customerName}`,
    intro:
      'You can now follow your project online and see exactly which stage it has reached — site visit, design, execution and handover.',
    rows: [
      { label: 'Your reference', value: input.leadCode },
      { label: 'Sign in with', value: input.loginEmail },
    ],
    action: { label: 'Sign in to view my project', path: '/portal' },
    note:
      'Sign in with Google using exactly the address shown above. There is no password to remember, ' +
      'and the page is read-only — nothing you do there can change your project.',
    footerLines: contactFooter(input.business),
  });
}

/**
 * The status update itself: a pipeline the customer can read at a glance.
 */
export function clientStatusUpdateEmail(input: {
  customerName: string;
  leadCode: string;
  headline: string;
  steps: PipelineStep[];
  business: BusinessContact;
  message?: string | null;
}): RenderedEmail {
  return renderEmail({
    audience: 'customer',
    subject: `${input.headline} — ${input.business.name}`,
    heading: input.headline,
    intro: `Hello ${input.customerName.split(' ')[0] ?? input.customerName}, here is where your project stands today.`,
    rows: [{ label: 'Reference', value: input.leadCode }],
    steps: input.steps,
    note: input.message,
    action: { label: 'View my project', path: '/portal' },
    footerLines: contactFooter(input.business),
  });
}

/**
 * Sent when the Admin records the final value and closes the job.
 */
export function accountClosedEmail(input: {
  customerName: string;
  leadCode: string;
  totalAmount: string;
  balanceAmount: string;
  business: BusinessContact;
}): RenderedEmail {
  return renderEmail({
    audience: 'customer',
    subject: `Your project is complete — ${input.business.name}`,
    heading: 'Your garden is finished',
    intro: `Thank you for choosing ${input.business.name}. Your project has been completed and closed.`,
    rows: [
      { label: 'Reference', value: input.leadCode },
      { label: 'Project value', value: input.totalAmount },
      { label: 'Balance due', value: input.balanceAmount },
    ],
    note: 'Keep this email for your records. Get in touch any time about maintenance or a new space.',
    footerLines: contactFooter(input.business),
  });
}

/* -------------------------------------------------------------------------- */
/* Admin test                                                                  */
/* -------------------------------------------------------------------------- */

export function testEmail(sentBy: string, provider: string): RenderedEmail {
  return renderEmail({
    subject: 'Star Gardens CRM — test email',
    heading: 'Email is working',
    intro: `This test was sent from the Star Gardens CRM by ${sentBy}.`,
    rows: [
      { label: 'Provider', value: provider },
      { label: 'Sent at', value: new Date().toLocaleString('en-IN') },
    ],
    steps: [
      { label: 'Provider accepted the message', state: 'DONE' },
      { label: 'Delivered to this inbox', state: 'DONE' },
      { label: 'Formatting renders correctly', state: 'CURRENT', detail: 'you are looking at it' },
    ],
    note: `If you received this, the ${provider} settings on this deployment are correct.`,
  });
}
