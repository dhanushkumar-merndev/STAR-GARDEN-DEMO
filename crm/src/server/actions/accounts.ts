'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { actionResult, type ActionResult } from '@/lib/errors';
import { formDataToObject } from '@/lib/validation/common';
import { parseOrThrow, recordAccountSchema } from '@/lib/validation/schemas';
import { recordAccount as recordAccountService } from '@/server/services/accounts';
import { adminJobView, businessContact, listPortalAccess } from '@/server/services/portal';
import { sendCustomerEmail } from '@/lib/email';
import { accountClosedEmail } from '@/lib/email/templates';
import { adminUserIds, notifyMany, NotificationCopy } from '@/lib/notifications';

/**
 * Accounts actions.
 *
 * Admin-only in every direction — `requireAdmin()` here, `canRecordAccount` in
 * the service, and an Admin-only RLS policy behind both (§7.5).
 */

export async function recordAccountAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ accountId: string; closed: boolean }>> {
  return actionResult(async () => {
    const user = await requireAdmin();
    const input = parseOrThrow(recordAccountSchema, formDataToObject(formData));

    const account = await recordAccountService(user, input);
    const closed = Boolean(account.closed_at);

    // Tell the other Admin. Two people work this desk, and a job closed by one
    // of them is news to the other.
    const admins = (await adminUserIds()).filter((id) => id !== user.id);
    await notifyMany(admins, {
      ...(closed
        ? NotificationCopy.accountClosed(await leadCodeFor(user, input.lead_id))
        : NotificationCopy.accountRecorded(
            await leadCodeFor(user, input.lead_id),
            formatMoney(Number(account.total_amount), account.currency),
          )),
      entityType: 'lead',
      entityId: input.lead_id,
    });

    // The customer hears about closure, not about every figure being adjusted.
    if (closed) await emailCustomerOnClosure(user, input.lead_id, account);

    revalidatePath('/accounts');
    revalidatePath(`/leads/${input.lead_id}`);
    revalidatePath('/dashboard');

    return { accountId: account.id, closed };
  });
}

async function leadCodeFor(
  user: Awaited<ReturnType<typeof requireAdmin>>,
  leadId: string,
): Promise<string> {
  const job = await adminJobView(user, leadId);
  return job.lead_code;
}

/**
 * Sends the "your project is complete" note to whichever addresses the customer
 * has been given access with.
 *
 * Silent when nobody has portal access: an Admin who never invited the customer
 * has not asked for them to be emailed, and inferring consent from a lead's
 * enquiry form is exactly the assumption that turns a CRM into a spam source.
 */
async function emailCustomerOnClosure(
  user: Awaited<ReturnType<typeof requireAdmin>>,
  leadId: string,
  account: { total_amount: number; balance_amount: number; currency: string },
): Promise<void> {
  try {
    const grants = (await listPortalAccess(user, leadId)).filter(
      (grant) => grant.revoked_at === null,
    );

    if (grants.length === 0) return;

    const job = await adminJobView(user, leadId);
    const business = await businessContact();

    const rendered = accountClosedEmail({
      customerName: job.customer_name,
      leadCode: job.lead_code,
      totalAmount: formatMoney(Number(account.total_amount), account.currency),
      balanceAmount: formatMoney(Number(account.balance_amount), account.currency),
      business,
    });

    for (const grant of grants) {
      await sendCustomerEmail({
        to: grant.email,
        rendered,
        emailType: 'account.closed',
        leadId,
      });
    }
  } catch (error) {
    // Email is never authoritative: the account has already committed.
    console.error('[accounts] closure email failed', error);
  }
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
