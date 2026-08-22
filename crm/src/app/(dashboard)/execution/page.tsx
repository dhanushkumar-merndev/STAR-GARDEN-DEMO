import type { Metadata } from 'next';
import Link from 'next/link';
import { LuHardHat } from 'react-icons/lu';
import { requirePageRole } from '@/lib/auth/session';
import { listExecutionProjects } from '@/server/services/execution';
import { Alert, Card, EmptyState, PageHeader } from '@/components/ui';
import { ExecutionStatusBadge, DueBadge } from '@/components/status';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { countExecutionProjectsByScope } from '@/server/services/execution';
import { Pagination } from '@/components/ui/pagination';
import { readPageParam } from '@/lib/pagination';

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
  const user = await requirePageRole('SUPER_ADMIN', 'ADMIN', 'BDM', 'EXECUTION');
  const params = await searchParams;

  const scope =
    (typeof params.scope === 'string' ? params.scope : undefined) ??
    (user.role === 'EXECUTION' ? 'MINE' : 'ACTIVE');

  const page = readPageParam(params);

  const [{ items: projects, total, pageSize }, counts] = await Promise.all([
    listExecutionProjects(user, { scope: scope as (typeof SCOPES)[number]['value'], page }),
    countExecutionProjectsByScope(user, SCOPES.map((option) => option.value)),
  ]);

  return (
    <>
      <PageHeader
        title="Execution"
        subtitle={`${total} ${total === 1 ? 'project' : 'projects'}`}
      />

      <FilterTabs
        options={SCOPES.map((option) => ({ ...option, count: counts[option.value] ?? 0 }))}
        value={scope}
        label="Filter execution projects"
        hrefFor={(value) => `/execution?scope=${value}`}
        className="mb-4"
      />

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

      <Pagination
        basePath="/execution"
        params={params}
        page={page}
        total={total}
        pageSize={pageSize}
      />
    </>
  );
}
