'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { LuMail, LuSend, LuUserPlus, LuX } from 'react-icons/lu';
import { Alert, Badge, Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  grantPortalAccessAction,
  revokePortalAccessAction,
  sendStatusUpdateAction,
} from '@/server/actions/portal';
import { formatRelative } from '@/lib/utils/format';
import type { LeadPortalAccessRow } from '@/types/database';

/**
 * Customer access to their own job.
 *
 * Two distinct things, deliberately kept apart:
 *
 *   **Granting access** creates the login. The address becomes able to sign in
 *   with Google and see a read-only view of this one job — so it is an
 *   access-control decision, not a mailing preference.
 *
 *   **Sending an update** emails the current status to an address that already
 *   has access. Nothing fires automatically on an internal status change: the
 *   Admin decides what the customer is told and when.
 *
 * The alternative address exists because customers routinely give a work email
 * on the enquiry form and want updates at home. It grants exactly the same
 * read-only view and nothing more.
 */

export interface PortalAccessPanelProps {
  leadId: string;
  customerName: string;
  /** The address on the lead itself, offered as the primary grant. */
  leadEmail: string | null;
  grants: LeadPortalAccessRow[];
  /** False hides the invite action, per the Settings switch. */
  portalEnabled: boolean;
}

export function PortalAccessPanel({
  leadId,
  customerName,
  leadEmail,
  grants,
  portalEnabled,
}: PortalAccessPanelProps) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [updateOpen, setUpdateOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const live = grants.filter((grant) => grant.revoked_at === null);
  const hasPrimary = live.some((grant) => grant.is_primary);

  function run(
    action: (prev: unknown, formData: FormData) => Promise<{
      ok: boolean;
      message?: string;
      fields?: Record<string, string>;
    }>,
    formData: FormData,
    success: string,
    onDone?: () => void,
  ) {
    setFieldErrors({});

    startTransition(async () => {
      const result = await action(null, formData);

      if (!result.ok) {
        setFieldErrors(result.fields ?? {});
        toast.error(result.message ?? 'That did not work.');
        return;
      }

      toast.success(success);
      onDone?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {live.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {customerName} cannot see their project yet. Give an address access and they can sign
          in with Google to follow it.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {live.map((grant) => (
            <li key={grant.id} className="flex items-center gap-3 px-3 py-2.5">
              <LuMail className="size-4 shrink-0 text-ink-subtle" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{grant.email}</p>
                <p className="text-xs text-ink-muted">
                  {grant.last_viewed_at
                    ? `Last viewed ${formatRelative(grant.last_viewed_at)}`
                    : grant.invited_at
                      ? `Invited ${formatRelative(grant.invited_at)} · not opened yet`
                      : 'Not invited yet'}
                </p>
              </div>

              {grant.is_primary ? <Badge tone="brand">Primary</Badge> : null}

              <button
                type="button"
                aria-label={`Revoke access for ${grant.email}`}
                disabled={pending}
                onClick={() => {
                  const formData = new FormData();
                  formData.set('access_id', grant.id);
                  formData.set('lead_id', leadId);
                  run(revokePortalAccessAction, formData, 'Access revoked.');
                }}
                className="tap flex shrink-0 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-muted hover:text-danger"
              >
                <LuX className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {portalEnabled ? (
          <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
            <LuUserPlus className="size-4" />
            {live.length === 0 ? 'Give customer access' : 'Add another address'}
          </Button>
        ) : null}

        {live.length > 0 ? (
          <Button size="sm" variant="secondary" onClick={() => setUpdateOpen(true)}>
            <LuSend className="size-4" />
            Email status update
          </Button>
        ) : null}
      </div>

      {!portalEnabled ? (
        <p className="text-xs text-ink-muted">
          The customer portal is switched off in Settings. Existing access still works.
        </p>
      ) : null}

      {/* --- Grant access --- */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent
          title="Give the customer access"
          description={`${customerName} will sign in with Google using this exact address.`}
        >
          <form
            action={(formData) =>
              run(grantPortalAccessAction, formData, 'Access granted and invite sent.', () =>
                setInviteOpen(false),
              )
            }
            className="space-y-4"
          >
            <input type="hidden" name="lead_id" value={leadId} />

            <Field
              label="Email address"
              htmlFor="portal_email"
              required
              error={fieldErrors.email}
              hint={
                leadEmail
                  ? 'This is the address from the enquiry. Change it if the customer asked you to.'
                  : 'Use the address the customer gave you on the call.'
              }
            >
              <Input
                id="portal_email"
                name="email"
                type="email"
                autoComplete="off"
                defaultValue={hasPrimary ? '' : (leadEmail ?? '')}
                placeholder="customer@example.com"
              />
            </Field>

            <Checkbox
              name="is_primary"
              label="This is their main address"
              hint="The one from the enquiry. There can only be one per project."
              defaultChecked={!hasPrimary}
            />

            <Checkbox
              name="send_invite"
              label="Email them the link now"
              hint="A short message telling them they can follow the project online."
              defaultChecked
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Give access'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* --- Send status update --- */}
      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
        <DialogContent
          title="Email a status update"
          description="Sends where the project has reached, as a progress list."
        >
          <form
            action={(formData) =>
              run(sendStatusUpdateAction, formData, 'Status update sent.', () =>
                setUpdateOpen(false),
              )
            }
            className="space-y-4"
          >
            <input type="hidden" name="lead_id" value={leadId} />

            <Field
              label="Send to"
              htmlFor="recipient_email"
              required
              error={fieldErrors.recipient_email}
            >
              <Select
                id="recipient_email"
                name="recipient_email"
                defaultValue={live.find((g) => g.is_primary)?.email ?? live[0]?.email ?? ''}
                className="h-11 w-full rounded-lg border border-line bg-surface px-3 pr-8 text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              >
                {live.map((grant) => (
                  <option key={grant.id} value={grant.email}>
                    {grant.email}
                    {grant.is_primary ? ' (main)' : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Add a personal note"
              htmlFor="status_message"
              error={fieldErrors.message}
              hint="Optional. Appears above the company details."
            >
              <Textarea
                id="status_message"
                name="message"
                rows={3}
                placeholder="Your planting is scheduled for next week — we will call the day before."
              />
            </Field>

            <Alert tone="info">
              The email shows the five stages of their project and where it has reached. It
              never includes internal notes, call outcomes or staff names.
            </Alert>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setUpdateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Sending…' : 'Send update'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
