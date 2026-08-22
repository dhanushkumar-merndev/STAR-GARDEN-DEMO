import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { FcGoogle } from 'react-icons/fc';
import { LuClock, LuShieldOff } from 'react-icons/lu';
import { getAccessState, homePathForRole } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/env';
import { signInWithGoogleAction, signOutAction } from '@/server/actions/auth';
import { Alert, Button, Card, CardBody } from '@/components/ui';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * Sign-in (AGENTS.md §11.1).
 *
 * Google only. There is no password field, no "forgot password", and no
 * self-registration — §11.1 treats the reset screen as conditional and it is
 * not enabled here, because there is no password to reset.
 *
 * The page also handles the two states §11.1 asks for beyond a plain login:
 * an account that authenticated but was never allowlisted, and one that an
 * Admin has deactivated.
 */

/**
 * What to tell someone who is signed in but cannot work yet.
 *
 * The distinction the brief asks for is between "waiting" and "refused". A new
 * joiner who signs in before an Admin has approved them should read that their
 * status will be updated — not that they are unauthorised, which sounds like a
 * mistake they made.
 */
const ACCESS_COPY: Record<
  'PENDING' | 'NO_PROFILE' | 'DEACTIVATED',
  { title: string; body: string; hint?: string }
> = {
  PENDING: {
    title: 'Your account is waiting for approval',
    body:
      'You have signed in successfully. An Admin now needs to approve your account and ' +
      'choose your role — your status will be updated shortly.',
    hint: 'You will get an email as soon as it is approved. Sign in again then.',
  },
  NO_PROFILE: {
    title: 'This account is not set up',
    body:
      'You signed in with Google, but no account exists for this address in the ' +
      'Star Gardens CRM.',
    hint: 'Ask an Admin to add this exact address, then sign in again.',
  },
  DEACTIVATED: {
    title: 'Your access has been turned off',
    body: 'An Admin has deactivated this account. Contact them if you think this is a mistake.',
  },
};

const ERROR_COPY: Record<string, string> = {
  cancelled: 'Sign-in was cancelled. Try again when you are ready.',
  oauth: 'Google could not complete the sign-in. Please try again.',
  oauth_start: 'Could not reach Google. Check your connection and try again.',
  missing_code: 'The sign-in link was incomplete. Please try again.',
  exchange_failed: 'That sign-in link has expired. Please try again.',
  not_configured: 'The CRM is not connected to its database yet.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === 'string' ? params.next : '/dashboard';
  const errorKey = typeof params.error === 'string' ? params.error : null;
  const signedOut = params.signed_out === '1';

  if (!isSupabaseConfigured()) {
    return (
      <Shell>
        <Alert tone="warn" title="Setup required">
          Supabase credentials have not been added yet. Set{' '}
          <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
          <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then reload.
          See <span className="font-medium">crm/README.md</span>.
        </Alert>
      </Shell>
    );
  }

  const access = await getAccessState();

  if (access.state === 'ACTIVE') {
    // A customer never lands in the CRM, whatever `next` asked for.
    const home = homePathForRole(access.user.role);
    const target = home === '/portal' || !next.startsWith('/') ? home : next;
    redirect(target);
  }

  /**
   * Three ways to be signed in but not working.
   *
   *   PENDING       provisioned, never approved. Someone new signed in with
   *                 Google and is waiting on an Admin. This is the common case
   *                 and it gets an encouraging message, not a rejection.
   *   NO_PROFILE    no profile row at all — a rare, genuinely broken state.
   *   DEACTIVATED   approved once, then switched off. A different fact, so a
   *                 different sentence.
   */
  if (
    access.state === 'PENDING' ||
    access.state === 'NO_PROFILE' ||
    access.state === 'DEACTIVATED'
  ) {
    const email = access.state === 'NO_PROFILE' ? access.email : access.profile.email;
    const copy = ACCESS_COPY[access.state];

    return (
      <Shell>
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={
                  access.state === 'PENDING'
                    ? 'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[--color-warn-bg]'
                    : 'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-muted'
                }
              >
                {access.state === 'PENDING' ? (
                  <LuClock className="size-5 text-[oklch(45%_0.13_70)]" />
                ) : (
                  <LuShieldOff className="size-5 text-ink-muted" />
                )}
              </span>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-ink">{copy.title}</h1>
                <p className="mt-1.5 text-sm text-ink-muted">{copy.body}</p>
              </div>
            </div>

            {email ? (
              <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm break-all">
                Signed in as <span className="font-medium text-ink">{email}</span>
              </p>
            ) : null}

            {copy.hint ? <p className="text-sm text-ink-muted">{copy.hint}</p> : null}

            <form action={signOutAction}>
              <Button type="submit" variant="outline" fullWidth>
                Sign out
              </Button>
            </form>
          </CardBody>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <CardBody className="space-y-5">
          <div className="text-center">
            <h1 className="text-lg font-semibold text-ink">Sign in to Star Gardens CRM</h1>
            <p className="mt-1 text-sm text-ink-muted">Use your Star Gardens Google account.</p>
          </div>

          {errorKey ? (
            <Alert tone="danger">{ERROR_COPY[errorKey] ?? 'Sign-in failed. Please try again.'}</Alert>
          ) : null}

          {signedOut ? <Alert tone="ok">You have been signed out.</Alert> : null}

          <form action={signInWithGoogleAction}>
            <input type="hidden" name="next" value={next} />
            <Button type="submit" size="lg" fullWidth className="gap-3">
              <FcGoogle className="size-5" aria-hidden="true" />
              Continue with Google
            </Button>
          </form>

          <p className="text-center text-xs text-ink-subtle">
            Access is limited to staff accounts approved by an Admin.
          </p>
        </CardBody>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col justify-center bg-canvas px-4 py-10">
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center justify-center text-center">
          <Image
            src="/images/logo.webp"
            alt="Star Gardens"
            width={266}
            height={48}
            priority
            className="h-12 w-auto object-contain"
            style={{ width: 'auto' }}
          />
        </div>
        {children}
      </div>
    </main>
  );
}
