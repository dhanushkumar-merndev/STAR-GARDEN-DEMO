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
import type { LeadStatus } from '@/types/database';

export function formatMobileDisplay(countryCode: string, national: string): string {
  return formatMobile(countryCode, national);
}

/**
 * Where the lead list starts with no query string.
 *
 * Lives here, not beside the filter form: that form is a Client Component, and
 * the list page is a Server Component that needs the same answer to resolve
 * its own filters. A function exported from a `'use client'` module cannot be
 * called on the server at all — only rendered or passed as a prop.
 *
 * Admins open onto the work that needs them — leads nobody owns yet. A BDM
 * cannot: their list is already scoped to leads assigned to *them*, and an
 * assigned lead is by definition never UNASSIGNED, so the same default would
 * hand them a permanently empty page.
 */
export function defaultStatusFilter(isAdmin: boolean): LeadStatus | 'ALL' {
  return isAdmin ? 'UNASSIGNED' : 'ALL';
}
