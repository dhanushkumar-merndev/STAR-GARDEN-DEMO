import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'How Star Gardens CRM handles staff Google account data and customer enquiry records.',
};

/**
 * Public privacy policy.
 *
 * Required by Google's OAuth branding review, and linked from `/home`. Like
 * that page it must render for a signed-out reviewer, so it is static and
 * listed in `PUBLIC_PATHS`.
 *
 * The dates and the contact address are the two things to keep current if the
 * policy is ever revised.
 */

const LAST_UPDATED = '21 August 2026';
const CONTACT_EMAIL = 'stargrowthhub@gmail.com';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-2 text-sm text-ink-muted">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Privacy policy</h1>
      <p className="mt-2 text-sm text-ink-subtle">Last updated {LAST_UPDATED}</p>

      <Card className="mt-6">
        <CardBody>
          <p className="text-sm text-ink-muted">
            Star Gardens CRM is an internal business application used by Star Gardens staff to
            manage landscaping enquiries. It is not a public service, it has no self-registration,
            and it is not open to consumer sign-ups. This policy explains what it stores and why.
          </p>
        </CardBody>
      </Card>

      <Section title="Google account data we access">
        <p>
          Staff sign in with Google. We request only the two standard sign-in scopes,{' '}
          <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">email</code> and{' '}
          <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">profile</code>, and we use
          them for these purposes only:
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <span className="font-medium text-ink">Email address</span> — to match the person
            signing in to the staff account an administrator created in advance, and to send them
            notifications about their own work.
          </li>
          <li>
            <span className="font-medium text-ink">Name and profile picture</span> — shown to
            colleagues inside the application so it is clear who owns an enquiry, attended a site
            visit or approved a design.
          </li>
        </ul>
        <p>
          We do not request access to Gmail, Google Drive, Google Calendar, Google Contacts or any
          other Google service. We never send email from a staff member&apos;s Google account, and
          we never write anything back to their Google account.
        </p>
        <p>
          Star Gardens CRM&apos;s use of information received from Google APIs adheres to the{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="font-medium text-brand-700 hover:underline"
            target="_blank"
            rel="noreferrer noopener"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. We do not sell this data, use it for
          advertising, or transfer it to third parties except as described below.
        </p>
      </Section>

      <Section title="Business data we store">
        <p>
          The application stores the records a landscaping business needs to run: customer
          enquiries and their contact details, notes on calls, scheduled follow-ups, site visit
          details, design drawings, garden build progress and account balances. These records are
          entered by staff in the course of their work; they are not collected from visitors to
          this website.
        </p>
      </Section>

      <Section title="Who can see what">
        <p>
          Access is enforced by the database itself, not only by the interface. A staff member sees
          the enquiries assigned to them, plus the design or build work they are part of.
          Administrators see everything. When an administrator deactivates an account, access stops
          immediately.
        </p>
      </Section>

      <Section title="Where data is held">
        <p>
          Application data is stored in Supabase (PostgreSQL). Uploaded files — design drawings and
          site photographs — are stored in a private Tigris bucket and are reachable only through
          short-lived signed links. The application is hosted on Vercel. Transactional email is
          sent through Brevo. Each of these providers processes data on our behalf as a
          sub-processor.
        </p>
      </Section>

      <Section title="Retention">
        <p>
          Business records are retained for as long as they are needed to run the business and to
          meet legal and accounting obligations. A staff member&apos;s Google profile data is
          retained for as long as their account is active; when an account is removed, the profile
          data associated with it is deleted, while the business records they created remain, as
          those belong to the business.
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          Staff can revoke this application&apos;s access to their Google account at any time from{' '}
          <a
            href="https://myaccount.google.com/permissions"
            className="font-medium text-brand-700 hover:underline"
            target="_blank"
            rel="noreferrer noopener"
          >
            their Google account permissions page
          </a>
          . Doing so ends the ability to sign in.
        </p>
        <p>
          To request access to, correction of, or deletion of personal data held in this
          application, contact us at the address below.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy or about data held in Star Gardens CRM can be sent to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-brand-700 hover:underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <footer className="mt-10 border-t border-line pt-6 text-xs text-ink-subtle">
        <Link href="/home" className="font-medium text-brand-700 hover:underline">
          ← About Star Gardens CRM
        </Link>
      </footer>
    </main>
  );
}
