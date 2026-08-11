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

export async function exportLeadsCsv(
  user: SessionUser,
  filters: ExportFilters = {},
): Promise<{ csv: string; filename: string; rowCount: number }> {
  if (!canExportCsv(user)) {
    throw new AppError('FORBIDDEN', 'CSV export is available to Admins only.');
  }

  const supabase = await createClient();

  let query = supabase
    .from('leads')
    .select(
      '*, assigned_bdm:profiles!leads_assigned_bdm_id_fkey(full_name), created_by_profile:profiles!leads_created_by_fkey(full_name)',
    )
    .order('created_at', { ascending: false })
    .limit(10000);

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

  const { data, error } = await query;
  if (error) throw new AppError('INTERNAL', 'Could not build the export.', { cause: error });

  const rows = (data ?? []) as unknown as (Record<string, unknown> & {
    assigned_bdm: { full_name: string } | null;
    created_by_profile: { full_name: string } | null;
  })[];

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

  let query = supabase
    .from('activities')
    .select(
      '*, lead:leads!activities_lead_id_fkey(lead_code, customer_name), actor:profiles!activities_created_by_fkey(full_name)',
    )
    .order('activity_at', { ascending: false })
    .limit(10000);

  if (filters.from) query = query.gte('activity_at', filters.from);
  if (filters.to) query = query.lte('activity_at', filters.to);

  const { data, error } = await query;
  if (error) throw new AppError('INTERNAL', 'Could not build the export.', { cause: error });

  const rows = (data ?? []) as unknown as (Record<string, unknown> & {
    lead: { lead_code: string; customer_name: string } | null;
    actor: { full_name: string } | null;
  })[];

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

  return { items: data ?? [], total: count ?? 0, page, pageSize };
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
