/**
 * WhatsApp deep links.
 *
 * The CRM never sends a WhatsApp message itself — it opens the staff member's
 * own WhatsApp with the customer's number and a prefilled first line. Same
 * reasoning as `tel:` links in §6.3: we record that the app was opened, never
 * that a conversation happened.
 *
 * `wa.me` wants digits only, country code included and no `+`.
 */

export interface WhatsappTemplateContext {
  customerName?: string | null;
  businessName?: string | null;
  leadCode?: string | null;
}

/** Fills `{{customer_name}}`, `{{business_name}}` and `{{lead_code}}`. */
export function renderWhatsappMessage(
  template: string,
  context: WhatsappTemplateContext,
): string {
  const values: Record<string, string> = {
    customer_name: context.customerName?.trim() || 'there',
    business_name: context.businessName?.trim() || 'Star Gardens',
    lead_code: context.leadCode?.trim() || '',
  };

  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => values[key] ?? match)
    // A blank lead code leaves a double space and a dangling reference.
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Builds the link that opens a chat with one customer.
 *
 * Returns null when the number cannot make a valid link, so callers render
 * nothing rather than a button that opens WhatsApp on an error page.
 */
export function whatsappChatUrl(input: {
  countryCode: string | null | undefined;
  nationalNumber: string | null | undefined;
  message?: string | null;
}): string | null {
  const country = (input.countryCode ?? '').replace(/\D/g, '');
  const national = (input.nationalNumber ?? '').replace(/\D/g, '');

  if (national.length < 6) return null;

  const full = `${country}${national}`;
  if (full.length < 8 || full.length > 15) return null;

  const url = new URL(`https://wa.me/${full}`);
  if (input.message?.trim()) url.searchParams.set('text', input.message.trim());

  return url.toString();
}

/**
 * The link a *customer* uses to reach the business.
 *
 * This is the one the portal and the website share: it points at the company's
 * published number, not at any individual's phone.
 */
export function businessWhatsappUrl(
  businessNumberDigits: string | null,
  message?: string | null,
): string | null {
  if (!businessNumberDigits) return null;
  const digits = businessNumberDigits.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;

  const url = new URL(`https://wa.me/${digits}`);
  if (message?.trim()) url.searchParams.set('text', message.trim());

  return url.toString();
}
