'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LuLoaderCircle, LuSearch } from 'react-icons/lu';
import { Button, Input, Select } from '@/components/ui';
import { buildLeadsHref, defaultStatusFilter } from '@/lib/leads/status-filters';
import { searchOwnersAction } from '@/server/actions/people';
import type { LeadListQuery } from '@/lib/leads/status-filters';

type Person = { id: string; full_name: string };

/** Matches the people picker's own debounce, so the two feel like one control. */
const SEARCH_DEBOUNCE_MS = 500;

/** Below three characters the lead search's trigram indexes cannot be used. */
const SEARCH_MIN_LENGTH = 3;

/**
 * Lead filters.
 *
 * Everything except the search box applies the moment it is touched. An Apply
 * button on a filter bar is a step that adds nothing: there is no draft state
 * worth protecting, no validation to run, and it reliably leaves people looking
 * at a list that does not match the controls above it.
 *
 * Search is the exception and keeps its Enter-to-apply, because navigating on
 * every keystroke would remount this form — and take the cursor with it.
 *
 * The URL stays the single source of truth (§16: returning from a lead restores
 * the exact view), so each control navigates rather than holding a selection
 * the query does not know about.
 */
export function LeadFilterForm({
  isAdmin,
  bdms,
  initial,
}: {
  isAdmin: boolean;
  bdms: Person[];
  initial: LeadListQuery;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState(initial.q);
  const [searching, startSearch] = React.useTransition();

  /**
   * Builds the next URL from what is on screen, with one control overridden.
   *
   * Taking the rest from `initial` rather than from local state is deliberate:
   * `initial` is what the URL currently says, and every control but the search
   * box writes straight to the URL, so the two cannot drift.
   */
  function push(overrides: Partial<LeadListQuery>) {
    router.push(buildLeadsHref({ ...initial, q }, isAdmin, overrides));
  }

  /**
   * Search applies as you type, once there is a word to search for.
   *
   * Three things keep that from being expensive. The `SEARCH_DEBOUNCE_MS`
   * wait means a name typed at speed costs one query rather than one per
   * letter; `SEARCH_MIN_LENGTH` holds it back until the lead search's trigram
   * indexes can actually serve the `ilike` (below three characters they fall
   * back to a scan, and match most of the table anyway); and `replace` keeps
   * the Back button pointing at the view before this search rather than at
   * every intermediate word.
   *
   * Enter still applies immediately — including the one and two letter
   * queries the debounce declines to run on its own.
   */
  const pending = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
  }, []);

  function onSearchChange(next: string) {
    setQ(next);
    if (pending.current) clearTimeout(pending.current);

    // Under the minimum there is no search — including on the way back down,
    // so deleting "abcd" to "ab" restores the unfiltered list rather than
    // leaving the old four-letter search applied under a two-letter box.
    const target = next.trim().length >= SEARCH_MIN_LENGTH ? next : '';
    if (target.trim() === (initial.q ?? '').trim()) return;

    pending.current = setTimeout(() => {
      startSearch(() => {
        router.replace(buildLeadsHref({ ...initial, q: target }, isAdmin, {}));
      });
    }, SEARCH_DEBOUNCE_MS);
  }

  function clear() {
    setQ('');
    // Clearing returns the list to how it opens, which is not the same as
    // selecting every status.
    router.push(`/leads?status=${defaultStatusFilter(isAdmin)}`);
  }

  return (
    <div className="space-y-3 lg:p-3">
      {/* Controls first, stages under them. The strip is the control people
          touch most, so it sits closest to the list it filters rather than
          being separated from it by three dropdowns. Clear ends the row: it
          undoes everything on that line, so it belongs at the end of it. */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (pending.current) clearTimeout(pending.current);
            push({});
          }}
          className="relative sm:col-span-2 lg:col-span-1"
        >
          {searching ? (
            <LuLoaderCircle
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 animate-spin text-brand-600"
              aria-hidden="true"
            />
          ) : (
            <LuSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
          )}
          <Input
            value={q}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Name, number or code"
            className="pl-9"
            aria-label="Search leads"
          />
        </form>

        <Select
          value={initial.source}
          onChange={(event) => push({ source: event.target.value })}
          aria-label="Filter by source"
        >
          <option value="ALL">All sources</option>
          <option value="META_FACEBOOK">Facebook</option>
          <option value="META_INSTAGRAM">Instagram</option>
          <option value="WEBSITE">Website</option>
          <option value="MANUAL">Manual</option>
          <option value="OTHER">Other</option>
        </Select>

        {isAdmin ? (
          <Select
            value={initial.assignedTo}
            onChange={(event) => push({ assignedTo: event.target.value })}
            aria-label="Filter by team member"
            searchable
            onSearch={searchOwnersAction}
          >
            {/* "Members", not "owners": the team calls each other members, and
                the list below is literally the staff list. "Unassigned" stays
                as it is — here it means nobody holds the lead, which is a
                different statement from the "New leads" stage above. */}
            <option value="ALL">All members</option>
            <option value="UNASSIGNED">Unassigned</option>
            {bdms.map((bdm) => (
              <option key={bdm.id} value={bdm.id}>
                {bdm.full_name}
              </option>
            ))}
          </Select>
        ) : (
          <Select
            value={initial.scope}
            onChange={(event) => push({ scope: event.target.value })}
            aria-label="Filter by scope"
          >
            <option value="MINE">My leads</option>
            <option value="NO_NEXT_ACTION">No next action</option>
          </Select>
        )}

        <Button
          type="button"
          variant="ghost"
          onClick={clear}
          className="justify-self-start sm:col-span-2 lg:col-span-1 lg:justify-self-end"
        >
          Clear
        </Button>
      </div>

    </div>
  );
}
