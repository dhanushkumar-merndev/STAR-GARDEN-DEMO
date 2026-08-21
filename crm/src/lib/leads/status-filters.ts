import type { LeadStatus } from '@/types/database';

/**
 * The lead-list stage filter.
 *
 * Neutral module on purpose: the filter strip is a Client Component, the lead
 * list page is a Server Component and `listLeads` is `server-only`. All three
 * need the same vocabulary, so it lives somewhere none of them owns.
 */

/**
 * What the stage tabs can be set to.
 *
 * Mostly `LeadStatus`, plus two stages that are not lead statuses at all:
 * design and execution live in their own tables, because a lead can be
 * QUALIFIED while a drawing is in progress and the two facts are independent.
 * They are exposed here anyway — "show me everything in design" is a question
 * about leads, and answering it should not mean visiting another screen.
 */
export type LeadStatusFilter = LeadStatus | 'ALL' | 'IN_DESIGN' | 'IN_EXECUTION';

/** The stage strip, in the order work actually moves through it. */
export const STATUS_FILTERS: { value: LeadStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  // Labelled for the desk, not for the schema: the status is still UNASSIGNED
  // in the database (and still badges as "Unassigned" on the lead itself) —
  // this list just calls it what the team calls it.
  { value: 'UNASSIGNED', label: 'New leads' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'SITE_VISIT_SCHEDULED', label: 'Visit scheduled' },
  { value: 'SITE_VISIT_COMPLETED', label: 'Visit done' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'IN_DESIGN', label: 'Landscape design' },
  { value: 'IN_EXECUTION', label: 'Execution' },
  { value: 'LOST', label: 'Lost' },
  { value: 'CLOSED', label: 'Closed' },
];

const STATUS_FILTER_VALUES = new Set(STATUS_FILTERS.map((option) => option.value));

/**
 * Where the lead list starts with no query string.
 *
 * Admins open onto the work that needs them — leads nobody owns yet. A BDM
 * cannot: their list is already scoped to leads assigned to *them*, and an
 * assigned lead is by definition never UNASSIGNED, so the same default would
 * hand them a permanently empty page.
 */
export function defaultStatusFilter(isAdmin: boolean): LeadStatusFilter {
  return isAdmin ? 'UNASSIGNED' : 'ALL';
}

/** Rejects a hand-edited `?status=` rather than passing it to the query. */
export function parseStatusFilter(value: string | undefined, isAdmin: boolean): LeadStatusFilter {
  return value && STATUS_FILTER_VALUES.has(value as LeadStatusFilter)
    ? (value as LeadStatusFilter)
    : defaultStatusFilter(isAdmin);
}

/** The filter state a lead-list URL carries. */
export interface LeadListQuery {
  q: string;
  status: LeadStatusFilter;
  source: string;
  assignedTo: string;
  scope: string;
}

/**
 * Builds a `/leads` URL from the current filters plus an override.
 *
 * Shared by the stage tabs and the filter form so the two cannot spell the
 * query differently — the tabs must preserve a search term and a source, and
 * the form must preserve the stage.
 */
export function buildLeadsHref(
  current: LeadListQuery,
  isAdmin: boolean,
  overrides: Partial<LeadListQuery> = {},
): string {
  const next = { ...current, ...overrides };
  const query = new URLSearchParams();

  if (next.q.trim()) query.set('q', next.q.trim());
  // Always carried, unlike the other filters: an absent status means "use the
  // default", which is not ALL for an Admin. Omitting it when ALL is chosen
  // would quietly bounce them back to New leads.
  query.set('status', next.status);
  if (next.source !== 'ALL') query.set('source', next.source);
  if (isAdmin) {
    if (next.assignedTo !== 'ALL') query.set('assignedTo', next.assignedTo);
  } else if (next.scope !== 'MINE') {
    query.set('scope', next.scope);
  }

  return `/leads?${query.toString()}`;
}
