import type { Metadata } from 'next';
import Link from 'next/link';
import { LuArrowLeft } from 'react-icons/lu';
import { requirePageRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { emailStatus } from '@/lib/email';
import { getMetaHealth } from '@/server/services/meta-config';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader, StatTile } from '@/components/ui';
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
      <div className="mb-2"><Link href="/settings" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"><LuArrowLeft className="size-4" />Settings</Link></div>
      <PageHeader title="Integrations" subtitle="Email delivery and Meta Lead Ads health" />

      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Email delivery"
            description="A secondary channel; workflow changes never depend on email delivery."
            action={
              <Badge tone={email.configured ? 'ok' : 'warn'}>
                {email.configured
                  ? email.provider === 'BREVO'
                    ? 'Brevo'
                    : 'SMTP'
                  : 'Not configured'}
              </Badge>
            }
          />
          <CardBody className="space-y-4">
            {/* Names the one missing variable rather than saying "not
                configured" at someone who has clearly configured half of it. */}
            {email.setupGap ? <Alert tone="warn">{email.setupGap}</Alert> : null}

            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-ink-muted">Provider</dt>
                <dd className="font-medium text-ink">
                  {email.provider === 'BREVO'
                    ? 'Brevo transactional API'
                    : email.provider === 'SMTP'
                      ? `SMTP · ${email.host}:${email.port}`
                      : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Sender</dt>
                <dd className="font-medium text-ink">{email.senderName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Address</dt>
                <dd className="font-medium break-all text-ink">{email.sender ?? '—'}</dd>
              </div>
            </dl>

            {email.hasFallback ? (
              <p className="text-xs text-ink-muted">
                SMTP is also configured and takes over automatically if the Brevo key is
                removed.
              </p>
            ) : null}

            <TestEmailButton />

            <div className="rounded-xl border border-line bg-surface-muted/60 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-ink">When the CRM sends email</h3>
                  <p className="mt-1 text-xs text-ink-muted">
                    Email is a secondary alert. The CRM workflow and in-app notification still work if delivery fails.
                  </p>
                </div>
                <Badge tone="neutral">Email is logged below</Badge>
              </div>

              <div className="mt-4 grid gap-5 text-sm lg:grid-cols-2">
                <section>
                  <h4 className="font-semibold text-ink">Staff emails — automatic</h4>
                  <ul className="mt-2 space-y-2 text-ink-muted">
                    <li><span className="font-medium text-ink">Lead assigned or reassigned:</span> sent to the new owner.</li>
                    <li><span className="font-medium text-ink">Site visit scheduled or rescheduled:</span> sent to the BDM and designer attending the visit.</li>
                    <li><span className="font-medium text-ink">Landscape design assigned:</span> sent to the assigned designer.</li>
                    <li><span className="font-medium text-ink">Design ready, revision requested, or approved:</span> sent to the staff member who must act next.</li>
                    <li><span className="font-medium text-ink">Execution assigned:</span> sent to every newly assigned execution member.</li>
                    <li><span className="font-medium text-ink">Overdue follow-up, overdue design, blocked work, or a cancelled visit:</span> sent only when the matching in-app alert is created.</li>
                  </ul>
                </section>

                <section>
                  <h4 className="font-semibold text-ink">Customer emails — controlled</h4>
                  <ul className="mt-2 space-y-2 text-ink-muted">
                    <li><span className="font-medium text-ink">Customer portal invite:</span> sent when an Admin gives that customer portal access, unless the Admin unticks sending the invite.</li>
                    <li><span className="font-medium text-ink">Project status update:</span> sent only when an Admin presses Send status update to an approved portal email address.</li>
                    <li><span className="font-medium text-ink">Project/account closed:</span> sent to active portal recipients when an Admin closes the account.</li>
                  </ul>
                  <p className="mt-3 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-900">
                    No automatic customer email is sent for calling, call outcomes, WhatsApp, notes, lead creation, or internal status changes.
                  </p>
                </section>
              </div>
            </div>

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
              {/* Setup comes first: an account has to be chosen before a sync
                  has anything to fetch. */}
              <Link
                href="/settings/integrations/meta"
                className="tap inline-flex items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
              >
                Meta setup
              </Link>
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
