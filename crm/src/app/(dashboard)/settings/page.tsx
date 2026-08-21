import type { Metadata } from 'next';
import Link from 'next/link';
import { LuChevronRight, LuHistory, LuPlug, LuSlidersHorizontal, LuUsers } from 'react-icons/lu';
import { requirePageRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getBusinessSettings, getNormalizationSettings, getSettings } from '@/lib/settings';
import { countConvertibleVisits } from '@/server/services/site-visits';
import { listPurgeCandidates } from '@/server/services/lead-purge';
import { isTigrisConfigured } from '@/lib/env';
import { Badge, Card, PageHeader } from '@/components/ui';
import { AccordionCard } from '@/components/ui/accordion-card';
import { SettingForm } from '@/components/settings/setting-form';
import {
  BusinessSettingsForm,
  NormalizationForm,
} from '@/components/settings/business-form';
import { DeletedLeadsSetting } from '@/components/settings/deleted-leads';
import { JourneyTrackingSetting } from '@/components/settings/journey-setting';

export const metadata: Metadata = { title: 'Settings' };

/** Admin settings hub (AGENTS.md §11.7). */
export default async function SettingsPage() {
  const user = await requirePageRole('ADMIN');

  const supabase = await createClient();
  const [settings, business, normalization, convertibleVisits] = await Promise.all([
    getSettings(),
    getBusinessSettings(),
    getNormalizationSettings(),
    countConvertibleVisits(user),
  ]);

  const [{ count: staffCount }, { count: pendingCount }, purgeLeads] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', false)
      .is('approved_at', null),
    // First page only. The dialog searches and pages the rest itself, so this
    // screen never loads a lead table it is not showing.
    listPurgeCandidates(user),
  ]);

  const links = [
    {
      href: '/settings/users',
      icon: LuUsers,
      title: 'Users and roles',
      description: `${staffCount ?? 0} active staff`,
      badge: pendingCount && pendingCount > 0 ? `${pendingCount} access request(s)` : null,
    },
    {
      href: '/settings/options',
      icon: LuSlidersHorizontal,
      title: 'Statuses and reasons',
      description: 'Loss reasons, requirement types',
      badge: null,
    },
    {
      href: '/settings/integrations',
      icon: LuPlug,
      title: 'Meta integration',
      description: 'Supabase Edge Functions, mapping and sync health',
      badge: null,
    },
    {
      href: '/settings/audit',
      icon: LuHistory,
      title: 'Audit history',
      description: 'Who did what, and when',
      badge: null,
    },
  ];

  return (
    <>
      <PageHeader title="Settings" subtitle="Administration and configuration" />

      <div className="space-y-4">
        <Card>
          <ul className="divide-y divide-line">
            {links.map((link) => {
              const Icon = link.icon;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-muted"
                  >
                    <Icon className="size-5 shrink-0 text-ink-subtle" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{link.title}</p>
                      <p className="text-xs text-ink-muted">{link.description}</p>
                    </div>
                    {link.badge ? <Badge tone="warn">{link.badge}</Badge> : null}
                    <LuChevronRight className="size-4 shrink-0 text-ink-subtle" />
                  </Link>
                </li>
              );
            })}
            <li>
              <DeletedLeadsSetting
                leads={purgeLeads.items}
                total={purgeLeads.total}
                pageSize={purgeLeads.pageSize}
              />
            </li>
          </ul>
        </Card>

        {/* Business details first: this is the panel that decides what a
            customer sees, so it outranks internal tuning. */}
        <AccordionCard
            title="Business details"
            description="Used on customer emails, the customer portal and every WhatsApp button."
            action={
              <Badge tone={business.whatsappNumber ? 'ok' : 'neutral'}>
                {business.whatsappNumber ? 'WhatsApp on' : 'No WhatsApp number'}
              </Badge>
            }
          >
              <BusinessSettingsForm settings={business} />
        </AccordionCard>

        {/* Sits above the tuning panels: this one changes what staff see on a
            screen, not a number a job reads. */}
        <AccordionCard
            title="Site visits"
            description="How much a visit records on the way to site."
          >
              <JourneyTrackingSetting
                enabled={settings.siteVisitJourneyEnabled}
                convertibleVisits={convertibleVisits}
              />
        </AccordionCard>

        <AccordionCard
            title="Lead cleaning"
            description="One-time setup. Applied to Meta, website and manual leads alike."
          >
              <NormalizationForm settings={normalization} />
        </AccordionCard>

        <AccordionCard
            title="File uploads"
            description="Applies to designs, site photos and execution evidence."
            action={
              <Badge tone={isTigrisConfigured() ? 'ok' : 'danger'}>
                {isTigrisConfigured() ? 'Storage connected' : 'Storage not configured'}
              </Badge>
            }
          >
            <div className="space-y-4">
              <SettingForm
                settingKey="max_upload_size_mb"
                label="Maximum file size (MB)"
                hint="Between 1 and 500. Larger files are rejected before upload starts."
                defaultValue={String(settings.maxUploadSizeMb)}
                type="number"
              />
  
              <div className="rounded-lg bg-surface-muted p-3 text-xs text-ink-muted">
                <p className="font-medium text-ink">Allowed file types</p>
                <p className="mt-1">
                  Previewed in the browser: PDF, JPG, PNG, WebP. Stored and downloadable: DOC(X),
                  XLS(X), PPT(X), DWG, DXF, SKP, ZIP.
                </p>
                <p className="mt-1">
                  Executable and web-content files are never accepted, whatever the limit is set to.
                </p>
              </div>
            </div>
        </AccordionCard>

        <AccordionCard title="Reminders" description="Drives the scheduled reminder job.">
            <div className="space-y-4">
              <SettingForm
                settingKey="follow_up_reminder_lead_hours"
                label="Follow-up reminder lead time (hours)"
                defaultValue={String(settings.followUpReminderLeadHours)}
                type="number"
              />
              <SettingForm
                settingKey="design_due_reminder_lead_hours"
                label="Design due reminder lead time (hours)"
                defaultValue={String(settings.designDueReminderLeadHours)}
                type="number"
              />
              <SettingForm
                settingKey="duplicate_lookback_days"
                label="Duplicate detection window (days)"
                hint="How far back a repeated mobile number counts as a duplicate."
                defaultValue={String(settings.duplicateLookbackDays)}
                type="number"
              />
            </div>
        </AccordionCard>
      </div>
    </>
  );
}
