import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getAccessState } from '@/lib/auth/session';
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

  if (access.state === 'ACTIVE') redirect(next.startsWith('/') ? next : '/dashboard');

  // Authenticated with Google, but not on the allowlist (migration 06).
  if (access.state === 'NO_PROFILE' || access.state === 'DEACTIVATED') {
    const isDeactivated = access.state === 'DEACTIVATED';
    const email = access.state === 'NO_PROFILE' ? access.email : access.profile.email;

    return (
      <Shell>
        <Card>
          <CardBody className="space-y-4">
            <div>
              <h1 className="text-lg font-semibold text-ink">
                {isDeactivated ? 'Your access has been turned off' : 'This account is not authorised'}
              </h1>
              <p className="mt-2 text-sm text-ink-muted">
                {isDeactivated
                  ? 'An Admin has deactivated this account. Contact them if you think this is a mistake.'
                  : 'You signed in successfully, but this Google account has not been given access to the Star Garden CRM.'}
              </p>
            </div>

            {email ? (
              <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm">
                Signed in as <span className="font-medium text-ink">{email}</span>
              </p>
            ) : null}

            {!isDeactivated ? (
              <p className="text-sm text-ink-muted">
                Ask an Admin to add this exact address to the staff list, then sign in again.
              </p>
            ) : null}

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
            <h1 className="text-lg font-semibold text-ink">Sign in to Star Garden CRM</h1>
            <p className="mt-1 text-sm text-ink-muted">Use your Star Garden Google account.</p>
          </div>

          {errorKey ? (
            <Alert tone="danger">{ERROR_COPY[errorKey] ?? 'Sign-in failed. Please try again.'}</Alert>
          ) : null}

          {signedOut ? <Alert tone="ok">You have been signed out.</Alert> : null}

          <form action={signInWithGoogleAction}>
            <input type="hidden" name="next" value={next} />
            <Button type="submit" size="lg" fullWidth className="gap-3">
              <GoogleMark />
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
            alt="Star Garden"
            width={240}
            height={55}
            priority
            className="h-12 w-auto object-contain"
          />
        </div>
        {children}
      </div>
    </main>
  );
}

/** Google's mark, inline so the strict CSP does not need an external host. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"
        transform="scale(0.5)"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
        transform="scale(0.5)"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
        transform="scale(0.5)"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C36.9 39.7 44 34.5 44 24c0-1.3-.1-2.6-.4-3.9z"
        transform="scale(0.5)"
      />
    </svg>
  );
}
