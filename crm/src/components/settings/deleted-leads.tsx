'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { LuChevronRight, LuSearch, LuTrash2, LuTriangleAlert } from 'react-icons/lu';
import { Badge, Button, Input } from '@/components/ui';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import {
  confirmLeadPurgeAction,
  requestLeadPurgeOtpAction,
  searchPurgeLeadsAction,
} from '@/server/actions/lead-purge';

export interface PurgeLeadRow {
  id: string;
  customer_name: string;
  mobile_country_code: string;
  mobile_normalized: string;
  email: string | null;
  status: string;
  source: string;
}

/** Mirrors `MAX_LEADS_PER_PURGE` on the server, which is the one that decides. */
const MAX_SELECTION = 100;

/**
 * Permanent lead deletion (AGENTS.md §15, §17).
 *
 * Two things make this safe to expose at all: the code goes to the business
 * owner rather than to whoever pressed the button, so no single Admin can
 * complete it alone; and the selection is explicit — there is no "delete
 * everything matching this search".
 *
 * The list is searched and paged on the server. It used to render a fixed
 * hundred rows, which meant that on a real database the lead someone actually
 * needed to remove was usually not on screen and could not be reached.
 */
export function DeletedLeadsSetting({
  leads,
  total,
  pageSize,
}: {
  leads: PurgeLeadRow[];
  total: number;
  pageSize: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Map<string, PurgeLeadRow>>(new Map());
  const [challenge, setChallenge] = React.useState<{ id: string; email: string } | null>(null);
  const [otp, setOtp] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  const [query, setQuery] = React.useState('');
  const [rows, setRows] = React.useState(leads);
  const [page, setPage] = React.useState(1);
  const [rowTotal, setRowTotal] = React.useState(total);
  const [loading, setLoading] = React.useState(false);

  const totalPages = Math.max(1, Math.ceil(rowTotal / pageSize));
  const pageSelected = rows.length > 0 && rows.every((lead) => selected.has(lead.id));
  const overLimit = selected.size > MAX_SELECTION;

  /**
   * Selection is a Map of the whole row, not a Set of ids.
   *
   * A lead chosen on page 1 stays chosen after a search that no longer returns
   * it — and the confirmation panel still has to be able to name it. Keeping
   * only ids would leave the user staring at "3 selected" with no way to see
   * which three.
   */
  function toggle(lead: PurgeLeadRow) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(lead.id)) next.delete(lead.id);
      else next.set(lead.id, lead);
      return next;
    });
    setChallenge(null);
    setOtp('');
  }

  async function load(nextQuery: string, nextPage: number) {
    setLoading(true);
    try {
      const result = await searchPurgeLeadsAction(nextQuery, nextPage);
      if (result.ok) {
        setRows(result.data.items);
        setRowTotal(result.data.total);
        setPage(result.data.page);
      } else toast.error(result.message);
    } finally {
      setLoading(false);
    }
  }

  function requestOtp() {
    startTransition(async () => {
      const result = await requestLeadPurgeOtpAction([...selected.keys()]);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setChallenge({ id: result.data.challengeId, email: result.data.sentTo });
      toast.success(`Verification code sent to ${result.data.sentTo}.`);
    });
  }

  function purge() {
    if (!challenge) return;
    startTransition(async () => {
      const result = await confirmLeadPurgeAction(challenge.id, otp);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        `${result.data.deletedCount} lead${result.data.deletedCount === 1 ? '' : 's'} permanently deleted.`,
      );
      setSelected(new Map());
      setChallenge(null);
      setOtp('');
      setOpen(false);
      void load(query, 1);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-muted">
          <LuTrash2 className="size-5 shrink-0 text-danger" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">Deleted Leads</span>
            <span className="block text-xs text-ink-muted">
              Search and permanently purge lead records
            </span>
          </span>
          <LuChevronRight className="size-4 text-ink-subtle" />
        </button>
      </DialogTrigger>

      <DialogContent
        title="Permanently delete leads"
        description="Admin only · OTP verification required"
        className="sm:max-w-3xl"
      >
        <div className="space-y-4">
          <div className="flex gap-2.5 rounded-lg border border-danger/25 bg-danger-bg p-3 text-sm text-ink">
            <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
            <p>
              This permanently removes selected leads, calls, follow-ups, visits, designs, execution
              history, and stored files. It cannot be undone.
            </p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void load(query, 1);
            }}
            className="relative"
          >
            <LuSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, number, code or email — press Enter"
              className="pl-9"
              aria-label="Search leads to delete"
            />
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5 text-sm">
            <label className="flex cursor-pointer items-center gap-2.5 font-medium text-ink">
              <input
                type="checkbox"
                className="size-4 shrink-0"
                checked={pageSelected}
                disabled={rows.length === 0}
                onChange={() => {
                  setSelected((current) => {
                    const next = new Map(current);
                    if (pageSelected) rows.forEach((lead) => next.delete(lead.id));
                    else rows.forEach((lead) => next.set(lead.id, lead));
                    return next;
                  });
                  setChallenge(null);
                }}
              />
              {/* "This page", not "all": with paging, an unqualified "select
                  all" would be read as every lead in the database. */}
              Select all on this page
            </label>

            <span className="text-xs text-ink-muted">
              {rowTotal} lead{rowTotal === 1 ? '' : 's'} · page {page} of {totalPages}
            </span>
          </div>

          {selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-muted p-2.5 text-sm">
              <span className="font-medium text-ink">
                {selected.size} selected
                {overLimit ? (
                  <span className="text-danger"> · {MAX_SELECTION} maximum per deletion</span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelected(new Map());
                  setChallenge(null);
                }}
                className="ml-auto text-xs font-medium text-brand-700 hover:underline"
              >
                Clear selection
              </button>
            </div>
          ) : null}

          <div className="max-h-[45dvh] divide-y divide-line overflow-y-auto rounded-lg border border-line sm:max-h-[42dvh]">
            {loading ? (
              <p className="p-4 text-sm text-ink-muted">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="p-4 text-sm text-ink-muted">
                {query ? 'No leads match that search.' : 'No leads available.'}
              </p>
            ) : (
              rows.map((lead) => {
                const checked = selected.has(lead.id);
                return (
                  /* Flex with one nested column, not a four-column grid. The
                     grid only had two columns below `sm`, so the email and the
                     badges wrapped underneath the checkbox instead of staying
                     with the name they describe. */
                  <label
                    key={lead.id}
                    className={`flex cursor-pointer items-start gap-3 p-3 transition-colors ${
                      checked ? 'bg-danger-bg/60' : 'hover:bg-surface-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0"
                      checked={checked}
                      onChange={() => toggle(lead)}
                    />

                    <span className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                      <span className="block min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">
                          {lead.customer_name}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {maskPhone(lead.mobile_country_code, lead.mobile_normalized)}
                        </span>
                      </span>

                      <span className="mt-0.5 block truncate text-xs text-ink-muted sm:mt-0">
                        {lead.email || 'No email'}
                      </span>

                      <span className="mt-1.5 flex flex-wrap gap-1 sm:mt-0 sm:justify-end">
                        <Badge tone="neutral">{humanize(lead.status)}</Badge>
                        <Badge tone="brand">{humanize(lead.source)}</Badge>
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => void load(query, page - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-ink-muted">
                Page {page} of {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages || loading}
                onClick={() => void load(query, page + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}

          {challenge ? (
            <div className="space-y-3 rounded-lg border border-line bg-surface-muted p-3">
              <p className="text-sm text-ink-muted">
                Enter the six-digit code sent to <strong className="text-ink">{challenge.email}</strong>.
              </p>
              <Input
                className="text-center text-lg tracking-[0.4em]"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
              />
              <button
                type="button"
                disabled={pending || otp.length !== 6}
                onClick={purge}
                className="tap w-full rounded-lg bg-danger px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending
                  ? 'Deleting…'
                  : `Permanently delete ${selected.size} lead${selected.size === 1 ? '' : 's'}`}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                disabled={pending || selected.size === 0 || overLimit}
                onClick={requestOtp}
                className="tap w-full rounded-lg bg-danger px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? 'Sending code…' : `Verify deletion of ${selected.size} selected`}
              </button>
              <p className="text-center text-xs text-ink-muted">
                The verification code is emailed to the business owner, not to you.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function maskPhone(country: string, mobile: string) {
  return `${country} ${'•'.repeat(Math.max(4, mobile.length - 3))} ${mobile.slice(-3)}`;
}

function humanize(value: string) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}
