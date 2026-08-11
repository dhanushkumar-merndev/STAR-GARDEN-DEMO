import type { Metadata } from 'next';
import Link from 'next/link';
import { LuWallet } from 'react-icons/lu';
import { requirePageRole } from '@/lib/auth/session';
import { listAccounts, type AccountsTab } from '@/server/services/accounts';
import { Badge, Card, EmptyState, PageHeader, StatTile, type Tone } from '@/components/ui';
import {
  ExportAccountsButton,
  RecordAccountDialog,
} from '@/components/accounts/account-actions';
import { formatDate, formatMoney, formatMoneyCompact } from '@/lib/utils/format';
import { formatMobile } from '@/lib/utils/phone';
import type { PaymentStatus } from '@/types/database';

export const metadata: Metadata = { title: 'Accounts' };

/**
 * Accounts — the last stage of the pipeline.
 *
 * Four tabs in the order the work is actually done:
 *
 *   Ready to bill  execution finished, no value recorded yet. This is the queue.
 *   Open           a value exists, the job is not closed. This is the debtors list.
 *   Closed         finished business.
 *   All            everything, for the export.
 *
 * "Ready to bill" is derived from the execution project's own status rather
 * than stored, so a job cannot fall out of the queue because somebody forgot to
 * tick a box upstream.
 */

const TABS: { key: AccountsTab; label: string; hint: string }[] = [
  { key: 'READY', label: 'Ready to bill', hint: 'Execution finished, nothing recorded yet' },
  { key: 'OPEN', label: 'Open', hint: 'Value recorded, not yet closed' },
  { key: 'CLOSED', label: 'Closed', hint: 'Finished and closed' },
  { key: 'ALL', label: 'All', hint: 'Every job' },
];

const PAYMENT_TONES: Record<PaymentStatus, Tone> = {
  PENDING: 'warn',
  PARTIAL: 'info',
  PAID: 'ok',
  WRITTEN_OFF: 'neutral',
};

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Payment pending',
  PARTIAL: 'Part paid',
  PAID: 'Paid',
  WRITTEN_OFF: 'Written off',
};

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageRole('ADMIN');
  const params = await searchParams;

  const tab = (TABS.find((t) => t.key === params.tab)?.key ?? 'READY') as AccountsTab;
  const search = typeof params.q === 'string' ? params.q : undefined;
  const page = Number.parseInt(
    typeof params.page === 'string' ? params.page : '1',
    10,
  );

  const { items, total, pageSize, totals } = await listAccounts(user, {
    tab,
    search,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  });

  const currentPage = Number.isFinite(page) && page > 0 ? page : 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeTab = TABS.find((t) => t.key === tab)!;

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle={activeTab.hint}
        action={<ExportAccountsButton tab={tab} />}
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Agreed value" value={formatMoneyCompact(totals.agreed)} tone="brand" />
        <StatTile label="Received" value={formatMoneyCompact(totals.received)} tone="ok" />
        <StatTile
          label="Outstanding"
          value={formatMoneyCompact(totals.balance)}
          tone={totals.balance > 0 ? 'warn' : 'neutral'}
        />
        <StatTile label={activeTab.label} value={total} />
      </div>

      {/* Horizontal scroll rather than wrapping: four tabs that reflow onto two
          lines on a phone read as two unrelated groups. */}
      <div className="mb-3 -mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        <nav className="flex w-max gap-1 rounded-lg bg-surface-muted p-1" aria-label="Account view">
          {TABS.map((item) => {
            const active = item.key === tab;
            return (
              <Link
                key={item.key}
                href={`/accounts?tab=${item.key}`}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'rounded-md bg-surface px-3 py-2 text-sm font-semibold text-ink shadow-sm'
                    : 'rounded-md px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink'
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <form method="get" className="mb-3 flex gap-2">
        <input type="hidden" name="tab" value={tab} />
        <input
          name="q"
          defaultValue={search ?? ''}
          placeholder="Search name, phone or lead code"
          aria-label="Search accounts"
          className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
        />
        <button
          type="submit"
          className="h-11 shrink-0 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-muted"
        >
          Search
        </button>
      </form>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LuWallet className="size-8" />}
            title="Nothing here yet"
            description={
              tab === 'READY'
                ? 'Jobs appear here as soon as their execution project is marked complete.'
                : 'No jobs match this view.'
            }
          />
        </Card>
      ) : (
        // Cards rather than a table: each row carries a phone number, three
        // money figures and an action, which a table squeezes unreadably on a
        // phone.
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.lead_id}>
              <Card className="p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/leads/${item.lead_id}`}
                      className="text-sm font-semibold text-ink hover:text-brand-700"
                    >
                      {item.customer_name}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {item.lead_code} ·{' '}
                      {formatMobile(item.mobile_country_code, item.mobile_normalized)}
                      {item.location_text ? ` · ${item.location_text}` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {item.account ? (
                      <Badge tone={PAYMENT_TONES[item.account.payment_status]}>
                        {PAYMENT_LABELS[item.account.payment_status]}
                      </Badge>
                    ) : (
                      <Badge tone="warn">Not recorded</Badge>
                    )}
                    {item.account?.closed_at ? <Badge tone="ok">Closed</Badge> : null}
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                  <Figure label="Project value" value={formatMoney(item.account?.total_amount)} />
                  <Figure label="Received" value={formatMoney(item.account?.received_amount)} />
                  <Figure
                    label="Balance"
                    value={formatMoney(item.account?.balance_amount)}
                    emphasise={Number(item.account?.balance_amount ?? 0) > 0}
                  />
                  <Figure
                    label="Execution done"
                    value={formatDate(item.execution_completed_at) || '—'}
                  />
                </dl>

                <div className="mt-3 flex justify-end">
                  <RecordAccountDialog
                    leadId={item.lead_id}
                    leadCode={item.lead_code}
                    customerName={item.customer_name}
                    account={item.account}
                  />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
          <p className="text-xs text-ink-muted">
            Page {currentPage} of {totalPages} · {total} jobs
          </p>
          <div className="flex gap-2">
            <PageLink tab={tab} search={search} page={currentPage - 1} disabled={currentPage <= 1}>
              Previous
            </PageLink>
            <PageLink
              tab={tab}
              search={search}
              page={currentPage + 1}
              disabled={currentPage >= totalPages}
            >
              Next
            </PageLink>
          </div>
        </nav>
      ) : null}
    </>
  );
}

function Figure({
  label,
  value,
  emphasise,
}: {
  label: string;
  value: string;
  emphasise?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-ink-subtle uppercase tracking-wide">{label}</dt>
      <dd
        className={
          emphasise
            ? 'mt-0.5 text-sm font-semibold tabular-nums text-[oklch(45%_0.13_70)]'
            : 'mt-0.5 text-sm font-medium tabular-nums text-ink'
        }
      >
        {value}
      </dd>
    </div>
  );
}

function PageLink({
  tab,
  search,
  page,
  disabled,
  children,
}: {
  tab: AccountsTab;
  search?: string;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-lg border border-line px-3 py-2 text-sm text-ink-subtle">
        {children}
      </span>
    );
  }

  const query = new URLSearchParams({ tab, page: String(page) });
  if (search) query.set('q', search);

  return (
    <Link
      href={`/accounts?${query.toString()}`}
      className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
    >
      {children}
    </Link>
  );
}
