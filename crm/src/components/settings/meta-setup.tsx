'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { LuArrowRight, LuCheck, LuCircleAlert, LuLink2 } from 'react-icons/lu';
import { Alert, Badge, Button, Card, CardBody, CardHeader } from '@/components/ui';
import {
  saveCampaignSelectionAction,
  selectAdAccountAction,
} from '@/server/actions/admin';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { AdAccountChoice, CampaignSetupRow } from '@/server/services/meta-config';

/**
 * Meta setup, in the order the owner thinks about it:
 *
 *   1. Which ad account?
 *   2. Which campaigns on it?
 *   3. Are those campaigns' lead forms actually connected to our columns?
 *
 * Step 3 is the one that matters and the one nobody remembers: a campaign whose
 * form has no confirmed mapping silently parks every lead it produces as
 * UNMAPPED_FORM. So the mapping state is shown next to each campaign rather
 * than hidden on a separate screen.
 *
 * Everything here writes to Supabase. Nothing touches a deployment environment
 * variable, so switching account never needs a redeploy.
 */

/* -------------------------------------------------------------------------- */
/* Step 1 — the ad account                                                     */
/* -------------------------------------------------------------------------- */

export function AdAccountPicker({ accounts }: { accounts: AdAccountChoice[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function choose(id: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('meta_ad_account_id', id);

      const result = await selectAdAccountAction(null, formData);

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success('Ad account selected. The next sync will use it.');
      router.refresh();
    });
  }

  if (accounts.length === 0) {
    return (
      <Alert tone="warn" title="No ad accounts found yet">
        Press <span className="font-semibold">Sync campaigns</span> on the Integrations page.
        If the list stays empty, the access token is missing the{' '}
        <code className="font-mono text-xs">ads_read</code> permission — see{' '}
        <span className="font-medium">META.md</span> for the exact steps.
      </Alert>
    );
  }

  return (
    <ul className="space-y-2">
      {accounts.map((account) => (
        <li key={account.id}>
          <button
            type="button"
            disabled={pending}
            onClick={() => choose(account.meta_ad_account_id)}
            aria-pressed={account.isSelected}
            className={cn(
              'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
              account.isSelected
                ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200'
                : 'border-line bg-surface hover:bg-surface-muted',
              pending && 'opacity-60',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                account.isSelected
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-line bg-surface',
              )}
            >
              {account.isSelected ? <LuCheck className="size-3" strokeWidth={3} /> : null}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">{account.name}</span>
                {account.isSelected ? <Badge tone="brand">In use</Badge> : null}
                {!account.is_present_in_latest_sync ? (
                  <Badge tone="warn">Not seen in the last sync</Badge>
                ) : account.account_status !== null && account.account_status !== 1 ? (
                  // Meta's own code, untranslated: 1 is active and anything
                  // else means the account cannot currently serve ads.
                  <Badge tone="warn">Meta status {account.account_status}</Badge>
                ) : null}
              </span>

              <span className="mt-0.5 block text-xs text-ink-muted">
                {account.meta_ad_account_id}
                {account.business_name ? ` · ${account.business_name}` : ''}
                {account.currency ? ` · ${account.currency}` : ''}
              </span>

              <span className="mt-1 block text-xs text-ink-muted">
                {account.campaignCount === 0
                  ? 'No campaigns synced yet'
                  : `${account.campaignCount} campaign${account.campaignCount === 1 ? '' : 's'} synced`}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Steps 2 and 3 — campaigns, and their mapping                                */
/* -------------------------------------------------------------------------- */

export function CampaignSelectionForm({
  adAccountId,
  rows,
  mode,
}: {
  adAccountId: string | null;
  rows: CampaignSetupRow[];
  mode: 'ALL' | 'SELECTED';
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [selectionMode, setSelectionMode] = React.useState<'ALL' | 'SELECTED'>(mode);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await saveCampaignSelectionAction(null, formData);

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(
        result.data.mode === 'ALL'
          ? 'Saved. Every campaign on this account will be synced.'
          : `Saved. ${result.data.count} campaign${result.data.count === 1 ? '' : 's'} selected.`,
      );
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <Alert tone="info">
        No campaigns have synced for this account yet. Press{' '}
        <span className="font-semibold">Sync campaigns</span> on the Integrations page — the
        scheduled sync also runs every 10 minutes.
      </Alert>
    );
  }

  const unmapped = rows.filter(
    (row) => row.forms.length > 0 && row.forms.some((form) => !form.isMapped),
  );

  return (
    <form action={onSubmit} className="space-y-4">
      <input type="hidden" name="meta_ad_account_id" value={adAccountId ?? ''} />
      <input type="hidden" name="selection_mode" value={selectionMode} />

      <fieldset className="space-y-2">
        <legend className="sr-only">Which campaigns feed the CRM</legend>

        {(['ALL', 'SELECTED'] as const).map((option) => (
          <label
            key={option}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3',
              selectionMode === option
                ? 'border-brand-500 bg-brand-50'
                : 'border-line bg-surface hover:bg-surface-muted',
            )}
          >
            <input
              type="radio"
              name="mode_choice"
              checked={selectionMode === option}
              onChange={() => setSelectionMode(option)}
              className="mt-0.5 size-4 shrink-0 text-brand-600 focus:ring-brand-300"
            />
            <span className="text-sm">
              <span className="font-medium text-ink">
                {option === 'ALL' ? 'Every campaign on this account' : 'Only the ones I tick'}
              </span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                {option === 'ALL'
                  ? 'Simplest, and right for most businesses.'
                  : 'Use this if the account also runs work this CRM should not count.'}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {unmapped.length > 0 ? (
        <Alert tone="warn" title="Some lead forms are not connected yet">
          {unmapped.length} campaign{unmapped.length === 1 ? ' has a form' : 's have forms'} with
          no confirmed field mapping. Leads from those forms are held safely, but they will not
          become CRM leads until you connect the fields.
        </Alert>
      ) : null}

      <ul className="divide-y divide-line rounded-lg border border-line">
        {rows.map(({ campaign, forms }) => (
          <li key={campaign.id} className="p-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="campaign_ids"
                value={campaign.meta_campaign_id}
                defaultChecked={campaign.is_selected}
                disabled={selectionMode === 'ALL'}
                className="mt-0.5 size-5 shrink-0 rounded border-line text-brand-600 focus:ring-brand-300 disabled:opacity-40"
              />

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{campaign.name}</span>
                  <Badge tone={campaign.effective_status === 'ACTIVE' ? 'ok' : 'neutral'}>
                    {campaign.effective_status ?? 'Unknown'}
                  </Badge>
                </span>

                {campaign.last_synced_at ? (
                  <span className="mt-0.5 block text-xs text-ink-subtle">
                    Synced {formatDateTime(campaign.last_synced_at)}
                  </span>
                ) : null}
              </span>
            </label>

            {/* Step 3 sits inside step 2 on purpose: the form and its mapping
                are the reason a campaign is worth selecting at all. */}
            <div className="mt-2 ml-8 space-y-1.5">
              {forms.length === 0 ? (
                <p className="text-xs text-ink-subtle">
                  No lead form linked to this campaign yet.
                </p>
              ) : (
                forms.map((form) => (
                  <div
                    key={form.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-muted px-2.5 py-1.5"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {form.isMapped ? (
                        <LuCheck className="size-3.5 shrink-0 text-[--color-ok]" />
                      ) : (
                        <LuCircleAlert className="size-3.5 shrink-0 text-[oklch(45%_0.13_70)]" />
                      )}
                      <span className="truncate text-xs text-ink">{form.name}</span>
                    </span>

                    <Link
                      href={`/settings/integrations/mapping?form=${encodeURIComponent(form.metaFormId)}`}
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                    >
                      <LuLink2 className="size-3" />
                      {form.isMapped ? 'Edit mapping' : 'Connect fields'}
                      <LuArrowRight className="size-3" />
                    </Link>
                  </div>
                ))
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save selection'}
        </Button>
      </div>
    </form>
  );
}

/** Small wrapper so the page reads as three numbered steps. */
export function SetupStep({
  number,
  title,
  description,
  status,
  children,
}: {
  number: number;
  title: string;
  description: string;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-800">
              {number}
            </span>
            {title}
          </span>
        }
        description={description}
        action={status}
      />
      <CardBody>{children}</CardBody>
    </Card>
  );
}
