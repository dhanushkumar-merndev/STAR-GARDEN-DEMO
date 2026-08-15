'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { LuChevronRight, LuTrash2, LuTriangleAlert } from 'react-icons/lu';
import { Badge, Input } from '@/components/ui';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { confirmLeadPurgeAction, requestLeadPurgeOtpAction } from '@/server/actions/lead-purge';

export interface PurgeLeadRow {
  id: string;
  customer_name: string;
  mobile_country_code: string;
  mobile_normalized: string;
  email: string | null;
  status: string;
  source: string;
}

export function DeletedLeadsSetting({ leads }: { leads: PurgeLeadRow[] }) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [challenge, setChallenge] = React.useState<{ id: string; email: string } | null>(null);
  const [otp, setOtp] = React.useState('');
  const [pending, startTransition] = React.useTransition();
  const allSelected = leads.length > 0 && selected.size === leads.length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setChallenge(null);
    setOtp('');
  }

  function requestOtp() {
    startTransition(async () => {
      const result = await requestLeadPurgeOtpAction([...selected]);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setChallenge({ id: result.data.challengeId, email: result.data.maskedEmail });
      toast.success(`Verification code sent to ${result.data.maskedEmail}.`);
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
      toast.success(`${result.data.deletedCount} lead${result.data.deletedCount === 1 ? '' : 's'} permanently deleted.`);
      setSelected(new Set());
      setChallenge(null);
      setOtp('');
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-muted">
          <LuTrash2 className="size-5 shrink-0 text-danger-600" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">Deleted Leads</span>
            <span className="block text-xs text-ink-muted">Select and permanently purge lead records</span>
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
          <div className="flex gap-2 rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800">
            <LuTriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>This permanently removes selected leads, calls, follow-ups, visits, designs, execution history, and stored files. It cannot be undone.</p>
          </div>

          <label className="flex items-center gap-2 border-b border-line pb-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => {
                setSelected(allSelected ? new Set() : new Set(leads.map((lead) => lead.id)));
                setChallenge(null);
              }}
            />
            Select all ({leads.length})
          </label>

          <div className="max-h-[42dvh] divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {leads.length === 0 ? <p className="p-4 text-sm text-ink-muted">No leads available.</p> : leads.map((lead) => (
              <label key={lead.id} className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 p-3 hover:bg-surface-muted sm:grid-cols-[auto_minmax(10rem,1fr)_minmax(10rem,1fr)_auto] sm:items-center">
                <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggle(lead.id)} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{lead.customer_name}</span>
                  <span className="block text-xs text-ink-muted">{maskPhone(lead.mobile_country_code, lead.mobile_normalized)}</span>
                </span>
                <span className="truncate text-xs text-ink-muted sm:text-sm">{lead.email || 'No email'}</span>
                <span className="flex flex-wrap gap-1">
                  <Badge tone="neutral">{humanize(lead.status)}</Badge>
                  <Badge tone="brand">{humanize(lead.source)}</Badge>
                </span>
              </label>
            ))}
          </div>

          {challenge ? (
            <div className="space-y-3 rounded-lg border border-line p-3">
              <p className="text-sm text-ink-muted">Enter the six-digit code sent to <strong className="text-ink">{challenge.email}</strong>.</p>
              <Input value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" />
              <button type="button" disabled={pending || otp.length !== 6} onClick={purge} className="tap w-full rounded-lg bg-danger-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
                {pending ? 'Deleting…' : `Permanently delete ${selected.size} lead${selected.size === 1 ? '' : 's'}`}
              </button>
            </div>
          ) : (
            <button type="button" disabled={pending || selected.size === 0} onClick={requestOtp} className="tap w-full rounded-lg bg-danger-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
              {pending ? 'Sending code…' : `Verify deletion of ${selected.size} selected`}
            </button>
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
