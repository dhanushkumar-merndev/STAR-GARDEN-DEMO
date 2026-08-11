import { formatDateTime, formatMoney, humanizeEnum } from '@/lib/utils/format';

/**
 * Turns a stored audit row into something an Admin can read (AGENTS.md §17).
 *
 * The trail is written for reconstruction, not for reading: `after_data` is a
 * raw snapshot of whatever the service decided mattered, full of foreign keys
 * and screaming-case enums. Dumping that JSON on screen technically discloses
 * everything and communicates nothing.
 *
 * So this layer restates each row as a sentence and a short list of facts, and
 * drops what a human cannot use — chiefly bare UUIDs, which are noise unless
 * they resolve to a name. Nothing is destroyed: the page still offers the raw
 * payload, because an audit trail that quietly hides a field is worse than an
 * ugly one.
 */

export type AuditTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info';

export interface AuditFact {
  label: string;
  value: string;
  /** Present only when the field changed: what it held beforehand. */
  from?: string;
}

export interface AuditDescription {
  /** "Site visit completed" */
  headline: string;
  /** "Site visit" */
  entityLabel: string;
  tone: AuditTone;
  facts: AuditFact[];
}

/** Maps a UUID to a display name. Built per page by `listAuditLog`. */
export type NameLookup = Record<string, string>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Headlines that `humanizeEnum` alone gets wrong or states awkwardly. Anything
 * absent falls back to the action name, which is already written to read as a
 * past-tense event ("site_visit.completed" -> "Site visit completed").
 */
const HEADLINES: Record<string, string> = {
  'call.attempt_recorded': 'Call dialled',
  'lead.duplicate_blocked': 'Duplicate lead blocked',
  'lead.disposition_recorded': 'Call outcome decided',
  'site_visit.arrived': 'Arrived at site',
  'site_visit.journey_started': 'Left for site',
  'design.version_ready_for_review': 'Design sent for review',
  'design.version_uploaded': 'Design version uploaded',
  'export.generated': 'Export downloaded',
  'setting.updated': 'Setting changed',
  'website.enquiry_received': 'Website enquiry received',
  'portal.status_emailed': 'Status update emailed',
  META_WEBHOOK_UNMAPPED_FORM: 'Meta form not mapped',
  META_SYNC_MANUAL_TRIGGERED: 'Meta sync run by hand',
  LEAD_META_ATTRIBUTION_CREATED: 'Meta attribution linked',
  META_AD_ACCOUNT_SELECTED: 'Meta ad account selected',
  META_CAMPAIGN_SELECTION_CHANGED: 'Meta campaign selection changed',
};

/** Field names whose auto-derived label reads badly or loses the point. */
const FIELD_LABELS: Record<string, string> = {
  applied_to_existing: 'Applied to an existing account',
  approved_design_version_id: 'Approved design',
  assigned_bdm_id: 'Assigned to',
  assigned_designer_id: 'Designer',
  assignees: 'Team',
  blocker_notes: 'Blocker',
  blocker_summary: 'Blocker',
  check_in_at: 'Checked in',
  check_out_at: 'Checked out',
  closed_at: 'Closed',
  completed_by_connected_call: 'Closed by a connected call',
  completion_override_reason: 'Override reason',
  crm_field: 'CRM field',
  design_required: 'Design needed',
  duplicate_override: 'Overrode duplicate',
  existing_lead_code: 'Existing lead',
  follow_up_at: 'Follow-up',
  has_message: 'Included a message',
  invoice_number: 'Invoice',
  is_active: 'Active',
  is_approved_version: 'Approved version',
  is_archived: 'Archived',
  is_mandatory: 'Mandatory',
  is_primary: 'Primary contact',
  journey_started_at: 'Journey started',
  lead_code: 'Lead',
  lead_id: 'Lead',
  location_shared: 'Location shared',
  lost_reason: 'Reason',
  meta_form_id: 'Meta form',
  mobile_normalized: 'Mobile',
  next_action: 'Next action',
  original_filename: 'File',
  override_reason: 'Override reason',
  payment_status: 'Payment',
  received_amount: 'Received',
  row_count: 'Rows',
  scheduled_start_at: 'Scheduled for',
  size_bytes: 'Size',
  sync_type: 'Sync',
  to_user_id: 'Assigned to',
  total_amount: 'Project value',
  version_number: 'Version',
};

/** Words in an action name that say how the event should feel. */
const DANGER = ['fail', 'cancel', 'revok', 'deactivat', 'blocked', 'unmapped', 'disabled'];
const OK = ['complet', 'approv', 'created', 'checked_out', 'arrived', 'reactivat', 'granted'];
const WARN = ['revision', 'reschedul', 'duplicate', 'override'];

