import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageRole } from '@/lib/auth/session';
import { getMetaHealth } from '@/server/services/meta-config';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { RetryMetaEventButton } from '@/components/settings/integration-actions';
import { formatDateTime } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Meta integration issues' };

export default async function IntegrationIssuesPage() {
  const user = await requirePageRole('ADMIN');
  const health = await getMetaHealth(user);

  return (
    <>
      <div className="mb-2"><Link href="/settings/integrations" className="text-sm text-ink-muted hover:text-ink">← Integrations</Link></div>
      <PageHeader title="Integration issues" subtitle="Unmapped and failed Meta lead events remain retryable" />
      <Card>
        {health.recentIssues.length === 0 ? <EmptyState title="No unresolved Meta events" description="Webhook processing is healthy." /> : (
          <ul className="divide-y divide-line">
            {health.recentIssues.map((issue) => (
              <li key={issue.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={issue.processing_status === 'FAILED' ? 'danger' : 'warn'}>{issue.processing_status.replace(/_/g, ' ')}</Badge>
                  <span className="text-sm font-medium text-ink">{issue.form_name ?? issue.form_id ?? 'Unknown form'}</span>
                  <span className="text-xs text-ink-muted">{formatDateTime(issue.created_at)} · {issue.attempt_count} attempt(s)</span>
                  <span className="ml-auto"><RetryMetaEventButton eventId={issue.id} /></span>
                </div>
                {issue.last_error ? <p className="text-sm text-ink-muted">{issue.last_error}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
