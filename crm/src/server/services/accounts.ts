import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { AuditAction, recordAudit } from '@/lib/audit';
import { canRecordAccount, canViewAccounts } from '@/lib/permissions';
import { humanizePostgresError } from './leads';
import type { SessionUser } from '@/lib/auth/session';
import type { LeadAccountRow, LeadStatus, PaymentStatus } from '@/types/database';

/**
 * Accounts (operations brief §"accounts page").
 *
 * The last stage of the pipeline. Once execution finishes, an Admin records
 * what the job was worth, what has been collected, and closes it. Nothing here
 * is visible to a BDM, a designer or the execution team — money is Admin-only
 * in both directions (§7.1).
 *
 * Every write goes through the `record_lead_account` SQL function so the
 * account row, the lead's own status and the timeline entry move together. A
 * lead sitting at CLOSED with no account row, or an account closed against a
 * lead still shown as in-progress, are states the screen would then have to
 * apologise for.
 */

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export type AccountsTab = 'READY' | 'OPEN' | 'CLOSED' | 'ALL';

export interface AccountsFilters {
  tab?: AccountsTab;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface AccountListItem {
  lead_id: string;
  lead_code: string;
  customer_name: string;
  mobile_country_code: string;
  mobile_normalized: string;
  email: string | null;
  location_text: string | null;
  site_address: string | null;
  requirement_summary: string | null;
  lead_status: LeadStatus;
  owner_name: string | null;
  execution_status: string | null;
  execution_completed_at: string | null;
  account: LeadAccountRow | null;
}

/**
 * The Accounts register.
 *
 * `READY` is the tab that matters day to day: execution has finished but no
 * value has been recorded yet, which is exactly the queue an Admin works
 * through. It is derived rather than stored, so a job cannot be forgotten by
 * failing to tick a box somewhere upstream.
 */
export async function listAccounts(
  user: SessionUser,
  filters: AccountsFilters = {},
): Promise<{
  items: AccountListItem[];
  total: number;
  page: number;
  pageSize: number;
  totals: { agreed: number; received: number; balance: number };
}> {
  if (!canViewAccounts(user)) {
    throw new AppError('FORBIDDEN', 'Accounts are Admin-only.');
  }

  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 25));
  const tab = filters.tab ?? 'READY';

  const from = (page - 1) * pageSize;
  const { data, error } = await supabase.rpc('accounts_register_page', {
    p_tab: tab,
    p_search: filters.search?.trim() || null,
    p_offset: from,
    p_limit: pageSize,
  });

  if (error || !data || Array.isArray(data) || typeof data !== 'object') {
    throw new AppError('INTERNAL', 'Could not load accounts.', { cause: error });
  }

  const result = data as unknown as {
    items: AccountListItem[];
    total: number;
    totals: { agreed: number; received: number; balance: number };
  };

  return {
    items: result.items ?? [],
    total: result.total ?? 0,
    page,
    pageSize,
    totals: result.totals ?? { agreed: 0, received: 0, balance: 0 },
  };
}

export async function getAccountForLead(
  user: SessionUser,
  leadId: string,
): Promise<LeadAccountRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('lead_accounts')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  return data ?? null;
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

export interface RecordAccountInput {
  lead_id: string;
  total_amount: number;
  received_amount?: number;
  payment_status?: PaymentStatus;
  invoice_number?: string;
  notes?: string;
  /** Closes the job and moves the lead to CLOSED. */
  close?: boolean;
}

