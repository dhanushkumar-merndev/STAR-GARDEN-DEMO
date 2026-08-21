import Link from 'next/link';
import { Button } from './index';

export { DEFAULT_PAGE_SIZE, readPageParam } from '@/lib/pagination';
export type { PaginatedResult } from '@/lib/pagination';

/**
 * Server-rendered Previous / Next control for the list screens.
 *
 * Extracted from the leads page so all five lists spell pagination the same
 * way. Deliberately link-based rather than stateful: the page number belongs
 * in the URL alongside the other filters, so a paged view can be shared,
 * bookmarked and restored by the back button (AGENTS.md §16).
 */

export function Pagination({
  basePath,
  params,
  page,
  total,
  pageSize,
}: {
  /** e.g. `/designs`. The other query params are carried over unchanged. */
  basePath: string;
  params: Record<string, string | string[] | undefined>;
  page: number;
  total: number;
  pageSize: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav className="mt-4 flex items-center justify-between" aria-label="Pagination">
      <PageLink basePath={basePath} params={params} page={page - 1} disabled={page <= 1}>
        Previous
      </PageLink>
      <span className="text-sm text-ink-muted">
        {first}–{last} of {total}
      </span>
      <PageLink basePath={basePath} params={params} page={page + 1} disabled={page >= totalPages}>
        Next
      </PageLink>
    </nav>
  );
}

function PageLink({
  basePath,
  params,
  page,
  disabled,
  children,
}: {
  basePath: string;
  params: Record<string, string | string[] | undefined>;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button size="sm" variant="ghost" disabled>
        {children}
      </Button>
    );
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value && key !== 'page') query.set(key, value);
  }
  query.set('page', String(page));

  return (
    <Link href={`${basePath}?${query.toString()}`}>
      <Button size="sm" variant="outline">
        {children}
      </Button>
    </Link>
  );
}
