import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Search, Users } from 'lucide-react';
import { requirePageRole } from '@/lib/auth/session';
import { listAssignableBdms, listLeads, type LeadListFilters } from '@/server/services/leads';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select } from '@/components/ui';
import { DueBadge, LeadStatusBadge, SourceBadge } from '@/components/status';
import { formatDue, formatMobileDisplay } from '@/components/leads/helpers';
import type { LeadStatus } from '@/types/database';

export const metadata: Metadata = { title: 'Leads' };

/**
 * Lead list (AGENTS.md §11.3).
 *
 * Filters live in the URL rather than component state, which is what makes §16's
 * "preserve filters when returning from a detail page" work for free: the back
 * button restores the exact view, and a filtered list can be shared or
 * bookmarked.
 */

const STATUS_FILTERS: { value: LeadStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'UNASSIGNED', label: 'Unassigned' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'SITE_VISIT_SCHEDULED', label: 'Visit scheduled' },
  { value: 'SITE_VISIT_COMPLETED', label: 'Visit completed' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'LOST', label: 'Lost' },
  { value: 'CLOSED', label: 'Closed' },
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageRole('ADMIN', 'BDM');
  const params = await searchParams;

  const read = (key: string): string | undefined => {
    const value = params[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };

  const filters: LeadListFilters = {
    search: read('q'),
    status: (read('status') as LeadStatus | 'ALL') ?? 'ALL',
    source: read('source') ?? 'ALL',
    assignedTo: read('assignedTo') ?? 'ALL',
    scope: (read('scope') as LeadListFilters['scope']) ?? (user.isAdmin ? 'ALL' : 'MINE'),
    page: Number(read('page') ?? 1),
  };

  const [{ items, total, page, pageSize }, bdms] = await Promise.all([
    listLeads(user, filters),
    user.isAdmin ? listAssignableBdms() : Promise.resolve([]),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const scopeLabel = SCOPE_LABELS[filters.scope ?? 'ALL'];

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={`${total} ${total === 1 ? 'lead' : 'leads'}${scopeLabel ? ` · ${scopeLabel}` : ''}`}
        action={
          <Link href="/leads/new">
            <Button className="gap-1.5">
              <Plus className="size-4" />
              New lead
            </Button>
          </Link>
        }
      />

      <Card className="mb-4">
        <form className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
            <Input
              name="q"
              defaultValue={filters.search ?? ''}
              placeholder="Name, number or code"
              className="pl-9"
              aria-label="Search leads"
            />
          </div>

          <Select name="status" defaultValue={filters.status} aria-label="Filter by status">
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select name="source" defaultValue={filters.source} aria-label="Filter by source">
            <option value="ALL">All sources</option>
            <option value="META_FACEBOOK">Facebook</option>
            <option value="META_INSTAGRAM">Instagram</option>
            <option value="WEBSITE">Website</option>
            <option value="MANUAL">Manual</option>
            <option value="OTHER">Other</option>
          </Select>

          {user.isAdmin ? (
            <Select name="assignedTo" defaultValue={filters.assignedTo} aria-label="Filter by owner">
              <option value="ALL">All owners</option>
              <option value="UNASSIGNED">Unassigned</option>
              {bdms.map((bdm) => (
                <option key={bdm.id} value={bdm.id}>
                  {bdm.full_name}
                </option>
              ))}
            </Select>
          ) : (
            <Select name="scope" defaultValue={filters.scope} aria-label="Filter by scope">
              <option value="MINE">My leads</option>
              <option value="NO_NEXT_ACTION">No next action</option>
            </Select>
          )}

          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit" size="sm">
              Apply
            </Button>
            <Link href="/leads">
              <Button type="button" size="sm" variant="ghost">
                Clear
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="size-8" />}
            title="No leads match this view"
            description={
              filters.search
                ? 'Try a different search term, or clear the filters.'
                : 'New enquiries from the website and Meta appear here automatically.'
            }
            action={
              <Link href="/leads/new">
                <Button size="sm">Create a lead manually</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {items.map((lead) => {
              const due = formatDue(lead.next_action_at);
              return (
                <li key={lead.id}>
                  <Link
                    href={`/leads/${lead.id}`}
                    className="block px-4 py-3 transition-colors hover:bg-surface-muted"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {lead.customer_name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-ink-muted">
                          {lead.lead_code} ·{' '}
                          {formatMobileDisplay(lead.mobile_country_code, lead.mobile_normalized)}
                          {lead.location_text ? ` · ${lead.location_text}` : ''}
                        </p>
                      </div>
                      <LeadStatusBadge value={lead.status} />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <SourceBadge value={lead.source} />
                      <Badge tone="neutral">
                        {lead.assigned_bdm?.full_name ?? 'Unassigned'}
                      </Badge>
                      {lead.next_action_at ? (
                        <DueBadge label={due.label} tone={due.tone} />
                      ) : (
                        <Badge tone="warn">No next action</Badge>
                      )}
                      {lead.design_required ? <Badge tone="info">Design required</Badge> : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {totalPages > 1 ? (
        <nav className="mt-4 flex items-center justify-between" aria-label="Pagination">
          <PageLink params={params} page={page - 1} disabled={page <= 1}>
            Previous
          </PageLink>
          <span className="text-sm text-ink-muted">
            Page {page} of {totalPages}
          </span>
          <PageLink params={params} page={page + 1} disabled={page >= totalPages}>
            Next
          </PageLink>
        </nav>
      ) : null}
    </>
  );
}

const SCOPE_LABELS: Record<string, string> = {
  MINE: 'assigned to you',
  UNASSIGNED: 'unassigned',
  NO_NEXT_ACTION: 'with no next action',
  ALL: '',
};

function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: Record<string, string | string[] | undefined>;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button size="sm" variant="ghost" disabled>
        {children}
      </Button>
    );
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value && key !== 'page') query.set(key, value);
  }
  query.set('page', String(page));

  return (
    <Link href={`/leads?${query.toString()}`}>
      <Button size="sm" variant="outline">
        {children}
      </Button>
    </Link>
  );
}
