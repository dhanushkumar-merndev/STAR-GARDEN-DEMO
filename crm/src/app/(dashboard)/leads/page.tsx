import type { Metadata } from 'next';
import Link from 'next/link';
import { LuPlus, LuSlidersHorizontal, LuUsers } from 'react-icons/lu';
import { requirePageRole } from '@/lib/auth/session';
import { listAssignableBdms, listLeads, type LeadListFilters } from '@/server/services/leads';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { DueBadge, LeadStatusBadge, SourceBadge } from '@/components/status';
import { maskMobile } from '@/lib/utils/phone';
import type { LeadStatus } from '@/types/database';
import { LeadFilterForm } from '@/components/leads/lead-filter-form';
import { defaultStatusFilter } from '@/components/leads/helpers';
import { MobileSheet } from '@/components/ui/mobile-sheet';

export const metadata: Metadata = { title: 'Leads' };

/**
 * Lead list (AGENTS.md §11.3).
 *
 * Filters live in the URL rather than component state, which is what makes §16's
 * "preserve filters when returning from a detail page" work for free: the back
 * button restores the exact view, and a filtered list can be shared or
 * bookmarked.
 */

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
    status: (read('status') as LeadStatus | 'ALL') ?? defaultStatusFilter(user.isAdmin),
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
          <div className="flex items-center gap-2">
            <Link href="/leads/new">
              <Button className="gap-1.5"><LuPlus className="size-4" />New lead</Button>
            </Link>
            <MobileSheet label="Filter" title="Filter leads" description="Search and narrow this lead view." icon={<LuSlidersHorizontal className="size-4" />}>
              <LeadFilterForm isAdmin={user.isAdmin} bdms={bdms} initial={{
                q: filters.search ?? '', status: filters.status ?? 'ALL', source: filters.source ?? 'ALL',
                assignedTo: filters.assignedTo ?? 'ALL', scope: filters.scope ?? (user.isAdmin ? 'ALL' : 'MINE'),
              }} />
            </MobileSheet>
          </div>
        }
      />

      <Card className="mb-4 hidden lg:block">
        <LeadFilterForm
          key={`${filters.search ?? ''}|${filters.status ?? 'ALL'}|${filters.source ?? 'ALL'}|${filters.assignedTo ?? 'ALL'}|${filters.scope ?? ''}`}
          isAdmin={user.isAdmin}
          bdms={bdms}
          initial={{
            q: filters.search ?? '',
            status: filters.status ?? 'ALL',
            source: filters.source ?? 'ALL',
            assignedTo: filters.assignedTo ?? 'ALL',
            scope: filters.scope ?? (user.isAdmin ? 'ALL' : 'MINE'),
          }}
        />
      </Card>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LuUsers className="size-8" />}
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
                          {maskMobile(lead.mobile_country_code, lead.mobile_normalized)}
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
                        <DueBadge value={lead.next_action_at} />
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
