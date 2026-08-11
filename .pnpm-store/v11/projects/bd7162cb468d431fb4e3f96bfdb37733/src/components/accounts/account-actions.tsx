'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { LuDownload, LuIndianRupee } from 'react-icons/lu';
import { Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { recordAccountAction } from '@/server/actions/accounts';
import { formatMoney } from '@/lib/utils/format';
import type { LeadAccountRow, PaymentStatus } from '@/types/database';

/**
 * Recording what a finished job was worth.
 *
 * One dialog does both jobs — entering the figures, and closing the job — with
 * closure as a checkbox rather than a second button. An Admin working through
 * the register almost always does both at once, and splitting them produced a
 * queue of jobs with a value recorded that nobody had closed.
 */

export interface RecordAccountDialogProps {
  leadId: string;
  leadCode: string;
  customerName: string;
  account: LeadAccountRow | null;
  /** Rendered as the trigger. Defaults to a labelled button. */
  trigger?: React.ReactNode;
}

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Nothing received yet',
  PARTIAL: 'Part payment received',
  PAID: 'Paid in full',
  WRITTEN_OFF: 'Written off — will not be collected',
};

export function RecordAccountDialog({
  leadId,
  leadCode,
  customerName,
  account,
  trigger,
}: RecordAccountDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  // Held in state so the balance can be shown live as the Admin types — the
  // number they are about to commit is the one worth showing them.
  const [total, setTotal] = React.useState(String(account?.total_amount ?? ''));
  const [received, setReceived] = React.useState(String(account?.received_amount ?? ''));

  const isClosed = Boolean(account?.closed_at);
  const balance = toNumber(total) - toNumber(received);

  function onSubmit(formData: FormData) {
    setFieldErrors({});

    startTransition(async () => {
      const result = await recordAccountAction(null, formData);

      if (!result.ok) {
        setFieldErrors(result.fields ?? {});
        toast.error(result.message);
        return;
      }

      toast.success(
        result.data.closed ? `${leadCode} closed.` : `Value recorded for ${leadCode}.`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant={account ? 'outline' : 'primary'}>
            <LuIndianRupee className="size-4" />
            {account ? 'Edit value' : 'Record value'}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        title={isClosed ? `${leadCode} — closed` : `Record value for ${leadCode}`}
        description={customerName}
      >
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="lead_id" value={leadId} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Project value"
              htmlFor="total_amount"
              required
              error={fieldErrors.total_amount}
              hint="The agreed total, before any payment."
            >
              <Input
                id="total_amount"
                name="total_amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={total}
                onChange={(event) => setTotal(event.target.value)}
              />
            </Field>

            <Field
              label="Received so far"
              htmlFor="received_amount"
              error={fieldErrors.received_amount}
              hint="Leave at 0 if nothing has been collected."
            >
              <Input
                id="received_amount"
                name="received_amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={received}
                onChange={(event) => setReceived(event.target.value)}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2.5">
            <span className="text-sm text-ink-muted">Balance due</span>
            <span
              className={
                balance > 0
                  ? 'text-sm font-semibold tabular-nums text-[oklch(45%_0.13_70)]'
                  : 'text-sm font-semibold tabular-nums text-ink'
              }
            >
              {formatMoney(balance, account?.currency ?? 'INR')}
            </span>
          </div>

          <Field label="Payment status" htmlFor="payment_status" error={fieldErrors.payment_status}>
            <Select
              id="payment_status"
              name="payment_status"
              defaultValue={account?.payment_status ?? ''}
            >
              <option value="">Work it out from the amounts</option>
              {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((status) => (
                <option key={status} value={status}>
                  {PAYMENT_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Invoice number" htmlFor="invoice_number" error={fieldErrors.invoice_number}>
            <Input
              id="invoice_number"
              name="invoice_number"
              autoComplete="off"
              defaultValue={account?.invoice_number ?? ''}
              placeholder="Optional"
            />
          </Field>

          <Field label="Notes" htmlFor="notes" error={fieldErrors.notes}>
            <Textarea id="notes" name="notes" defaultValue={account?.notes ?? ''} rows={2} />
          </Field>

          {isClosed ? (
            <p className="text-xs text-ink-muted">
              This job is already closed. Saving updates the figures; it does not reopen it.
            </p>
          ) : (
            <Checkbox
              name="close"
              label="Close this job"
              hint="Marks the lead closed and emails the customer if they have portal access."
            />
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function toNumber(value: string): number {
  const parsed = Number(value.replace(/[,\s₹]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Downloads the register as a real `.xlsx`.
 *
 * A plain anchor, not a router push: this is a file download, not a
 * navigation. The browser's own handling shows progress, survives a slow
 * response and puts the file where the user expects it — and because the route
 * replies with `Content-Disposition: attachment`, the current page never moves.
 */
export function ExportAccountsButton({ tab }: { tab: string }) {
  return (
    <a
      href={`/api/accounts/export?tab=${encodeURIComponent(tab)}`}
      download
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-muted"
    >
      <LuDownload className="size-4" />
      Export Excel
    </a>
  );
}
