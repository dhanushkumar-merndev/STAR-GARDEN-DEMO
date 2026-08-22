import type { Metadata } from 'next';
import Link from 'next/link';
import { LuPencilRuler } from 'react-icons/lu';
import { requirePageRole } from '@/lib/auth/session';
import { listDesignProjects, type DesignScope } from '@/server/services/designs';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { DesignStatusBadge, DueBadge } from '@/components/status';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { countDesignProjectsByScope } from '@/server/services/designs';
import { Pagination } from '@/components/ui/pagination';
import { readPageParam } from '@/lib/pagination';

export const metadata: Metadata = { title: 'Designs' };

/** Designer queue and review list (AGENTS.md §11.5, §12.3). */
export default async function DesignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageRole('SUPER_ADMIN', 'ADMIN', 'BDM', 'LANDSCAPER');
  const params = await searchParams;

  const scope =
    (typeof params.scope === 'string' ? params.scope : undefined) ??
    (user.role === 'LANDSCAPER' ? 'MINE' : 'ALL');
  const designerId = typeof params.designer === 'string' && /^[0-9a-f-]{36}$/i.test(params.designer)
    ? params.designer
    : undefined;

  const scopes: { value: DesignScope; label: string }[] =
    user.role === 'LANDSCAPER'
      ? [
          { value: 'MINE', label: 'My designs' },
          { value: 'DUE', label: 'Due soon' },
        ]
      : [
          { value: 'ALL', label: 'All' },
          { value: 'PENDING', label: 'Pending' },
          { value: 'COMPLETED', label: 'Completed' },
          { value: 'READY_FOR_REVIEW', label: 'Ready for review' },
          { value: 'DUE', label: 'Due soon' },
        ];

  const page = readPageParam(params);

  const [{ items: projects, total, pageSize }, counts] = await Promise.all([
    listDesignProjects(user, { scope: scope as DesignScope, designerId, page }),
    countDesignProjectsByScope(user, scopes.map((option) => option.value), { designerId }),
  ]);

  return (
    <>
      <PageHeader
        title="Designs"
        subtitle={
          user.role === 'LANDSCAPER'
            ? 'Projects assigned to you'
            : `${total} design ${total === 1 ? 'project' : 'projects'}`
        }
      />

      <FilterTabs
        options={scopes.map((option) => ({ ...option, count: counts[option.value] ?? 0 }))}
        value={scope}
        label="Filter design projects"
        hrefFor={(value) => `/designs?scope=${value}${designerId ? `&designer=${designerId}` : ''}`}
        className="mb-4"
      />

      <Card>
        {projects.length === 0 ? (
          <EmptyState
            icon={<LuPencilRuler className="size-8" />}
            title="No design projects here"
            description={
              user.role === 'LANDSCAPER'
                ? 'Projects assigned to you will appear here.'
                : 'Mark a lead as needing a design, then assign a designer.'
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {projects.map((project) => {
              const lead = project.lead as unknown as {
                id: string;
                lead_code: string;
                customer_name: string;
                location_text: string | null;
              } | null;
              const designer = project.designer as unknown as { full_name: string } | null;

              return (
                <li key={project.id}>
                  <Link
                    href={`/designs/${project.id}`}
                    className="block px-4 py-3 hover:bg-surface-muted"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {lead?.customer_name ?? 'Design project'}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-ink-muted">
                          {lead?.lead_code}
                          {lead?.location_text ? ` · ${lead.location_text}` : ''}
                        </p>
                      </div>
                      <DesignStatusBadge value={project.status} />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone="neutral">{designer?.full_name ?? 'No designer'}</Badge>
                      {project.due_at ? <DueBadge value={project.due_at} /> : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Pagination
        basePath="/designs"
        params={params}
        page={page}
        total={total}
        pageSize={pageSize}
      />
    </>
  );
}
