import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, History, Plug, SlidersHorizontal, Users } from 'lucide-react';
import { requirePageRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/settings';
import { isTigrisConfigured } from '@/lib/env';
import { Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui';
import { SettingForm } from '@/components/settings/setting-form';

export const metadata: Metadata = { title: 'Settings' };

/** Admin settings hub (AGENTS.md §11.7). */
export default async function SettingsPage() {
  await requirePageRole('ADMIN');

  const supabase = await createClient();
  const settings = await getSettings();

  const [{ count: staffCount }, { count: pendingCount }] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', false)
      .is('approved_at', null),
  ]);

  const links = [
    {
      href: '/settings/users',
      icon: Users,
      title: 'Users and roles',
      description: `${staffCount ?? 0} active staff`,
      badge: pendingCount && pendingCount > 0 ? `${pendingCount} access request(s)` : null,
    },
    {
      href: '/settings/options',
      icon: SlidersHorizontal,
      title: 'Statuses and reasons',
      description: 'Loss reasons, requirement types',
      badge: null,
    },
    {
      href: '/settings/integrations',
      icon: Plug,
      title: 'Meta integration',
      description: 'Supabase Edge Functions, mapping and sync health',
      badge: null,
    },
    {
      href: '/settings/audit',
      icon: History,
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
                    <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="File uploads"
            description="Applies to designs, site photos and execution evidence."
            action={
              <Badge tone={isTigrisConfigured() ? 'ok' : 'danger'}>
                {isTigrisConfigured() ? 'Storage connected' : 'Storage not configured'}
              </Badge>
            }
          />
          <CardBody className="space-y-4">
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
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Reminders" description="Drives the scheduled reminder job." />
          <CardBody className="space-y-4">
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
          </CardBody>
        </Card>
      </div>
    </>
  );
}
