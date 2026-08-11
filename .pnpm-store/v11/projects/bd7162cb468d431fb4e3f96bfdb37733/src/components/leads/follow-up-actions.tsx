'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LuCheck } from 'react-icons/lu';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { completeFollowUpAction } from '@/server/actions/workflow';

/** One-tap completion, sized for a thumb on a phone (§16). */
export function CompleteFollowUpButton({ followUpId }: { followUpId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function complete() {
    const formData = new FormData();
    formData.set('follow_up_id', followUpId);

    startTransition(async () => {
      const result = await completeFollowUpAction(null, formData);
      if (result.ok) {
        toast.success('Follow-up completed.');
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Button size="sm" variant="secondary" onClick={complete} disabled={pending} className="gap-1.5">
      <LuCheck className="size-4" />
      {pending ? 'Saving…' : 'Done'}
    </Button>
  );
}
