'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { markNotificationReadAction } from '@/server/actions/notifications';

function useMarkRead() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const mark = (formData: FormData, successMessage: string) => {
    startTransition(async () => {
      const result = await markNotificationReadAction(null, formData);
      if (result.ok) {
        toast.success(successMessage);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return { pending, mark };
}

export function MarkReadButton({ notificationId }: { notificationId: string }) {
  const { pending, mark } = useMarkRead();

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label="Mark as read"
      onClick={(event) => {
        // The row is wrapped in a link; marking read should not navigate.
        event.preventDefault();
        event.stopPropagation();

        const formData = new FormData();
        formData.set('notification_id', notificationId);
        mark(formData, 'Marked as read.');
      }}
    >
      <Check className="size-4" />
    </Button>
  );
}

export function MarkAllReadButton() {
  const { pending, mark } = useMarkRead();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        const formData = new FormData();
        formData.set('all', 'true');
        mark(formData, 'All notifications marked as read.');
      }}
    >
      {pending ? 'Marking…' : 'Mark all read'}
    </Button>
  );
}