function toneFor(action: string): AuditTone {
  const key = action.toLowerCase();
  if (DANGER.some((word) => key.includes(word))) return 'danger';
  if (WARN.some((word) => key.includes(word))) return 'warn';
  if (OK.some((word) => key.includes(word))) return 'ok';
  return 'brand';
}

function labelFor(key: string): string {
  const override = FIELD_LABELS[key];
  if (override) return override;

  // `_at` and `_id` suffixes are storage detail, not something to read aloud.
  const trimmed = key.replace(/_(at|id)$/, '');
  return humanizeEnum(trimmed);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * `true` for the SCREAMING_CASE the database uses for every enum.
 *
 * Length is the tell that separates `LOST` from `INR`. Short all-caps tokens in
 * this data are acronyms and codes — a role of `BDM`, a currency of `INR`, a
 * country of `IN` — and sentence-casing them into "Bdm" reads as a bug. Four or
 * more letters, or any underscore, means a status.
 */
function looksLikeEnum(value: string): boolean {
  if (!/^[A-Z][A-Z0-9_]+$/.test(value)) return false;
  return value.includes('_') || value.length >= 4;
}

/**
 * Renders one value. Returns null when the value carries nothing a reader can
 * use — an unresolvable UUID, an empty list, a null — so the caller can drop
 * the row entirely rather than print "Lead: —".
 */
function formatValue(key: string, value: unknown, names: NameLookup): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  if (typeof value === 'number') {
    if (key === 'size_bytes') return formatBytes(value);
    if (key.endsWith('_amount')) return formatMoney(value);
    return value.toLocaleString('en-IN');
  }

  if (typeof value === 'string') {
    if (UUID_RE.test(value)) return names[value] ?? null;
    if (key.endsWith('_at')) {
      const formatted = formatDateTime(value);
      return formatted === '—' ? value : formatted;
    }
    if (key.endsWith('_amount')) return formatMoney(value);
    if (looksLikeEnum(value)) return humanizeEnum(value);
    return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return null;

    const primitives = value.filter((item) => typeof item === 'string' || typeof item === 'number');
    if (primitives.length === value.length) {
      const resolved = primitives
        .map((item) => (typeof item === 'string' ? (names[item] ?? (UUID_RE.test(item) ? null : item)) : String(item)))
        .filter((item): item is string => item !== null);
      if (resolved.length === 0) return `${value.length} selected`;
      return resolved.join(', ');
    }

    return `${value.length} ${value.length === 1 ? 'entry' : 'entries'}`;
  }

  return null;
}

/**
 * Flattens a payload into readable rows. Nested objects are followed one level
 * — settings write `{ key: { nested } }` and that nesting is the content.
 */
function collectFacts(
  data: unknown,
  names: NameLookup,
  prefix: string | null,
  out: AuditFact[],
): void {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;

  for (const [key, raw] of Object.entries(data as Record<string, unknown>)) {
    const label = prefix ? `${prefix} · ${labelFor(key)}` : labelFor(key);

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      if (prefix) continue; // Two levels is as deep as this stays readable.
      collectFacts(raw, names, label, out);
      continue;
    }

    const value = formatValue(key, raw, names);
    if (value !== null) out.push({ label, value });
  }
}

export interface AuditRow {
  action: string;
  entity_type: string;
  before_data?: unknown;
  after_data?: unknown;
}

export function describeAuditEntry(entry: AuditRow, names: NameLookup = {}): AuditDescription {
  const headline = HEADLINES[entry.action] ?? humanizeEnum(entry.action.replace(/\./g, ' '));

  const after: AuditFact[] = [];
  collectFacts(entry.after_data, names, null, after);

  const before: AuditFact[] = [];
  collectFacts(entry.before_data, names, null, before);
  const previous = new Map(before.map((fact) => [fact.label, fact.value]));

  const facts = after.map((fact) => {
    const was = previous.get(fact.label);
    previous.delete(fact.label);
    return was !== undefined && was !== fact.value ? { ...fact, from: was } : fact;
  });

  // A field that existed before and is gone afterwards was cleared, and that is
  // often the whole event — an unassigned lead, a removed designer.
  for (const [label, value] of previous) {
    facts.push({ label, value: 'Cleared', from: value });
  }

  return {
    headline,
    entityLabel: humanizeEnum(entry.entity_type),
    tone: toneFor(entry.action),
    facts,
  };
}
