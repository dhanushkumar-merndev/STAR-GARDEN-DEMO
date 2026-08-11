import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { emailStatus } from '@/lib/email';
import { getMetaHealth } from '@/server/services/meta-config';
import { Badge, Card, CardBody, CardHeader, PageHeader, StatTile } from '@/components/ui';
import { SyncMetaButton, TestEmailButton } from '@/components/settings/integration-actions';
import { formatDateTime } from '@/lib/utils/format';
import { VirtualizedTable } from '@/components/ui/virtualized-table';

export const metadata: Metadata = { title: 'Integrations' };

export default async function IntegrationsPage() {
  const user = await requirePageRole('ADMIN');
  const supabase = await createClient();
  const [meta, emailLogs] = await Promise.all([
    getMetaHealth(user),
    supabase.from('email_logs').select('*').order('created_at', { ascending: false }).limit(500),
  ]);
  const email = emailStatus();
  const metaConnected =
    meta.lastCampaignSync?.status === 'SUCCESS' || Boolean(meta.lastSuccessfulWebhookAt);

  return (
    <>
      <div className="mb-2"><Link href="/settings" className="text-sm text-ink-muted hover:text-ink">← Settings</Link></div>
      <PageHeader title="Integrations" subtitle="Email delivery and Meta Lead Ads health" />

      <div className="space-y-4">
        <Card>
          <CardHeader
            title="SMTP email"
            description="A secondary channel; workflow changes never depend on email delivery."
            action={<Badge tone={email.configured ? 'ok' : 'warn'}>{email.configured ? 'Configured' : 'Not configured'}</Badge>}
          />
          <CardBody className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-ink-muted">Server</dt><dd className="font-medium text-ink">{email.host ? `${email.host}:${email.port}` : '—'}</dd></div>
              <div><dt className="text-xs text-ink-muted">Sender</dt><dd className="font-medium text-ink">{email.senderName ?? '—'}</dd></div>
              <div><dt className="text-xs text-ink-muted">Address</dt><dd className="font-medium text-ink">{email.sender ?? '—'}</dd></div>
            </dl>
            <TestEmailButton />

            <VirtualizedTable
              initialPageSize={10}
              emptyMessage="No email attempts recorded yet."
              columns={[
                { key: 'type', label: 'Type', width: '12rem' },
                { key: 'recipient', label: 'Recipient', width: 'minmax(14rem,1fr)' },
                { key: 'status', label: 'Status', width: '7rem' },
                { key: 'time', label: 'Time', width: '11rem' },
              ]}
              rows={(emailLogs.data ?? []).map((log) => ({
                id: log.id,
                cells: {
                  type: { text: log.email_type },
                  recipient: { text: log.recipient },
                  status: { text: log.status, tone: log.status === 'SENT' ? 'ok' : 'danger' },
                  time: { text: formatDateTime(log.created_at) },
                },
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Meta Lead Ads"
            description="Campaign and insight sync runs on Supabase Cron."
            action={<Badge tone={metaConnected ? 'ok' : 'warn'}>{metaConnected ? 'Connected' : 'Awaiting first sync'}</Badge>}
          />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile label="Campaigns" value={meta.campaignCount} />
              <StatTile label="Active" value={meta.activeCampaignCount} tone="brand" />
              <StatTile label="Failed webhooks" value={meta.failedWebhookCount} tone={meta.failedWebhookCount ? 'danger' : 'neutral'} />
              <StatTile label="Unmapped forms" value={meta.unmappedFormCount} tone={meta.unmappedFormCount ? 'warn' : 'neutral'} />
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div><p className="text-xs text-ink-muted">Last campaign sync</p><p>{formatDateTime(meta.lastCampaignSync?.completed_at)}</p></div>
              <div><p className="text-xs text-ink-muted">Last insights sync</p><p>{formatDateTime(meta.lastInsightsSync?.completed_at)}</p></div>
              <div><p className="text-xs text-ink-muted">Last successful webhook</p><p>{formatDateTime(meta.lastSuccessfulWebhookAt)}</p></div>
            </div>

            <div className="flex flex-wrap gap-2">
              <SyncMetaButton syncType="CAMPAIGNS" />
              <SyncMetaButton syncType="INSIGHTS" />
              <Link href="/settings/integrations/mapping" className="tap inline-flex items-center rounded-lg border border-line px-4 text-sm font-medium text-ink hover:bg-surface-muted">Manage form mapping</Link>
              <Link href="/settings/integrations/issues" className="tap inline-flex items-center rounded-lg border border-line px-4 text-sm font-medium text-ink hover:bg-surface-muted">Integration issues</Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
