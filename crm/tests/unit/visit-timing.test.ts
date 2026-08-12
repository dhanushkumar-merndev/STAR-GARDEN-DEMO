import { describe, expect, it } from 'vitest';
import { hasVisitDayArrived, istDayStart } from '@/lib/utils/visit-timing';

/** A visit booked for 10:45 am IST on 21 Aug 2026 → 05:15 UTC. */
const VISIT = '2026-08-21T05:15:00.000Z';

describe('istDayStart', () => {
  it('resolves to midnight IST, which is 18:30 UTC the day before', () => {
    expect(istDayStart(VISIT).toISOString()).toBe('2026-08-20T18:30:00.000Z');
  });

  it('uses the IST calendar day, not the UTC one', () => {
    // 00:30 IST on 21 Aug is still 20 Aug in UTC. Reading the UTC date here
    // would open the visit a full day early.
    const earlyMorning = '2026-08-20T19:00:00.000Z';
    expect(istDayStart(earlyMorning).toISOString()).toBe('2026-08-20T18:30:00.000Z');
  });
});

describe('hasVisitDayArrived', () => {
  it('is false the day before', () => {
    expect(hasVisitDayArrived(VISIT, new Date('2026-08-20T12:00:00.000Z'))).toBe(false);
  });

  it('is false one minute before midnight IST', () => {
    expect(hasVisitDayArrived(VISIT, new Date('2026-08-20T18:29:00.000Z'))).toBe(false);
  });

  it('is true from midnight IST, hours before the booked time', () => {
    expect(hasVisitDayArrived(VISIT, new Date('2026-08-20T18:30:00.000Z'))).toBe(true);
  });

  it('is true on the day', () => {
    expect(hasVisitDayArrived(VISIT, new Date('2026-08-21T04:00:00.000Z'))).toBe(true);
  });

  it('stays true afterwards, so an overdue visit is still completable', () => {
    expect(hasVisitDayArrived(VISIT, new Date('2026-09-15T04:00:00.000Z'))).toBe(true);
  });

  it('does not block when there is no scheduled time', () => {
    expect(hasVisitDayArrived(null)).toBe(true);
    expect(hasVisitDayArrived(undefined)).toBe(true);
  });

  it('does not block on an unparseable date', () => {
    expect(hasVisitDayArrived('not a date')).toBe(true);
  });
});
