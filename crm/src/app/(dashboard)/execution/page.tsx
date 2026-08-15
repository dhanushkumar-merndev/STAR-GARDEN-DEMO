import type { Metadata } from 'next';
import Link from 'next/link';
import { LuHardHat } from 'react-icons/lu';
import { requirePageRole } from '@/lib/auth/session';
import { listExecutionProjects } from '@/server/services/execution';
import { Alert, Card, EmptyState, PageHeader } from '@/components/ui';
import { ExecutionStatusBadge, DueBadge } from '@/components/status';

export const metadata: Metadata = { title: 'Execution' };

const SCOPES = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'MINE', label: 'Mine' },
  { value: 'BLOCKED', label: 'Blocked' },
  { value: 'ALL', label: 'All' },
] as const;

/** Execution board (AGENTS.md §11.6, §12.4). */
export default async function ExecutionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageRole('ADMIN', 'BDM', 'EXECUTION');
  const params = await searchParams;

  const scope =
    (typeof params.scope === 'string' ? params.scope : undefined) ??
    (user.role === 'EXECUTION' ? 'MINE' : 'ACTIVE');

  const projects = await listExecutionProjects(user, {
    scope: scope as (typeof SCOPES)[number]['value'],
  });

  return (
    <>
      <PageHeader
        title="Execution"
        subtitle={`${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`}
      />

      <nav className="-mx-3 mb-4 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-3 pb-2 lg:mx-0 lg:px-0" aria-label="Filter">
        {SCOPES.map((option) => {
          const active = option.value === scope;
          return (
            <Link
              key={option.value}
              href={`/execution?scope=${option.value}`}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'tap flex shrink-0 snap-start items-center justify-center rounded-full bg-brand-600 px-4 text-sm font-medium whitespace-nowrap text-white'
                  : 'tap flex shrink-0 snap-start items-center justify-center rounded-full border border-line bg-surface px-4 text-sm font-medium whitespace-nowrap text-ink-muted'
              }
            >
              {option.label}
            </Link>
          );
        })}
      </nav>

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LuHardHat className="size-8" />}
            title="No execution projects"
            description="Projects appear here once a design is approved and handed over."
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {projects.map((project) => {
              const lead = project.lead as unknown as {
                lead_code: string;
                customer_name: string;
                location_text: string | null;
              } | null;

              return (
                <li key={project.id}>
                  <Link
                    href={`/execution/${project.id}`}
                    className="block px-4 py-3 hover:bg-surface-muted"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {project.title ?? lead?.customer_name ?? 'Execution project'}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-ink-muted">
                          {lead?.lead_code}
                          {lead?.location_text ? ` · ${lead.location_text}` : ''}
                        </p>
                      </div>
                      <ExecutionStatusBadge value={project.status} />
                    </div>

                    <div className="mt-2 flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${project.progress_percent}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium tabular-nums text-ink-muted">
                        {project.progress_percent}%
                      </span>
                      {project.due_at ? <DueBadge value={project.due_at} /> : null}
                    </div>

                    {project.blocker_summary ? (
                      <div className="mt-2">
                        <Alert tone="danger">{project.blocker_summary}</Alert>
                      </div>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