export async function recordAccount(
  user: SessionUser,
  input: RecordAccountInput,
): Promise<LeadAccountRow> {
  if (!canRecordAccount(user)) {
    throw new AppError('FORBIDDEN', 'Only an Admin can record a project value.');
  }

  const total = Number(input.total_amount);
  const received = Number(input.received_amount ?? 0);

  if (!Number.isFinite(total) || total < 0) {
    throw new AppError('VALIDATION', 'Enter a valid project value.', {
      fields: { total_amount: 'Enter an amount of 0 or more.' },
    });
  }

  if (!Number.isFinite(received) || received < 0) {
    throw new AppError('VALIDATION', 'Enter a valid received amount.', {
      fields: { received_amount: 'Enter an amount of 0 or more.' },
    });
  }

  // The database has the same constraint. Catching it here turns a constraint
  // violation into a field error the Admin can act on.
  if (received > total) {
    throw new AppError('VALIDATION', 'Received cannot exceed the project value.', {
      fields: { received_amount: 'This is more than the project value.' },
    });
  }

  const status = input.payment_status ?? derivePaymentStatus(total, received);

  if (input.close && total <= 0 && status !== 'WRITTEN_OFF') {
    throw new AppError('VALIDATION', 'A closed job needs a value.', {
      fields: {
        total_amount: 'Enter the project value, or mark the job written off.',
      },
    });
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from('lead_accounts')
    .select('total_amount, received_amount, payment_status, closed_at')
    .eq('lead_id', input.lead_id)
    .maybeSingle();

  const { data: account, error } = await supabase.rpc('record_lead_account', {
    p_lead_id: input.lead_id,
    p_total_amount: total,
    p_received_amount: received,
    p_payment_status: status,
    p_invoice_number: input.invoice_number?.trim() || null,
    p_notes: input.notes?.trim() || null,
    p_close: input.close === true,
  });

  if (error || !account) {
    throw new AppError(
      'INTERNAL',
      humanizePostgresError(error, 'Could not record the project value.'),
      { cause: error },
    );
  }

  await recordAudit({
    actorUserId: user.id,
    action: input.close ? AuditAction.ACCOUNT_CLOSED : AuditAction.ACCOUNT_RECORDED,
    entityType: 'lead_account',
    entityId: account.id,
    before: before ?? undefined,
    after: {
      lead_id: input.lead_id,
      total_amount: account.total_amount,
      received_amount: account.received_amount,
      payment_status: account.payment_status,
      closed_at: account.closed_at,
      invoice_number: account.invoice_number,
    },
  });

  return account;
}

/**
 * The status implied by the two figures, when the Admin has not chosen one.
 *
 * Never returns WRITTEN_OFF — writing a job off is a decision, not something
 * arithmetic can conclude.
 */
export function derivePaymentStatus(total: number, received: number): PaymentStatus {
  if (total > 0 && received >= total) return 'PAID';
  if (received > 0) return 'PARTIAL';
  return 'PENDING';
}

/* -------------------------------------------------------------------------- */
/* Export                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One spreadsheet row.
 *
 * The index signature is what lets `recordsToXlsx` treat this as a generic
 * record while the named keys keep the column order — and the column headings —
 * defined here in one readable place.
 */
export interface AccountExportRow {
  [column: string]: string | number;
  'Lead code': string;
  Customer: string;
  Phone: string;
  Email: string;
  Location: string;
  'Site address': string;
  Requirement: string;
  Owner: string;
  'Execution status': string;
  'Completed on': string;
  Currency: string;
  'Project value': number | string;
  Received: number | string;
  Balance: number | string;
  'Payment status': string;
  Invoice: string;
  'Closed on': string;
  Notes: string;
}

/**
 * Every account row, flattened for the spreadsheet.
 *
 * Not paginated: an export that silently covered only page one would be the
 * worst possible bug in a financial register.
 */
export async function collectAccountExportRows(
  user: SessionUser,
  tab: AccountsTab = 'ALL',
): Promise<AccountExportRow[]> {
  if (!canViewAccounts(user)) {
    throw new AppError('FORBIDDEN', 'Accounts are Admin-only.');
  }

  const rows: AccountListItem[] = [];
  const pageSize = 500;

  // Paged internally so a large register never builds one enormous response.
  for (let page = 1; ; page += 1) {
    const batch = await listAccounts(user, { tab, page, pageSize });
    rows.push(...batch.items);
    if (rows.length >= batch.total || batch.items.length === 0) break;
  }

  return rows.map((row) => ({
    'Lead code': row.lead_code,
    Customer: row.customer_name,
    Phone: `${row.mobile_country_code} ${row.mobile_normalized}`,
    Email: row.email ?? '',
    Location: row.location_text ?? '',
    'Site address': row.site_address ?? '',
    Requirement: row.requirement_summary ?? '',
    Owner: row.owner_name ?? '',
    'Execution status': row.execution_status ?? '',
    'Completed on': formatDate(row.execution_completed_at),
    Currency: row.account?.currency ?? 'INR',
    'Project value': row.account ? Number(row.account.total_amount) : '',
    Received: row.account ? Number(row.account.received_amount) : '',
    Balance: row.account ? Number(row.account.balance_amount) : '',
    'Payment status': row.account?.payment_status ?? 'NOT RECORDED',
    Invoice: row.account?.invoice_number ?? '',
    'Closed on': formatDate(row.account?.closed_at ?? null),
    Notes: row.account?.notes ?? '',
  }));
}

function formatDate(value: string | null): string {
  if (!value) return '';
  // ISO date, not a locale string: a spreadsheet parses `2026-08-11` as a date
  // in every region, whereas `11/08/2026` is ambiguous by half the world.
  return new Date(value).toISOString().slice(0, 10);
}
