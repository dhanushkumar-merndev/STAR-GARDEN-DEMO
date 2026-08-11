import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageRole } from '@/lib/auth/session';
import { listAuditLog, listFileAccessLog } from '@/server/services/reports';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { formatDateTime, humanizeEnum } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Audit history' };

/**
 * Audit history (AGENTS.md §11.7, §17).
 *
 * Append-only: there is no edit or delete control here, and the database has no
 * policy that would permit one. File reads get their own panel because §5.5's
 * "the BDM downloads and shares the file manually" is exactly the step the CRM
 * cannot see past — knowing a file left the system is the whole record.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageRole('ADMIN');
  const params = await searchParams;

  const page = Number(typeof params.page === 'string' ? params.page : 1);
  const action = typeof params.action === 'string' ? params.action : undefined;

  const [log, fileAccess] = await Promise.all([
    listAuditLog(user, { page, action }),
    listFileAccessLog(user, 30),
  ]);

  const totalPages = Math.max(1, Math.ceil(log.total / log.pageSize));

  return (
    <>
      <div className="mb-2">
        <Link href="/settings" className="text-sm text-ink-muted hover:text-ink">
          ← Settings
        </Link>
      </div>

      <PageHeader title="Audit history" subtitle={`${log.total} recorded events`} />

      <div className="space-y-4">
        <Card>
          <CardHeader title="All events" description="Append-only. Nothing here can be edited." />
          {log.items.length === 0 ? (
            <EmptyState title="No events yet" />
          ) : (
            <ul className="divide-y divide-line">
              {log.items.map((entry) => {
                const actor = (entry as { actor?: { full_name: string; role: string } | null }).actor;
                return (
                  <li key={entry.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand">{humanizeEnum(entry.action.replace(/\./g, ' '))}</Badge>
                      <Badge tone="neutral">{entry.entity_type}</Badge>
                      <span className="text-xs text-ink-muted">
                        {actor?.full_name ?? 'System'} · {formatDateTime(entry.created_at)}
                      </span>
                    </div>

                    {entry.after_data ? (
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-muted p-2 text-xs text-ink-muted">
                        {JSON.stringify(entry.after_data, null, 2)}
                      </pre>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {totalPages > 1 ? (
          <nav className="flex items-center justify-between" aria-label="Pagination">
            <Link href={`/settings/audit?page=${Math.max(1, page - 1)}`}>
              <Button size="sm" variant="outline" disabled={page <= 1}>
                Previous
              </Button>
            </Link>
            <span className="text-sm text-ink-muted">
              Page {page} of {totalPages}
            </span>
            <Link href={`/settings/audit?page=${Math.min(totalPages, page + 1)}`}>
              <Button size="sm" variant="outline" disabled={page >= totalPages}>
                Next
              </Button>
            </Link>
          </nav>
        ) : null}

        <Card>
          <CardHeader
            title="File access"
            description="Who previewed or downloaded a private file. The CRM cannot see what happens after a download."
          />
          {fileAccess.length === 0 ? (
            <EmptyState title="No file access recorded yet" />
          ) : (
            <ul className="divide-y divide-line">
              {fileAccess.map((entry) => {
                const file = (entry as { file?: { original_filename: string; category: string } | null })
                  .file;
                const actor = (entry as { user?: { full_name: string } | null }).user;

                return (
                  <li key={entry.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                    <Badge tone={entry.action === 'DOWNLOAD' ? 'warn' : 'neutral'}>
                      {entry.action === 'DOWNLOAD' ? 'Downloaded' : 'Previewed'}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {file?.original_filename ?? 'File'}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {actor?.full_name ?? 'Unknown'} · {formatDateTime(entry.created_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
