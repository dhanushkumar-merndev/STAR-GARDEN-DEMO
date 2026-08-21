/**
 * Small presentation helpers shared across lead screens.
 *
 * Re-exported from the pure utility modules so page components import one
 * module instead of three, and so nothing in the client bundle reaches into
 * `server-only` code by accident.
 */

export { formatDue, formatDateTime, formatDate, formatTime, formatRelative, humanizeEnum } from '@/lib/utils/format';
export { telHref } from '@/lib/utils/phone';

import { formatMobile } from '@/lib/utils/phone';

export function formatMobileDisplay(countryCode: string, national: string): string {
  return formatMobile(countryCode, national);
}

/**
 * The stage-filter vocabulary, shared with the server. Re-exported here so lead
 * components keep importing one module.
 */
export {
  STATUS_FILTERS,
  defaultStatusFilter,
  parseStatusFilter,
} from '@/lib/leads/status-filters';
export type { LeadStatusFilter } from '@/lib/leads/status-filters';
