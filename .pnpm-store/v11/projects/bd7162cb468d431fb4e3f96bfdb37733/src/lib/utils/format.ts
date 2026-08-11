import { format, formatDistanceToNowStrict, isPast, isToday, isTomorrow } from 'date-fns';

/**
 * Display helpers. All CRM timestamps are stored in UTC (`timestamptz`) and
 * rendered in the viewer's local zone, which for this deployment is IST.
 */

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "10 Aug 2026, 4:30 pm" */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "d MMM yyyy, h:mm aaa") : '—';
}

/** "10 Aug 2026" */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, 'd MMM yyyy') : '—';
}

/** "4:30 pm" */
export function formatTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, 'h:mm aaa') : '—';
}

/** "2 hours ago" / "in 3 days" */
export function formatRelative(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  const distance = formatDistanceToNowStrict(d);
  return isPast(d) ? `${distance} ago` : `in ${distance}`;
}

/**
 * Due-date label for lists. Overdue state is carried in the returned `tone`
 * rather than colour alone, because §16 forbids relying on colour by itself.
 */
export function formatDue(value: string | Date | null | undefined): {
  label: string;
  tone: 'overdue' | 'today' | 'upcoming' | 'none';
} {
  const d = toDate(value);
  if (!d) return { label: 'No date', tone: 'none' };

  if (isPast(d)) return { label: `Overdue · ${formatRelative(d)}`, tone: 'overdue' };
  if (isToday(d)) return { label: `Today, ${formatTime(d)}`, tone: 'today' };
  if (isTomorrow(d)) return { label: `Tomorrow, ${formatTime(d)}`, tone: 'upcoming' };
  return { label: formatDateTime(d), tone: 'upcoming' };
}

/** `NOT_INTERESTED` -> `Not interested`. Used for enum values with no config row. */
/**
 * Money, in the reader's local convention.
 *
 * `en-IN` groups as 1,25,000 rather than 125,000, which is what an Indian
 * Admin reconciling an invoice expects to see. Falls back to a plain string if
 * the currency code is one `Intl` does not know, because a thrown formatter in
 * a table cell takes the whole page down.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency = 'INR',
): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (value == null || !Number.isFinite(value)) return '—';

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/** Compact form for stat tiles, where ₹12,50,000 is too wide to read. */
export function formatMoneyCompact(
  amount: number | string | null | undefined,
  currency = 'INR',
): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (value == null || !Number.isFinite(value)) return '—';

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return formatMoney(value, currency);
  }
}

export function humanizeEnum(value: string | null | undefined): string {
  if (!value) return '—';
  const lower = value.replace(/_/g, ' ').toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Initials for the avatar fallback. */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/** Value for a `datetime-local` input, which expects local time with no zone. */
export function toDateTimeLocalValue(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
