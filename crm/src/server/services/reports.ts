import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { AuditAction, recordAudit } from '@/lib/audit';
import { canExportCsv } from '@/lib/permissions';
import { formatMobile } from '@/lib/utils/phone';
import type { SessionUser } from '@/lib/auth/session';
import type { LeadSource, LeadStatus } from '@/types/database';

/**
 * Reports and CSV export (AGENTS.md §12, §11.7).
 *
 * "Reports must respect role permissions. CSV export is Admin-only unless
 * explicitly expanded." Both halves are enforced here: the role check below,
 * and RLS on every underlying query.
 */

export interface ExportFilters {
  from?: string;
  to?: string;
  status?: string;
  source?: string;
  assignedTo?: string;
}

/**
 * Escapes a CSV cell.
 *
 * The leading-quote guard is not cosmetic: a cell starting with `=`, `+`, `-`
 * or `@` is executed as a formula when the file is opened in Excel, and lead
 * data is attacker-influenced (a customer chooses their own name). Prefixing a
 * single quote neutralises it.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);

  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  // BOM so Excel opens UTF-8 names (e.g. Kannada, Hindi) correctly.
  return `﻿${lines.join('\r\n')}\r\n`;
}

const EXPORT_PAGE_SIZE = 1000;
const MAX_EXPORT_ROWS = 50_000;

export async function exportLeadsCsv(
  user: SessionUser,
  filters: ExportFilters = {},
): Promise<{ csv: string; filename: string; rowCount: number }> {
  if (!canExportCsv(user)) {
    throw new AppError('FORBIDDEN', 'CSV export is available to Admins only.');
  }

  const supabase = await createClient();

  type LeadExportRow = Record<string, unknown> & {
    assigned_bdm: { full_name: string } | null;
    created_by_profile: { full_name: string } | null;
  };
  const rows: LeadExportRow[] = [];

  for (let offset = 0; ; offset += EXPORT_PAGE_SIZE) {
    let query = supabase
      .from('leads')
      .select(
        'lead_code, customer_name, mobile_country_code, mobile_normalized, email, location_text, site_address, requirement_summary, source, status, design_required, next_action_at, last_activity_at, lost_reason, created_at, assigned_bdm:profiles!leads_assigned_bdm_id_fkey(full_name), created_by_profile:profiles!leads_created_by_fkey(full_name)',
      )
      .order('created_at', { ascending: false });

    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) query = query.lte('created_at', filters.to);
    if (filters.status && filters.status !== 'ALL') {
      query = query.eq('status', filters.status as LeadStatus);
    }
    if (filters.source && filters.source !== 'ALL') {
      query = query.eq('source', filters.source as LeadSource);
    }
    if (filters.assignedTo && filters.assignedTo !== 'ALL') {
      query = filters.assignedTo === 'UNASSIGNED'
        ? query.is('assigned_bdm_id', null)
        : query.eq('assigned_bdm_id', filters.assignedTo);
    }

    const { data, error } = await query.range(offset, offset + EXPORT_PAGE_SIZE - 1);
    if (error) throw new AppError('INTERNAL', 'Could not build the export.', { cause: error });

    const page = (data ?? []) as unknown as LeadExportRow[];
    rows.push(...page);
    if (rows.length > MAX_EXPORT_ROWS) {
      throw new AppError(
        'VALIDATION',
        `This export has more than ${MAX_EXPORT_ROWS.toLocaleString('en-IN')} rows. Narrow the date or status filters and try again.`,
      );
    }
    if (page.length < EXPORT_PAGE_SIZE) break;
  }

  const csv = toCsv(
    [
      'Lead code',
      'Customer name',
      'Mobile',
      'Email',
      'Location',
      'Site address',
      'Requirement',
      'Source',
      'Status',
      'Assigned BDM',
      'Design required',
      'Next action',
      'Last activity',
      'Lost reason',
      'Created by',
      'Created at',
    ],
    rows.map((lead) => [
      lead.lead_code,
      lead.customer_name,
      formatMobile(lead.mobile_country_code as string, lead.mobile_normalized as string),
      lead.email,
      lead.location_text,
      lead.site_address,
      lead.requirement_summary,
      lead.source,
      lead.status,
      lead.assigned_bdm?.full_name ?? 'Unassigned',
      lead.design_required ? 'Yes' : 'No',
      lead.next_action_at,
      lead.last_activity_at,
      lead.lost_reason,
      lead.created_by_profile?.full_name ?? '',
      lead.created_at,
    ]),
  );

  const filename = `stargarden-leads-${new Date().toISOString().slice(0, 10)}.csv`;

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.EXPORT_GENERATED,
    entityType: 'report',
    after: { report: 'leads', filters, row_count: rows.length },
  });

  return { csv, filename, rowCount: rows.length };
}

export async function exportActivitiesCsv(
  user: SessionUser,
  filters: ExportFilters = {},
): Promise<{ csv: string; filename: string; rowCount: number }> {
  if (!canExportCsv(user)) {
    throw new AppError('FORBIDDEN', 'CSV export is available to Admins only.');
  }

  const supabase = await createClient();

  type ActivityExportRow = Record<string, unknown> & {
    lead: { lead_code: string; customer_name: string } | null;
    actor: { full_name: string } | null;
  };
  const rows: ActivityExportRow[] = [];

  for (let offset = 0; ; offset += EXPORT_PAGE_SIZE) {
    let query = supabase
      .from('activities')
      .select(
        'type, outcome, notes, next_action, activity_at, lead:leads!activities_lead_id_fkey(lead_code, customer_name), actor:profiles!activities_created_by_fkey(full_name)',
      )
      .order('activity_at', { ascending: false });

    if (filters.from) query = query.gte('activity_at', filters.from);
    if (filters.to) query = query.lte('activity_at', filters.to);

    const { data, error } = await query.range(offset, offset + EXPORT_PAGE_SIZE - 1);
    if (error) throw new AppError('INTERNAL', 'Could not build the export.', { cause: error });

    const page = (data ?? []) as unknown as ActivityExportRow[];
    rows.push(...page);
    if (rows.length > MAX_EXPORT_ROWS) {
      throw new AppError(
        'VALIDATION',
        `This export has more than ${MAX_EXPORT_ROWS.toLocaleString('en-IN')} rows. Narrow the date filters and try again.`,
      );
    }
    if (page.length < EXPORT_PAGE_SIZE) break;
  }

  const csv = toCsv(
    ['Lead code', 'Customer', 'Type', 'Outcome', 'Notes', 'Next action', 'Recorded by', 'When'],
    rows.map((a) => [
      a.lead?.lead_code,
      a.lead?.customer_name,
      a.type,
      a.outcome,
      a.notes,
      a.next_action,
      a.actor?.full_name,
      a.activity_at,
    ]),
  );

  await recordAudit({
    actorUserId: user.id,
    action: AuditAction.EXPORT_GENERATED,
    entityType: 'report',
    after: { report: 'activities', filters, row_count: rows.length },
  });

  return {
    csv,
    filename: `stargarden-activities-${new Date().toISOString().slice(0, 10)}.csv`,
    rowCount: rows.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Audit history (§11.7, §17)                                                  */
