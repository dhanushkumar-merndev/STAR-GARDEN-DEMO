import type { Metadata } from 'next';
import Link from 'next/link';
import { LuArrowLeft } from 'react-icons/lu';
import { requirePageRole } from '@/lib/auth/session';
import {
  getCampaignSelectionMode,
  getSelectedAdAccountId,
  listAdAccounts,
  listCampaignSetup,
} from '@/server/services/meta-config';
import { Alert, Badge, PageHeader } from '@/components/ui';
import {
  AdAccountPicker,
  CampaignSelectionForm,
  SetupStep,
} from '@/components/settings/meta-setup';
import { SyncMetaButton } from '@/components/settings/integration-actions';

export const metadata: Metadata = { title: 'Meta setup' };

/**
 * Meta setup, as three steps in the order the owner thinks about them.
 *
 * The whole screen reads from `app_settings` and the synced Meta tables — never
 * from a deployment environment variable. Switching ad account is a click here,
 * and the next scheduled sync (every 10 minutes) picks it up. Nothing about it
 * requires a Vercel change or a redeploy, which is the point.
 */
export default async function MetaSetupPage() {
  const user = await requirePageRole('ADMIN');

  const [accounts, selectedId, mode] = await Promise.all([
    listAdAccounts(user),
    getSelectedAdAccountId(),
    getCampaignSelectionMode(),
  ]);

  const rows = await listCampaignSetup(user, selectedId);
  const selected = accounts.find((account) => account.meta_ad_account_id === selectedId);

  const mappedForms = rows.flatMap((row) => row.forms).filter((form) => form.isMapped).length;
  const totalForms = rows.flatMap((row) => row.forms).length;

  return (
    <>
      <div className="mb-3">
        <Link href="/settings/integrations" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
          <LuArrowLeft className="size-4" />
          Integrations
        </Link>
      </div>

      <PageHeader
        title="Meta setup"
        subtitle="Pick the ad account, choose its campaigns, connect the lead forms."
        action={<SyncMetaButton syncType="CAMPAIGNS" />}
      />

      <div className="space-y-4">
        <Alert tone="info">
          Every choice on this page is stored in Supabase, not in the hosting
          environment — so changing the ad account never needs a redeploy. The scheduled
          sync runs every 10 minutes and picks it up automatically.
        </Alert>

        <SetupStep
          number={1}
          title="Choose the ad account"
          description="These are the accounts your Meta access token can reach."
          status={
            selected ? (
              <Badge tone="ok">Connected</Badge>
            ) : (
              <Badge tone="warn">Not chosen</Badge>
            )
          }
        >
          <AdAccountPicker accounts={accounts} />
        </SetupStep>

        <SetupStep
          number={2}
          title="Choose the campaigns"
          description={
            selected
              ? `Campaigns on ${selected.name}.`
              : 'Pick an ad account first, then its campaigns appear here.'
          }
          status={
            rows.length > 0 ? (
              <Badge tone="neutral">
                {mode === 'ALL' ? 'All campaigns' : `${selected?.selectedCampaignCount ?? 0} selected`}
              </Badge>
            ) : null
          }
        >
          <CampaignSelectionForm adAccountId={selectedId} rows={rows} mode={mode} />
        </SetupStep>

        <SetupStep
          number={3}
          title="Connect the lead form fields"
          description="Match each question on the Meta form to a CRM column. One-time setup per form."
          status={
            totalForms === 0 ? null : mappedForms === totalForms ? (
              <Badge tone="ok">All {totalForms} connected</Badge>
            ) : (
              <Badge tone="warn">
                {mappedForms} of {totalForms} connected
              </Badge>
            )
          }
        >
          {totalForms === 0 ? (
            <p className="text-sm text-ink-muted">
              No lead forms have synced yet. They arrive with the campaign sync, then each one
              gets a <span className="font-medium text-ink">Connect fields</span> link in step 2.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-ink-muted">
                Use the <span className="font-medium text-ink">Connect fields</span> link beside
                each form in step 2. A form is connected once its name and mobile questions are
                both mapped — until then its leads are held rather than lost, and appear under{' '}
                <Link
                  href="/settings/integrations/issues"
                  className="font-medium text-brand-700 underline"
                >
                  Integration issues
                </Link>
                .
              </p>

              {mappedForms < totalForms ? (
                <Alert tone="warn">
                  {totalForms - mappedForms} form
                  {totalForms - mappedForms === 1 ? '' : 's'} still need connecting. Nothing has
                  been lost — connect them and use Retry on the issues page to bring those leads
                  in.
                </Alert>
              ) : null}
            </div>
          )}
        </SetupStep>
      </div>
    </>
  );
}
