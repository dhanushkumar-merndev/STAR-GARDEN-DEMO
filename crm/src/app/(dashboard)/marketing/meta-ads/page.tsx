import type { Metadata } from 'next';
import { requirePageRole } from '@/lib/auth/session';
import { getCampaignPerformance } from '@/server/services/meta-config';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { VirtualizedTable } from '@/components/ui/virtualized-table';
import { formatDateTime } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Meta Ads' };

export default async function MetaAdsPage() {
  const user = await requirePageRole('ADMIN');
  const rows = await getCampaignPerformance(user);

  return (
    <>
      <PageHeader title="Meta Ads" subtitle="Today’s campaign performance from synced data" />
      <Card>
        {rows.length === 0 ? <EmptyState title="No campaigns synced" description="Open Settings → Integrations and run a campaign sync." /> : (
          <VirtualizedTable
            columns={[
              { key: 'campaign', label: 'Campaign', width: 'minmax(15rem,2fr)' },
              { key: 'status', label: 'Status', width: '8rem' },
              { key: 'spend', label: 'Spend today', width: '8rem', align: 'right' },
              { key: 'leads', label: 'Leads today', width: '7rem', align: 'right' },
              { key: 'cpl', label: 'CPL', width: '7rem', align: 'right' },
              { key: 'impressions', label: 'Impressions', width: '8rem', align: 'right' },
              { key: 'clicks', label: 'Clicks', width: '6rem', align: 'right' },
              { key: 'forms', label: 'Mapped forms', width: '14rem' },
              { key: 'synced', label: 'Last synced', width: '11rem' },
            ]}
            rows={rows.map((row) => ({
              id: row.campaign.id,
              cells: {
                campaign: { text: row.campaign.name },
                status: { text: row.campaign.effective_status ?? 'Unknown', tone: row.campaign.effective_status === 'ACTIVE' ? 'ok' : 'neutral' },
                spend: { text: `₹${row.spendToday.toLocaleString('en-IN')}` },
                leads: { text: String(row.leadsToday) },
                cpl: { text: row.costPerLead === null ? '—' : `₹${row.costPerLead.toLocaleString('en-IN')}` },
                impressions: { text: row.impressions.toLocaleString('en-IN') },
                clicks: { text: row.clicks.toLocaleString('en-IN') },
                forms: { text: row.mappedForms.join(', ') || '—' },
                synced: { text: formatDateTime(row.campaign.last_synced_at) },
              },
            }))}
          />
        )}
      </Card>
    </>
  );
}
