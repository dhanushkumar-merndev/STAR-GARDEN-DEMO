import type { Metadata } from 'next';
import Image from 'next/image';
import { LuCheck, LuMessageCircle, LuPhone, LuSprout } from 'react-icons/lu';
import { requirePortalUser } from '@/lib/auth/session';
import { getBusinessSettings } from '@/lib/settings';
import { businessWhatsappUrl } from '@/lib/utils/whatsapp';
import { getMyJobs, markPortalSeen, pipelineFor } from '@/server/services/portal';
import { signOutAction } from '@/server/actions/auth';
import { Badge, Button, Card, CardBody, EmptyState } from '@/components/ui';
import { formatMoney } from '@/lib/utils/format';
import type { PipelineStep } from '@/lib/email/templates';

export const metadata: Metadata = { title: 'My project' };

/**
 * The customer's own page.
 *
 * Read-only, deliberately and completely: there is no form, no action and no
 * link into the CRM. The data comes from `client_portal_jobs()`, a curated
 * projection, so this page could not show an internal note even if it tried.
 *
 * It lives outside the `(dashboard)` group because it shares none of the staff
 * shell — no sidebar, no notification bell, no module switcher. A customer
 * needs one screen, not an application.
 */
export default async function PortalPage() {
  const user = await requirePortalUser();
  const [jobs, business] = await Promise.all([getMyJobs(), getBusinessSettings()]);

  // Best-effort bookkeeping so an Admin can see the customer has looked.
  if (user.role === 'CLIENT') await markPortalSeen();

  const whatsapp = businessWhatsappUrl(
    business.whatsappNumber,
    `Hello ${business.name}, I have a question about my project.`,
  );

  return (
    <main className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Image
            src="/images/logo.webp"
            alt={business.name}
            width={178}
            height={32}
            priority
            className="h-8 w-auto object-contain"
          />
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            {jobs.length === 1 ? 'Your project' : 'Your projects'}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Signed in as <span className="font-medium text-ink">{user.email}</span>
          </p>
        </div>

        {jobs.length === 0 ? (
          <Card>
            <EmptyState
              icon={<LuSprout className="size-8" />}
              title="Nothing to show yet"
              description={
                user.role === 'CLIENT'
                  ? 'Your project will appear here as soon as our team sets it up. We will email you when it does.'
                  : 'This page shows a customer’s own project. Staff accounts see their work in the CRM instead.'
              }
            />
          </Card>
        ) : (
          jobs.map((job) => (
            <Card key={job.lead_id}>
              <CardBody className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{job.customer_name}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Reference {job.lead_code}
                      {job.location ? ` · ${job.location}` : ''}
                    </p>
                  </div>
                  <Badge tone={job.account?.closed_at ? 'ok' : 'brand'}>
                    {job.account?.closed_at ? 'Complete' : 'In progress'}
                  </Badge>
                </div>

                {job.requirement_summary ? (
                  <div>
                    <p className="text-[11px] font-semibold tracking-wide text-ink-subtle uppercase">
                      What we are doing
                    </p>
                    <p className="mt-1 text-sm whitespace-pre-line text-ink-muted">
                      {job.requirement_summary}
                    </p>
                  </div>
                ) : null}

                <Pipeline steps={pipelineFor(job)} />

                {job.account && Number(job.account.total_amount) > 0 ? (
                  <div className="rounded-lg border border-line bg-surface-muted p-3">
                    <p className="text-[11px] font-semibold tracking-wide text-ink-subtle uppercase">
                      Project value
                    </p>
                    <dl className="mt-2 grid grid-cols-3 gap-2">
                      <Money label="Total" value={job.account.total_amount} currency={job.account.currency} />
                      <Money label="Received" value={job.account.received_amount} currency={job.account.currency} />
                      <Money
                        label="Balance"
                        value={job.account.balance_amount}
                        currency={job.account.currency}
                        emphasise
                      />
                    </dl>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          ))
        )}

        {/* Contact block last: the customer reads their status first, and only
            then decides whether they need to ask us something. */}
        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm font-semibold text-ink">Questions about your project?</p>
            <div className="flex flex-wrap gap-2">
              {whatsapp ? (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <LuMessageCircle className="size-4" />
                  WhatsApp us
                </a>
              ) : null}

              {business.phone ? (
                <a
                  href={`tel:${business.phone.replace(/\s/g, '')}`}
                  className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-muted"
                >
                  <LuPhone className="size-4" />
                  {business.phone}
                </a>
              ) : null}
            </div>

            {business.email ? (
              <p className="text-xs text-ink-muted">
                Or email{' '}
                <a href={`mailto:${business.email}`} className="font-medium text-brand-700 underline">
                  {business.email}
                </a>
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </main>
  );
}

/**
 * The five stages, drawn as a vertical track.
 *
 * The state is spelled out in words next to every dot, not conveyed by colour
 * alone — the same rule the CRM's badges follow (§16), and it matters more here
 * because this audience did not choose the interface.
 */
function Pipeline({ steps }: { steps: PipelineStep[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wide text-ink-subtle uppercase">Progress</p>
      <ol className="mt-3 space-y-0">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const done = step.state === 'DONE';
          const current = step.state === 'CURRENT';

          return (
            <li key={step.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className={
                    done
                      ? 'flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white'
                      : current
                        ? 'size-5 shrink-0 rounded-full border-[3px] border-[--color-warn] bg-surface'
                        : 'size-5 shrink-0 rounded-full border-2 border-line bg-surface'
                  }
                >
                  {done ? <LuCheck className="size-3" strokeWidth={3} /> : null}
                </span>
                {!isLast ? (
                  <span
                    aria-hidden="true"
                    className={done ? 'w-0.5 flex-1 bg-brand-200' : 'w-0.5 flex-1 bg-line'}
                  />
                ) : null}
              </div>

              <div className={isLast ? 'pb-0' : 'pb-5'}>
                <p
                  className={
                    step.state === 'PENDING'
                      ? 'text-sm font-medium text-ink-subtle'
                      : 'text-sm font-semibold text-ink'
                  }
                >
                  {step.label}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {done ? 'Done' : current ? 'In progress' : 'Not started'}
                  {step.detail ? ` · ${step.detail}` : ''}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Money({
  label,
  value,
  currency,
  emphasise,
}: {
  label: string;
  value: number;
  currency: string;
  emphasise?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-subtle">{label}</dt>
      <dd
        className={
          emphasise && Number(value) > 0
            ? 'mt-0.5 text-sm font-semibold tabular-nums text-[oklch(45%_0.13_70)]'
            : 'mt-0.5 text-sm font-medium tabular-nums text-ink'
        }
      >
        {formatMoney(value, currency)}
      </dd>
    </div>
  );
}
