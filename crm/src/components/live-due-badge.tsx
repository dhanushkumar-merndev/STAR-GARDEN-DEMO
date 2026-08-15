'use client';

import * as React from 'react';
import { Badge, type Tone } from '@/components/ui';
import { formatDateTime, formatDue } from '@/lib/utils/format';

const TONES = {
  overdue: 'danger',
  today: 'warn',
  upcoming: 'neutral',
  none: 'neutral',
} as const satisfies Record<ReturnType<typeof formatDue>['tone'], Tone>;

export function LiveDueBadge({
  value,
  initialDue,
}: {
  value: string | Date | null | undefined;
  initialDue: ReturnType<typeof formatDue>;
}) {
  const timestamp = value instanceof Date ? value.toISOString() : value;
  const [due, setDue] = React.useState(initialDue);

  React.useEffect(() => {
    const update = () => setDue(formatDue(timestamp));
    update();

    // Seconds matter around a newly overdue callback; after an hour, a
    // minute-level refresh is visually identical and avoids needless work.
    const target = timestamp ? new Date(timestamp).getTime() : Number.NaN;
    const intervalMs = Number.isFinite(target) && Math.abs(Date.now() - target) < 3_600_000
      ? 1_000
      : 60_000;
    const timer = window.setInterval(update, intervalMs);
    return () => window.clearInterval(timer);
  }, [timestamp]);

  return (
    <span title={timestamp ? `Exact time: ${formatDateTime(timestamp)}` : undefined}>
      <Badge tone={TONES[due.tone]}>{due.label}</Badge>
    </span>
  );
}
