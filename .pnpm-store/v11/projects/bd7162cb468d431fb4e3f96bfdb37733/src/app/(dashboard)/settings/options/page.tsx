import type { Metadata } from 'next';
import Link from 'next/link';
import { LuArrowLeft } from 'react-icons/lu';
import { requirePageRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { ConfigOptionRowForm, NewConfigOptionForm } from '@/components/settings/config-options';

export const metadata: Metadata = { title: 'Statuses and reasons' };

/**
 * Configurable business options (AGENTS.md §2, §7.1).
 *
 * Loss reasons and requirement types live in the database so an Admin can
 * change the vocabulary without a code change. Workflow *statuses* deliberately
 * stay as database enums — those drive the state machines in §9 and cannot be
 * edited from a settings screen without breaking transition validation.
 */
const GROUPS = [
  {
    key: 'lost_reason',
    title: 'Loss reasons',
    description: 'Offered when a BDM marks a lead lost.',
  },
  {
    key: 'requirement_type',
    title: 'Requirement types',
    description: 'Service categories used on lead and visit forms.',
  },
];

export default async function OptionsPage() {
  await requirePageRole('ADMIN');
  const supabase = await createClient();

  const { data: options } = await supabase
    .from('config_options')
    .select('*')
    .order('group_key')
    .order('sort_order');

  return (
    <>
      <div className="mb-2">
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
          <LuArrowLeft className="size-4" />
          Settings
        </Link>
      </div>

      <PageHeader
        title="Statuses and reasons"
        subtitle="Editable lists used across the CRM"
      />

      <div className="space-y-4">
        {GROUPS.map((group) => {
          const groupOptions = (options ?? []).filter((o) => o.group_key === group.key);

          return (
            <Card key={group.key}>
              <CardHeader title={group.title} description={group.description} />

              {groupOptions.length === 0 ? (
                <EmptyState title="No options yet" description="Add the first one below." />
              ) : (
                <ul className="divide-y divide-line">
                  {groupOptions.map((option) => (
                    <li key={option.id} className="px-4 py-3">
                      <ConfigOptionRowForm option={option} />
                    </li>
                  ))}
                </ul>
              )}

              <div className="border-t border-line bg-surface-muted/50 p-4">
                <NewConfigOptionForm groupKey={group.key} />
              </div>
            </Card>
          );
        })}

        <Card>
          <CardHeader
            title="Workflow statuses"
            description="Lead, visit, design and execution statuses are fixed."
          />
          <div className="p-4 text-sm text-ink-muted">
            These drive the transition rules that stop work skipping steps — for example, execution
            cannot start without an approved design. Changing them is a code and migration change,
            not a settings edit.
          </div>
        </Card>
      </div>
    </>
  );
}
