/**
 * Shared pagination vocabulary.
 *
 * Neutral module on purpose, for the same reason as `lib/leads/status-filters`:
 * the list services are `server-only`, the Pagination control is a component,
 * and both need the same page size and the same result shape. Neither owns it.
 */

/** What every paged list service returns. */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** The page size the list screens use unless they ask for something else. */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Reads `?page=` from already-resolved search params.
 *
 * Anything unparseable becomes page 1 rather than an error — a hand-edited URL
 * should land somewhere sensible, not on a crash.
 */
export function readPageParam(
  params: Record<string, string | string[] | undefined>,
): number {
  const raw = typeof params.page === 'string' ? Number(params.page) : 1;
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}
