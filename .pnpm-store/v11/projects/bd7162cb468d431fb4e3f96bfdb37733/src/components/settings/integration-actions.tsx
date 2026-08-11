'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, Select } from '@/components/ui';
import {
  retryMetaEventAction,
  saveMetaMappingAction,
  sendTestEmailAction,
  syncMetaAction,
} from '@/server/actions/admin';
import type { MappingEntry } from '@/lib/meta/mapping';
import { CRM_FIELD_LABELS, MAPPABLE_CRM_FIELDS } from '@/lib/meta/mapping';
import type { MetaFieldMappingRow, MetaFormQuestion, MetaSyncType } from '@/types/database';

function useAdminAction() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function run(
    action: (previous: unknown, formData: FormData) => Promise<{ ok: boolean; message?: string }>,
    formData: FormData,
    success: string,
  ) {
    setPending(true);
    try {
      const result = await action(null, formData);
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } finally {
      setPending(false);
    }
  }

  return { pending, run };
}

export function TestEmailButton() {
  const { pending, run } = useAdminAction();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() => run(sendTestEmailAction, new FormData(), 'Test email sent.')}
    >
      {pending ? 'Sending…' : 'Send test email'}
    </Button>
  );
}

export function SyncMetaButton({ syncType }: { syncType: Exclude<MetaSyncType, 'WEBHOOK_REPLAY'> }) {
  const { pending, run } = useAdminAction();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() => {
        const data = new FormData();
        data.set('sync_type', syncType);
        void run(syncMetaAction, data, `${syncType === 'CAMPAIGNS' ? 'Campaign' : 'Insights'} sync complete.`);
      }}
    >
      {/* Two of these buttons sit side by side and they do different things.
          Labelling both "Sync now" made the pair unusable — the label has to
          say which of the two feeds is being refreshed. */}
      {pending
        ? 'Syncing…'
        : syncType === 'CAMPAIGNS'
          ? 'Sync campaigns'
          : 'Sync spend & results'}
    </Button>
  );
}

export function RetryMetaEventButton({ eventId }: { eventId: string }) {
  const { pending, run } = useAdminAction();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        const data = new FormData();
        data.set('event_id', eventId);
        void run(retryMetaEventAction, data, 'Webhook event retried.');
      }}
    >
      {pending ? 'Retrying…' : 'Retry'}
    </Button>
  );
}

export function MetaMappingEditor({
  formId,
  questions,
  current,
}: {
  formId: string;
  questions: MetaFormQuestion[];
  current: MetaFieldMappingRow[];
}) {
  const { pending, run } = useAdminAction();
  const currentByKey = new Map(current.map((row) => [row.meta_field_key, row.crm_field]));
  const [entries, setEntries] = React.useState<MappingEntry[]>(
    questions.map((question) => ({
      metaFieldKey: question.key,
      metaFieldLabel: question.label,
      crmField: currentByKey.get(question.key) ?? 'IGNORE',
    })),
  );

  function update(index: number, crmField: MappingEntry['crmField']) {
    setEntries((value) => value.map((entry, i) => (i === index ? { ...entry, crmField } : entry)));
  }

  const preview = entries.filter((entry) => entry.crmField !== 'IGNORE');

  return (
    <div className="space-y-4">
      <div className="divide-y divide-line rounded-lg border border-line">
        {entries.map((entry, index) => (
          <div key={entry.metaFieldKey} className="grid gap-2 p-3 sm:grid-cols-[1fr_1fr] sm:items-center">
            <div>
              <p className="text-sm font-medium text-ink">{entry.metaFieldLabel || entry.metaFieldKey}</p>
              <p className="text-xs text-ink-muted">{entry.metaFieldKey}</p>
            </div>
            <Select value={entry.crmField} onChange={(event) => update(index, event.target.value as MappingEntry['crmField'])}>
              {MAPPABLE_CRM_FIELDS.map((field) => (
                <option key={field} value={field}>{CRM_FIELD_LABELS[field]}</option>
              ))}
            </Select>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-surface-muted p-3 text-xs text-ink-muted">
        <p className="font-medium text-ink">Preview</p>
        {preview.length ? preview.map((entry) => (
          <p key={entry.metaFieldKey} className="mt-1">
            {entry.metaFieldLabel || entry.metaFieldKey} → {CRM_FIELD_LABELS[entry.crmField]}
          </p>
        )) : <p className="mt-1">No fields will be imported.</p>}
      </div>

      <Button
        disabled={pending}
        onClick={() => {
          const data = new FormData();
          data.set('meta_form_id', formId);
          data.set('entries', JSON.stringify(entries));
          void run(saveMetaMappingAction, data, 'Form mapping saved.');
        }}
      >
        {pending ? 'Saving…' : 'Save mapping'}
      </Button>
    </div>
  );
}
