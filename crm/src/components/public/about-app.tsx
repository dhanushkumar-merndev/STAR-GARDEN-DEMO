import Link from 'next/link';
import Image from 'next/image';
import { FcGoogle } from 'react-icons/fc';
import {
  LuClipboardList,
  LuHardHat,
  LuMapPin,
  LuPencilRuler,
  LuPhone,
  LuUsers,
} from 'react-icons/lu';
import { Button, Card, CardBody } from '@/components/ui';

/**
 * Absolute, not relative.
 *
 * Google's branding review checks that the privacy-policy link on the homepage
 * matches the one configured on the consent screen, and that comparison is
 * against a full URL. A bare `/privacy` href risks failing it on a string
 * mismatch even though it resolves correctly in a browser.
 */
const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
const PRIVACY_URL = `${SITE_URL}/privacy`;


/**
 * Public description of the application, rendered by both `/` (for signed-out
 * visitors) and `/home`.
 *
 * Exists because Google's OAuth branding review requires a homepage that is
 * reachable *without signing in* and that explains what the application does
 * and what it uses a Google account for. The CRM root (`/`) only routes — it
 * sends visitors to `/login` or `/dashboard` — so a reviewer following it saw a
 * bare sign-in form and correctly reported that the homepage explained nothing.
 *
 * Deliberately static: no session lookup, no database read. A reviewer hits it
 * signed out, and it has to render for them exactly as it does for anyone else.
 * `/home` and `/privacy` are listed in `PUBLIC_PATHS` for that reason.
 */

const CAPABILITIES = [
  {
    icon: LuUsers,
    title: 'Enquiries and ownership',
    body: 'New landscaping enquiries are recorded, de-duplicated and assigned to a team member, so every customer has one named owner.',
  },
  {
    icon: LuPhone,
    title: 'Calls and outcomes',
    body: 'Each conversation is logged with its outcome, which is what moves the enquiry to its next stage.',
  },
  {
    icon: LuClipboardList,
    title: 'Follow-ups',
    body: 'Scheduled reminders and a shared calendar, so an enquiry is never left without a planned next step.',
  },
  {
    icon: LuMapPin,
    title: 'Site visits',
    body: 'Visits are booked with a named landscape designer attending, and completed on site from a phone.',
  },
  {
    icon: LuPencilRuler,
    title: 'Landscape design',
    body: 'Design work is assigned, versioned and approved — nothing is overwritten, and one approved drawing carries into the build.',
  },
  {
    icon: LuHardHat,
    title: 'Execution',
    body: 'Approved designs become tracked garden builds with tasks, assignees and progress against a due date.',
  },
];

export function AboutApp() {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-12 sm:py-16">
      <header className="flex flex-col items-center gap-5 text-center">
        <Image
          src="/images/logo.webp"
          alt="Star Gardens"
          width={400}
          height={72}
          className="h-10 w-auto sm:h-12"
          priority
        />
        <div>
          {/* MUST stay visible, and must read exactly the app name configured on
              the OAuth consent screen. Google's branding review compares the two
              and rejected a previous attempt for a mismatch: "The app name 'Star
              Gardens CRM' ... does not match the app name on your homepage." The
              logo is a wordmark reading "Star Gardens" only, so it cannot stand in
              for this. Do not hide it (sr-only) or delete it. */}
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Star Gardens CRM
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-base text-ink-muted">
            The internal tool the Star Gardens team uses to manage landscaping enquiries — from
            the first phone call through the site visit, the garden design and the build itself.
          </p>
        </div>
      </header>

      <Card className="mt-8">
        <CardBody>
          <h2 className="text-sm font-semibold text-ink">Who this is for</h2>
          <p className="mt-2 text-sm text-ink-muted">
            This application is for Star Gardens staff only. It is not a public service and it has
            no self-registration — an administrator adds a staff member&apos;s work address before
            they can sign in. Anyone signing in with an address that has not been added is shown a
            &ldquo;no access&rdquo; message and can see nothing else.
          </p>
        </CardBody>
      </Card>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-ink">What it does</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {CAPABILITIES.map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardBody>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 rounded-md bg-brand-50 p-2 text-brand-700">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-ink">{title}</h3>
                    <p className="mt-1 text-sm text-ink-muted">{body}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <Card className="mt-8">
        <CardBody>
          <div className="flex items-start gap-3">
            <FcGoogle className="mt-0.5 size-5 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-ink">Why we ask to sign in with Google</h2>
              <p className="mt-2 text-sm text-ink-muted">
                Signing in with Google is the only way into this application — there is no password
                to create, forget or leak. We request the two basic sign-in scopes and nothing
                else:
              </p>
              <ul className="mt-3 space-y-2 text-sm text-ink-muted">
                <li>
                  <span className="font-medium text-ink">Email address</span> — to match you to the
                  staff account an administrator has already created, and to send you work
                  notifications.
                </li>
                <li>
                  <span className="font-medium text-ink">Basic profile</span> — your name and
                  picture, so colleagues can see who owns an enquiry or attended a visit.
                </li>
              </ul>
              <p className="mt-3 text-sm text-ink-muted">
                We do not request access to Gmail, Drive, Calendar, Contacts or any other Google
                service, and we never post anything to your Google account. Full detail is in the{' '}
                <a href={PRIVACY_URL} className="font-medium text-brand-700 hover:underline">
                  privacy policy
                </a>
                .
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href="/login">
          <Button className="gap-2">
            <FcGoogle className="size-4" />
            Staff sign in
          </Button>
        </Link>
        <a href={PRIVACY_URL}>
          <Button variant="outline">Privacy policy</Button>
        </a>
      </div>

      <footer className="mt-12 border-t border-line pt-6 text-xs text-ink-subtle">
        <p>Star Gardens CRM — an internal application for Star Gardens staff.</p>
      </footer>
    </main>
  );
}
