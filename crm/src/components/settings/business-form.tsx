'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { LuMessageCircle } from 'react-icons/lu';
import { Alert, Checkbox, Field, Input, Textarea } from '@/components/ui';
import { FormError, SubmitButton, fieldError } from '@/components/forms/form-parts';
import {
  updateBusinessSettingsAction,
  updateNormalizationSettingsAction,
} from '@/server/actions/admin';
import { renderWhatsappMessage } from '@/lib/utils/whatsapp';
import type { ActionResult } from '@/lib/errors';
import type { BusinessSettings, LeadNormalizationSettings } from '@/lib/settings';

/**
 * Company contact details.
 *
 * Saved as one unit rather than field by field: these values are read together
 * — the WhatsApp button needs the number *and* the template, the email footer
 * needs the name *and* the phone — so a half-saved set is a set that reaches a
 * customer looking wrong.
 */
export function BusinessSettingsForm({ settings }: { settings: BusinessSettings }) {
  const router = useRouter();
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);

  // Held in state so the preview below updates as the Admin types. The message
  // is what a customer receives, and it deserves to be visible before saving.
  const [name, setName] = React.useState(settings.name);
  const [template, setTemplate] = React.useState(settings.whatsappTemplate);

  async function onSubmit(formData: FormData) {
    const next = await updateBusinessSettingsAction(null, formData);
    setResult(next);
    if (next.ok) {
      toast.success('Business details saved.');
      router.refresh();
    }
  }

  const preview = renderWhatsappMessage(template, {
    customerName: 'Ravi Kumar',
    businessName: name,
    leadCode: 'SG-2026-27-001',
  });

  return (
    <form action={onSubmit} className="space-y-4">
      <FormError result={result} />

      <Field
        label="Business name"
        htmlFor="business_name"
        required
        error={fieldError(result, 'business_name')}
        hint="Appears in customer emails and on the customer portal."
      >
        <Input
          id="business_name"
          name="business_name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field
        label="WhatsApp business number"
        htmlFor="business_whatsapp_number"
        error={fieldError(result, 'business_whatsapp_number')}
        hint="With the country code, e.g. +919876543210. Leave blank to hide every WhatsApp button."
      >
        <Input
          id="business_whatsapp_number"
          name="business_whatsapp_number"
          inputMode="tel"
          autoComplete="off"
          placeholder="+919876543210"
          defaultValue={
            settings.whatsappNumber ? `+${settings.whatsappNumber}` : ''
          }
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Phone shown to customers"
          htmlFor="business_phone"
          error={fieldError(result, 'business_phone')}
        >
          <Input
            id="business_phone"
            name="business_phone"
            inputMode="tel"
            defaultValue={settings.phone ?? ''}
            placeholder="080 1234 5678"
          />
        </Field>

        <Field
          label="Reply-to email"
          htmlFor="business_email"
          error={fieldError(result, 'business_email')}
          hint="Where a customer's reply goes."
        >
          <Input
            id="business_email"
            name="business_email"
            type="email"
            defaultValue={settings.email ?? ''}
            placeholder="hello@stargardens.in"
          />
        </Field>
      </div>

      <Field
        label="Prefilled WhatsApp message"
        htmlFor="whatsapp_default_message"
        error={fieldError(result, 'whatsapp_default_message')}
        hint="Placeholders: {{customer_name}}, {{business_name}}, {{lead_code}}."
      >
        <Textarea
          id="whatsapp_default_message"
          name="whatsapp_default_message"
          rows={2}
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
        />
      </Field>

      <div className="rounded-lg border border-line bg-surface-muted p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-ink-subtle uppercase">
          <LuMessageCircle className="size-3.5" />
          Preview
        </p>
        <p className="mt-1.5 text-sm text-ink">{preview}</p>
      </div>

      <div className="space-y-1 border-t border-line pt-4">
        <Checkbox
          name="client_portal_enabled"
          label="Customer portal"
          hint="Lets an Admin invite a customer to follow their own project. Turning this off hides the invite action; it does not revoke anyone who already has access."
          defaultChecked={settings.clientPortalEnabled}
        />

        <Checkbox
          name="bdm_role_enabled"
          label="Separate Business Development Manager role"
          hint="Off means the Admins do the calling themselves and leads are assigned to Admins. Turn this on when you hire a dedicated BDM — nothing already recorded changes."
          defaultChecked={settings.bdmRoleEnabled}
        />
      </div>

      <div className="flex justify-end">
        <SubmitButton>Save business details</SubmitButton>
      </div>
    </form>
  );
}

/**
 * The one-time lead-cleaning setup.
 *
 * Applies to Meta, the website form and manual entry alike — which is the
 * point, and why the copy says so. An Admin who turns off phone stripping needs
 * to understand it will stop `+91 98765 43210` matching `9876543210` in
 * duplicate detection.
 */
export function NormalizationForm({ settings }: { settings: LeadNormalizationSettings }) {
  const router = useRouter();
  const [result, setResult] = React.useState<ActionResult<unknown> | null>(null);

  async function onSubmit(formData: FormData) {
    const next = await updateNormalizationSettingsAction(null, formData);
    setResult(next);
    if (next.ok) {
      toast.success('Cleaning rules saved.');
      router.refresh();
    }
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <FormError result={result} />

      <Alert tone="info">
        These rules run on every lead, however it arrives — Meta ads, the website
        form, or typed in by hand. Set them once.
      </Alert>

      <div className="space-y-1">
        <Checkbox
          name="trimWhitespace"
          label="Trim leading and trailing spaces"
          defaultChecked={settings.trimWhitespace}
        />
        <Checkbox
          name="collapseSpaces"
          label="Collapse repeated spaces and line breaks"
          hint='"Ravi   Kumar" becomes "Ravi Kumar".'
          defaultChecked={settings.collapseSpaces}
        />
        <Checkbox
          name="titleCaseNames"
          label="Fix names typed in one case"
          hint='"RAVI KUMAR" becomes "Ravi Kumar". Names with deliberate capitals like "McDonald" are left alone.'
          defaultChecked={settings.titleCaseNames}
        />
        <Checkbox
          name="lowercaseEmail"
          label="Lowercase email addresses"
          defaultChecked={settings.lowercaseEmail}
        />
        <Checkbox
          name="stripPhoneFormatting"
          label="Strip brackets and dashes from phone numbers"
          hint="Keep this on — duplicate detection compares digits, so a formatted number would never match one typed plainly."
          defaultChecked={settings.stripPhoneFormatting}
        />
        <Checkbox
          name="dropPlaceholderEmails"
          label="Discard placeholder email addresses"
          hint="Drops noreply@…, test@test.com and the placeholders Meta returns for a skipped field."
          defaultChecked={settings.dropPlaceholderEmails}
        />
      </div>

      <div className="flex justify-end">
        <SubmitButton>Save cleaning rules</SubmitButton>
      </div>
    </form>
  );
}
