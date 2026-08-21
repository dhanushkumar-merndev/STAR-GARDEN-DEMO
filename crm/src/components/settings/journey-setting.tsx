'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { LuInfo } from 'react-icons/lu';
import { Button, Checkbox } from '@/components/ui';
import { applyJourneySettingToOpenVisitsAction, updateSettingAction } from '@/server/actions/admin';

/**
 * Journey tracking, with the honest explanation of what flipping it does.
 *
 * The switch is a *default for the next booking*, not a global re-shaping of
 * every visit in the system. That distinction is the whole design: a designer
 * halfway through a visit must not have the remaining steps disappear from
 * under them, and a completed visit's history must keep meaning what it meant
 * when it was recorded.
 *
 * The second control is the escape hatch for the case the rule gets wrong —
 * "we've decided, apply it to what's already booked" — and it still refuses to
 * touch a visit whose journey has started.
 */
export function JourneyTrackingSetting({
  enabled,
  convertibleVisits,
}: {
  enabled: boolean;
  /** Open visits that could still be switched: booked, nothing recorded yet. */
  convertibleVisits: number;
}) {
  const router = useRouter();
  const [checked, setChecked] = React.useState(enabled);
  const [pending, setPending] = React.useState(false);
  const [applying, setApplying] = React.useState(false);

  async function save(next: boolean) {
    setChecked(next);
    setPending(true);

    const formData = new FormData();
    formData.set('key', 'site_visit_journey_enabled');
    formData.set('value', next ? 'true' : 'false');

    try {
      const result = await updateSettingAction(null, formData);
      if (result.ok) {
        toast.success(next ? 'Journey tracking on for new visits.' : 'Journey tracking off for new visits.');
        router.refresh();
      } else {
        setChecked(!next);
        toast.error(result.message);
      }
    } catch {
      setChecked(!next);
      toast.error('Could not save the setting.');
    } finally {
      setPending(false);
    }
  }

  async function applyToOpenVisits() {
    setApplying(true);
    try {
      const result = await applyJourneySettingToOpenVisitsAction();
      if (result.ok) {
        const { updated, skipped } = result.data;
        toast.success(
          `${updated} open visit${updated === 1 ? '' : 's'} updated.` +
            (skipped > 0 ? ` ${skipped} left alone — already under way.` : ''),
        );
        router.refresh();
      } else toast.error(result.message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-4">
      <Checkbox
        name="site_visit_journey_enabled"
        label="Track the journey to site"
        hint="On: the designer taps Start journey, Reached site, then Check out before the visit can be completed. Off: one button closes the visit, and photos are added on the visit page."
        checked={checked}
        disabled={pending}
        onChange={(event) => void save(event.target.checked)}
      />

      <div className="flex gap-2.5 rounded-lg bg-surface-muted p-3 text-xs text-ink-muted">
        <LuInfo className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
        <div className="space-y-1">
          <p className="font-medium text-ink">This applies to visits booked from now on.</p>
          <p>
            Every visit already booked keeps the mode it was created with, and nothing already
            recorded changes — journeys, check-ins and completed visits stay exactly as they are.
          </p>
        </div>
      </div>

      <div className="space-y-2 border-t border-line pt-4">
        <p className="text-sm font-medium text-ink">Apply to visits already booked</p>
        <p className="text-xs text-ink-muted">
          Switches the{' '}
          <strong className="text-ink">
            {convertibleVisits} open visit{convertibleVisits === 1 ? '' : 's'}
          </strong>{' '}
          that have not started yet to {checked ? 'journey tracking' : 'one-step completion'}. A
          visit whose journey is already under way is never touched.
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={applying || pending || convertibleVisits === 0}
          onClick={() => void applyToOpenVisits()}
        >
          {applying
            ? 'Applying…'
            : convertibleVisits === 0
              ? 'Nothing to apply'
              : `Apply to ${convertibleVisits} open visit${convertibleVisits === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  );
}
