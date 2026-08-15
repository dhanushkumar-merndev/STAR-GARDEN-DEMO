import type { CallOutcome } from '@/types/database';

export const AUTOMATIC_RETRY_OUTCOMES = ['NO_ANSWER', 'BUSY', 'SWITCHED_OFF'] as const;
export const AUTOMATIC_RETRY_DELAY_MS = 30 * 60 * 1000;

export function isAutomaticRetryOutcome(
  outcome: CallOutcome,
): outcome is (typeof AUTOMATIC_RETRY_OUTCOMES)[number] {
  return (AUTOMATIC_RETRY_OUTCOMES as readonly CallOutcome[]).includes(outcome);
}

export function automaticRetryDueAt(now = new Date()): string {
  return new Date(now.getTime() + AUTOMATIC_RETRY_DELAY_MS).toISOString();
}
