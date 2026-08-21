import { FilterTabs } from '@/components/ui/filter-tabs';
import {
  STATUS_FILTERS,
  buildLeadsHref,
  type LeadListQuery,
} from '@/lib/leads/status-filters';

/**
 * The stage strip for the lead list.
 *
 * Split out of `LeadFilterForm` so it can live on the page itself rather than
 * inside the phone's filter sheet. Stage is the filter people change constantly
 * — burying it two taps deep, behind a button labelled "Filter", made the most
 * common action the least reachable one on the smallest screen.
 *
 * Plain links, and therefore no `'use client'`: a tab only needs to know the
 * URL it leads to, and the other filters travel with it via `buildLeadsHref`.
 */
export function LeadStageTabs({
  isAdmin,
  current,
  stageCounts,
}: {
  isAdmin: boolean;
  current: LeadListQuery;
  stageCounts?: Record<string, number>;
}) {
  return (
    <FilterTabs
      options={STATUS_FILTERS.map((option) => ({
        ...option,
        count: stageCounts?.[option.value] ?? 0,
      }))}
      value={current.status}
      label="Filter leads by stage"
      hrefFor={(status) => buildLeadsHref(current, isAdmin, { status })}
      className="mb-4"
    />
  );
}
