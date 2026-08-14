import type { Metadata } from 'next';
import Link from 'next/link';
import { LuPencilRuler } from 'react-icons/lu';
import { requirePageRole } from '@/lib/auth/session';
import { listDesignProjects, type DesignScope } from '@/server/services/designs';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { DesignStatusBadge, DueBadge } from '@/components/status';
import { formatDue } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Designs' };

/** Designer queue and review list (AGENTS.md §11.5, §12.3). */
export default async function DesignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageRole('ADMIN', 'BDM', 'DESIGNER');
  const params = await searchParams;

  const scope =
    (typeof params.scope === 'string' ? params.scope : undefined) ??
    (user.role === 'DESIGNER' ? 'MINE' : 'ALL');

  const scopes: { value: DesignScope; label: string }[] =
    user.role === 'DESIGNER'
      ? [
          { value: 'MINE', label: 'My designs' },
          { value: 'DUE', label: 'Due soon' },
        ]
      : [
          { value: 'ALL', label: 'All' },
          { value: 'AWAITING_ASSIGNMENT', label: 'Needs designer' },
          { value: 'READY_FOR_REVIEW', label: 'Ready for review' },
          { value: 'DUE', label: 'Due soon' },
        ];

  const projects = await listDesignProjects(user, { scope: scope as DesignScope });

  return (
    <>
      <PageHeader
        title="Designs"
        subtitle={
          user.role === 'DESIGNER'
            ? 'Projects assigned to you'
            : `${projects.length} design ${projects.length === 1 ? 'project' : 'projects'}`
        }
      />

      <nav className="-mx-3 mb-4 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-3 pb-2 lg:mx-0 lg:px-0" aria-label="Filter">
        {scopes.map((option) => {
          const active = option.value === scope;
          return (
            <Link
              key={option.value}
              href={`/designs?scope=${option.value}`}
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

      <Card>
        {projects.length === 0 ? (
          <EmptyState
            icon={<LuPencilRuler className="size-8" />}
            title="No design projects here"
            description={
              user.role === 'DESIGNER'
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
              const due = formatDue(project.due_at);

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
                      {project.due_at ? <DueBadge label={due.label} tone={due.tone} /> : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
