import type { Metadata } from 'next';
import Link from 'next/link';
import type { IconType } from 'react-icons';
import {
  LuArrowLeft,
  LuArrowRight,
  LuClipboardList,
  LuHardHat,
  LuHistory,
  LuMail,
  LuMegaphone,
  LuPaperclip,
  LuPencilRuler,
  LuMapPin,
  LuSettings,
  LuUserRound,
  LuUsers,
  LuWallet,
} from 'react-icons/lu';
import { requirePageRole } from '@/lib/auth/session';
import { listAuditLog, listFileAccessLog } from '@/server/services/reports';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { describeAuditEntry } from '@/lib/audit/describe';
import { formatDateTime, humanizeEnum } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Audit history' };

/** Which part of the CRM an event came from, at a glance. */
const ENTITY_ICONS: Record<string, IconType> = {
  lead: LuUsers,
  follow_up: LuClipboardList,
  site_visit: LuMapPin,
  design_project: LuPencilRuler,
  design_version: LuPencilRuler,
  execution_project: LuHardHat,
  execution_task: LuHardHat,
  file: LuPaperclip,
  profile: LuUserRound,
  staff_invite: LuUserRound,
  lead_account: LuWallet,
  lead_portal_access: LuMail,
  app_setting: LuSettings,
  config_option: LuSettings,
  meta_field_mapping: LuMegaphone,
  meta_campaign: LuMegaphone,
  meta_sync_run: LuMegaphone,
};

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
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
          <LuArrowLeft className="size-4" />
          Settings
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
                const described = describeAuditEntry(entry, log.names);
                const Icon = ENTITY_ICONS[entry.entity_type] ?? LuHistory;
                const subject = entry.entity_id ? log.names[entry.entity_id] : null;

                return (
                  <li key={entry.id} className="flex gap-3 px-4 py-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-muted"
                    >
                      <Icon className="size-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-ink">{described.headline}</span>
                        <Badge tone={described.tone}>{described.entityLabel}</Badge>
                      </div>

                      <p className="mt-0.5 text-xs text-ink-muted">
                        {actor?.full_name ?? 'System'}
                        {actor?.role ? ` (${humanizeEnum(actor.role)})` : ''} ·{' '}
                        {formatDateTime(entry.created_at)}
                        {subject ? ` · ${subject}` : ''}
                      </p>

                      {described.facts.length > 0 ? (
                        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
                          {described.facts.map((fact) => (
                            <div key={fact.label} className="contents">
                              <dt className="text-ink-muted">{fact.label}</dt>
                              <dd className="text-ink">
                                {fact.from ? (
                                  <span className="inline-flex flex-wrap items-center gap-1.5">
                                    <span className="text-ink-subtle line-through">{fact.from}</span>
                                    <LuArrowRight className="size-3 shrink-0 text-ink-subtle" />
                                    <span>{fact.value}</span>
                                  </span>
                                ) : (
                                  fact.value
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}

                      {entry.after_data || entry.before_data ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-ink-subtle hover:text-ink-muted">
                            Raw record
                          </summary>
                          <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-muted p-2 text-xs text-ink-muted">
                            {JSON.stringify(
                              { before: entry.before_data, after: entry.after_data },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      ) : null}
                    </div>
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
