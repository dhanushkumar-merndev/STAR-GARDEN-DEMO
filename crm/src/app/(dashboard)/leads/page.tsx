import type { Metadata } from 'next';
import Link from 'next/link';
import { LuPlus, LuSlidersHorizontal, LuUsers } from 'react-icons/lu';
import { requirePageRole } from '@/lib/auth/session';
import { countLeadsByStage, listAssignableBdms, listLeads, type LeadListFilters } from '@/server/services/leads';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { DueBadge, LeadStatusBadge, SourceBadge } from '@/components/status';
import { maskMobile } from '@/lib/utils/phone';
import { LeadFilterForm } from '@/components/leads/lead-filter-form';
import { LeadStageTabs } from '@/components/leads/lead-stage-tabs';
import { LeadStarButton } from '@/components/leads/lead-star-button';
import { parseStatusFilter, type LeadListQuery } from '@/lib/leads/status-filters';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { listFavoritedLeadIds } from '@/server/services/lead-favorites';

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
  const user = await requirePageRole('SUPER_ADMIN', 'ADMIN', 'BDM');
  const params = await searchParams;

  const read = (key: string): string | undefined => {
    const value = params[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };

  const filters: LeadListFilters = {
    search: read('q'),
    status: parseStatusFilter(read('status'), user.isAdmin),
    source: read('source') ?? 'ALL',
    assignedTo: read('assignedTo') ?? 'ALL',
    scope: (read('scope') as LeadListFilters['scope']) ?? (user.isAdmin ? 'ALL' : 'MINE'),
    page: Number(read('page') ?? 1),
  };

  const [{ items, total, page, pageSize }, bdms, stageCounts] = await Promise.all([
    listLeads(user, filters),
    user.isAdmin ? listAssignableBdms({ include: [filters.assignedTo] }) : Promise.resolve([]),
    countLeadsByStage(user, filters),
  ]);

  // Scoped to this one page of leads, not every favourite the user has ever
  // made — the same "query for what's on screen, not for everything" shape
  // as the rest of this page's queries.
  const favoritedIds = await listFavoritedLeadIds(
    user,
    items.map((lead) => lead.id),
  );

  const current: LeadListQuery = {
    q: filters.search ?? '',
    status: filters.status ?? 'ALL',
    source: filters.source ?? 'ALL',
    assignedTo: filters.assignedTo ?? 'ALL',
    scope: filters.scope ?? (user.isAdmin ? 'ALL' : 'MINE'),
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const scopeLabel = SCOPE_LABELS[filters.scope ?? 'ALL'];

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={`${total} ${total === 1 ? 'lead' : 'leads'}${scopeLabel ? ` · ${scopeLabel}` : ''}`}
        fullWidthActionOnMobile
        action={
          // On a phone New lead takes the whole row and the filter trigger is
          // a fixed 44px square beside it — the same icon-only control the
          // dashboard uses for its date range, and the label would only eat
          // width the primary action needs. From `lg` up the trigger is gone
          // entirely (the filter form is inline on the page instead), so New
          // lead drops back to its normal compact size.
          <div className="flex w-full items-center gap-2 lg:w-auto">
            <Link href="/leads/new" className="min-w-0 flex-1 lg:flex-none">
              <Button className="w-full gap-1.5 lg:w-auto"><LuPlus className="size-4" />New lead</Button>
            </Link>
            <div className="lg:hidden">
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    aria-label="Filter leads"
                    className="tap flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-brand-700 shadow-sm transition hover:bg-brand-50"
                  >
                    <LuSlidersHorizontal className="size-5" />
                  </button>
                </DialogTrigger>
                <DialogContent title="Filter leads" description="Search and narrow this lead view.">
                  <LeadFilterForm isAdmin={user.isAdmin} bdms={bdms} initial={current} />
                </DialogContent>
              </Dialog>
            </div>
          </div>
        }
      />

      <Card className="mb-4 hidden lg:block">
        <LeadFilterForm
          /* Deliberately no `filters.search` in the key. The search box applies
             as you type now, so keying on it would remount the form — and take
             the cursor with it — on the very navigation the typing caused. The
             other filters still reset it, which is what the key is for. */
          key={`${filters.status ?? 'ALL'}|${filters.source ?? 'ALL'}|${filters.assignedTo ?? 'ALL'}|${filters.scope ?? ''}`}
          isAdmin={user.isAdmin}
          bdms={bdms}
          initial={current}
        />
      </Card>

      <LeadStageTabs isAdmin={user.isAdmin} current={current} stageCounts={stageCounts} />

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
                <li key={lead.id} className="flex items-start">
                  <Link
                    href={`/leads/${lead.id}`}
                    className="block min-w-0 flex-1 px-4 py-3 transition-colors hover:bg-surface-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {lead.customer_name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-muted">
                        {lead.lead_code} ·{' '}
                        {maskMobile(lead.mobile_country_code, lead.mobile_normalized)}
                        {lead.location_text ? ` · ${lead.location_text}` : ''}
                      </p>
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

                  {/* The status badge sits in this column rather than inside
                      the link, so it is a flex sibling of the star and pin and
                      shares their centre line by construction. Matching the
                      two columns' paddings instead only ever gets close: the
                      badge is a 22px chip and the icon buttons are 44px touch
                      targets, so the badge rode above them. */}
                  <div className="flex shrink-0 items-center gap-1.5 py-3 pr-2">
                    <LeadStatusBadge value={lead.status} />
                    <LeadStarButton
                      leadId={lead.id}
                      isGloballyStarred={lead.is_starred}
                      isFavorited={favoritedIds.has(lead.id)}
                      canSetGlobal={user.isAdmin}
                    />
                  </div>
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
