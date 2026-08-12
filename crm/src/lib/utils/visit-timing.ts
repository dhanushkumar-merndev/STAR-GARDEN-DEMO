/**
 * When a site visit's journey may begin (AGENTS.md §8.3).
 *
 * The rule is one-sided on purpose: nothing may be recorded *before* the day
 * the visit is booked for, but a late visit stays fully workable. The CRM
 * counts overdue visits on the dashboard and offers an OVERDUE filter, so
 * visits plainly do run late — a symmetric "on the day only" window would
 * leave every one of those permanently un-completable, which is a worse
 * problem than an early tap.
 *
 * Days are IST days. Postgres stores UTC, staff think in local dates, and the
 * two disagree for any visit booked before 05:30 IST.
 */

/** Midnight IST on the calendar day of `when`, as a UTC instant. */
export function istDayStart(when: string | Date): Date {
  // `en-CA` formats as YYYY-MM-DD, which is the one locale that gives a
  // sortable date string. Same approach as the dashboard's range boundaries.
  const istDate = new Date(when).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [year, month, day] = istDate.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!, -5, -30));
}

/**
 * Has the visit's day arrived?
 *
 * True on the scheduled day and every day after it, false only beforehand.
 */
export function hasVisitDayArrived(
  scheduledStartAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!scheduledStartAt) return true; // Nothing to be early for.

  const opensAt = istDayStart(scheduledStartAt);
  if (Number.isNaN(opensAt.getTime())) return true;

  return now.getTime() >= opensAt.getTime();
}
