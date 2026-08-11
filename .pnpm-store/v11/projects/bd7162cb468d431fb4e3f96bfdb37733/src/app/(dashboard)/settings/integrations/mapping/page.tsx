import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageRole } from '@/lib/auth/session';
import {
  formQuestions,
  getFormMapping,
  listCampaigns,
  listFormsForCampaign,
  listLeadForms,
} from '@/server/services/meta-config';
import { Card, CardBody, EmptyState, PageHeader, Select } from '@/components/ui';
import { MetaMappingEditor } from '@/components/settings/integration-actions';

export const metadata: Metadata = { title: 'Meta form mapping' };

export default async function MetaMappingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageRole('ADMIN');
  const params = await searchParams;
  const campaigns = await listCampaigns(user);
  const campaignId = typeof params.campaign === 'string' ? params.campaign : campaigns[0]?.id;
  const grouped = campaignId
    ? await listFormsForCampaign(user, campaignId)
    : { linked: [], other: await listLeadForms(user) };
  const forms = [...grouped.linked, ...grouped.other];
  const metaFormId = typeof params.form === 'string' ? params.form : forms[0]?.meta_form_id;
  const form = forms.find((item) => item.meta_form_id === metaFormId) ?? null;
  const mapping = form ? await getFormMapping(user, form.meta_form_id) : [];

  return (
    <>
      <div className="mb-2">
        <Link href="/settings/integrations" className="text-sm text-ink-muted hover:text-ink">
          Back to integrations
        </Link>
      </div>
      <PageHeader title="Meta form mapping" subtitle="Name and phone must each be mapped exactly once" />
      <Card>
        <CardBody className="space-y-4">
          <form method="GET" className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium text-ink">Campaign</span>
              <Select name="campaign" defaultValue={campaignId}>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-ink">Lead form</span>
              <Select name="form" defaultValue={metaFormId}>
                {forms.map((item) => (
                  <option key={item.id} value={item.meta_form_id}>
                    {item.name}
                    {grouped.linked.some((linked) => linked.id === item.id) ? ' - linked' : ''}
                  </option>
                ))}
              </Select>
            </label>
            <button
              className="tap rounded-lg bg-brand-600 px-4 text-sm font-medium text-white sm:col-span-2 sm:w-fit"
              type="submit"
            >
              Load form
            </button>
          </form>

          {form ? (
            formQuestions(form).length ? (
              <MetaMappingEditor
                formId={form.meta_form_id}
                questions={formQuestions(form)}
                current={mapping}
              />
            ) : (
              <EmptyState
                title="This form has no cached questions"
                description="Run campaign sync, then try again."
              />
            )
          ) : (
            <EmptyState
              title="No Meta lead forms synced"
              description="Configure Meta and run campaign sync first."
            />
          )}
        </CardBody>
      </Card>
    </>
  );
}