/* -------------------------------------------------------------------------- */

export async function listAuditLog(
  user: SessionUser,
  options: { entityType?: string; entityId?: string; action?: string; page?: number } = {},
) {
  if (!user.isAdmin) throw new AppError('FORBIDDEN', 'Audit history is Admin-only.');

  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = 50;

  let query = supabase
    .from('audit_logs')
    .select('*, actor:profiles!audit_logs_actor_user_id_fkey(full_name, role)', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (options.entityType) query = query.eq('entity_type', options.entityType);
  if (options.entityId) query = query.eq('entity_id', options.entityId);
  if (options.action) query = query.eq('action', options.action);

  const from = (page - 1) * pageSize;
  const { data, count, error } = await query.range(from, from + pageSize - 1);

  if (error) throw new AppError('INTERNAL', 'Could not load the audit log.', { cause: error });

  const items = data ?? [];
  return { items, total: count ?? 0, page, pageSize, names: await resolveAuditNames(supabase, items) };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every UUID anywhere in a payload, so one lookup can cover the whole page. */
function collectIds(value: unknown, into: Set<string>, depth = 0): void {
  if (depth > 3 || value === null || value === undefined) return;

  if (typeof value === 'string') {
    if (UUID_RE.test(value)) into.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, into, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectIds(item, into, depth + 1);
    }
  }
}

/**
 * Resolves the foreign keys inside audit payloads to names the reader knows.
 *
 * Two queries for a whole page, not one per row: the ids are gathered first and
 * looked up together. A failure here degrades the display to bare ids — it must
 * never take down the audit page, which is the one screen that has to load when
 * something else has gone wrong.
 */
async function resolveAuditNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: { entity_id?: string | null; before_data?: unknown; after_data?: unknown }[],
): Promise<Record<string, string>> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.entity_id && UUID_RE.test(row.entity_id)) ids.add(row.entity_id);
    collectIds(row.before_data, ids);
    collectIds(row.after_data, ids);
  }
  if (ids.size === 0) return {};

  const list = [...ids];
  const names: Record<string, string> = {};

  try {
    const [profiles, leads] = await Promise.all([
      supabase.from('profiles').select('id, full_name').in('id', list),
      supabase.from('leads').select('id, lead_code, customer_name').in('id', list),
    ]);

    for (const row of profiles.data ?? []) names[row.id] = row.full_name;
    for (const row of leads.data ?? []) names[row.id] = `${row.lead_code} · ${row.customer_name}`;
  } catch (error) {
    console.error('[audit] could not resolve names', error);
  }

  return names;
}

/** File access history for the Admin integration/security screen (§7.1). */
export async function listFileAccessLog(user: SessionUser, limit = 100) {
  if (!user.isAdmin) throw new AppError('FORBIDDEN', 'File access history is Admin-only.');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('file_access_logs')
    .select(
      '*, file:files!file_access_logs_file_id_fkey(original_filename, category), user:profiles!file_access_logs_user_id_fkey(full_name)',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new AppError('INTERNAL', 'Could not load file access history.', { cause: error });
  return data ?? [];
}
