import { describe, expect, it } from 'vitest';
import { automaticRetryDueAt, isAutomaticRetryOutcome } from '@/lib/call-reminders';

describe('automatic call retry reminders', () => {
  it.each(['NO_ANSWER', 'BUSY', 'SWITCHED_OFF'] as const)('retries %s automatically', (outcome) => {
    expect(isAutomaticRetryOutcome(outcome)).toBe(true);
  });

  it.each(['CONNECTED', 'INVALID_NUMBER', 'CALL_LATER', 'INTERESTED', 'NOT_INTERESTED'] as const)(
    'does not auto-retry %s',
    (outcome) => expect(isAutomaticRetryOutcome(outcome)).toBe(false),
  );

  it('sets the callback exactly 30 minutes after the outcome', () => {
    expect(automaticRetryDueAt(new Date('2026-08-15T10:00:00.000Z'))).toBe(
      '2026-08-15T10:30:00.000Z',
    );
  });
});
