'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LuSearch } from 'react-icons/lu';
import { Button, Input, Select } from '@/components/ui';
import type { LeadStatus } from '@/types/database';

type Person = { id: string; full_name: string };

const STATUS_FILTERS: { value: LeadStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All statuses' },
  // Labelled for the desk, not for the schema: the status is still UNASSIGNED
  // in the database (and still badges as "Unassigned" on the lead itself) —
  // this list just calls it what the team calls it.
  { value: 'UNASSIGNED', label: 'New leads' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'LOST', label: 'Lost' },
  { value: 'CLOSED', label: 'Closed' },
];

/**
 * Where the list starts with no query string.
 *
 * Admins open onto the work that needs them — leads nobody owns yet. A BDM
 * cannot: their list is already scoped to leads assigned to *them*, and an
 * assigned lead is by definition never UNASSIGNED, so the same default would
 * hand them a permanently empty page.
 */
export function defaultStatusFilter(isAdmin: boolean): LeadStatus | 'ALL' {
  return isAdmin ? 'UNASSIGNED' : 'ALL';
}

/**
 * Radix Select is intentionally not left to native form serialization here.
 * Applying filters navigates from its own controlled values, so the visual
 * selection and the database query can never drift apart.
 */
export function LeadFilterForm({
  isAdmin,
  bdms,
  initial,
}: {
  isAdmin: boolean;
  bdms: Person[];
  initial: {
    q: string;
    status: LeadStatus | 'ALL';
    source: string;
    assignedTo: string;
    scope: string;
  };
}) {
  const router = useRouter();
  const [q, setQ] = React.useState(initial.q);
  const [status, setStatus] = React.useState(initial.status);
  const [source, setSource] = React.useState(initial.source);
  const [assignedTo, setAssignedTo] = React.useState(initial.assignedTo);
  const [scope, setScope] = React.useState(initial.scope);

  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new URLSearchParams();
    if (q.trim()) query.set('q', q.trim());
    // Always carried, unlike the other filters: an absent status means "use the
    // default", which is not ALL for an Admin. Omitting it when ALL is chosen
    // would quietly bounce them back to New leads.
    query.set('status', status);
    if (source !== 'ALL') query.set('source', source);
    if (isAdmin) {
      if (assignedTo !== 'ALL') query.set('assignedTo', assignedTo);
    } else if (scope !== 'MINE') {
      query.set('scope', scope);
    }

    const suffix = query.toString();
    router.push(suffix ? `/leads?${suffix}` : '/leads');
  }

  function clear() {
    setQ('');
    // Clearing returns the list to how it opens, which is not the same as
    // selecting every status.
    setStatus(defaultStatusFilter(isAdmin));
    setSource('ALL');
    setAssignedTo('ALL');
    setScope('MINE');
    router.push('/leads');
  }

  return (
    <form onSubmit={apply} className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="relative sm:col-span-2 lg:col-span-1">
        <LuSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Name, number or code"
          className="pl-9"
          aria-label="Search leads"
        />
      </div>

      <Select value={status} onChange={(event) => setStatus(event.target.value as LeadStatus | 'ALL')} aria-label="Filter by status">
        {STATUS_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>

      <Select value={source} onChange={(event) => setSource(event.target.value)} aria-label="Filter by source">
        <option value="ALL">All sources</option>
        <option value="META_FACEBOOK">Facebook</option>
        <option value="META_INSTAGRAM">Instagram</option>
        <option value="WEBSITE">Website</option>
        <option value="MANUAL">Manual</option>
        <option value="OTHER">Other</option>
      </Select>

      {isAdmin ? (
        <Select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} aria-label="Filter by owner">
          <option value="ALL">All owners</option>
          <option value="UNASSIGNED">Unassigned</option>
          {bdms.map((bdm) => <option key={bdm.id} value={bdm.id}>{bdm.full_name}</option>)}
        </Select>
      ) : (
        <Select value={scope} onChange={(event) => setScope(event.target.value)} aria-label="Filter by scope">
          <option value="MINE">My leads</option>
          <option value="NO_NEXT_ACTION">No next action</option>
        </Select>
      )}

      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="submit" size="sm">Apply</Button>
        <Button type="button" size="sm" variant="ghost" onClick={clear}>Clear</Button>
      </div>
    </form>
  );
}
