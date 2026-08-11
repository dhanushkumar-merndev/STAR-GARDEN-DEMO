import { describe, expect, it } from 'vitest';
import { describeAuditEntry } from '@/lib/audit/describe';

const BDM = '9c1e6c2a-0f5e-4c1a-9f3b-1a2b3c4d5e6f';
const DESIGNER = '2b7d4e11-8a3c-4f19-9d2e-7c6b5a4f3e21';
const LEAD = 'f0e1d2c3-b4a5-4968-8778-695a4b3c2d1e';

const NAMES = {
  [BDM]: 'Dhanush Kumar R',
  [DESIGNER]: 'Star Garden',
  [LEAD]: 'SG-0042 · Ravi Menon',
};

describe('describeAuditEntry', () => {
  it('states the event in plain English', () => {
    const result = describeAuditEntry({
      action: 'site_visit.completed',
      entity_type: 'site_visit',
      after_data: { design_required: true },
    });

    expect(result.headline).toBe('Site visit completed');
    expect(result.entityLabel).toBe('Site visit');
    expect(result.facts).toEqual([{ label: 'Design needed', value: 'Yes' }]);
  });

  it('formats timestamps and booleans rather than printing raw JSON', () => {
    const result = describeAuditEntry({
      action: 'site_visit.checked_out',
      entity_type: 'site_visit',
      after_data: { check_out_at: '2026-08-11T12:48:21.708+00:00', location_shared: true },
    });

    expect(result.facts).toEqual([
      { label: 'Checked out', value: '11 Aug 2026, 6:18 pm' },
      { label: 'Location shared', value: 'Yes' },
    ]);
  });

  it('resolves foreign keys to names and drops the ones it cannot', () => {
    const result = describeAuditEntry(
      {
        action: 'lead.reassigned',
        entity_type: 'lead',
        before_data: { assigned_bdm_id: DESIGNER },
        after_data: { assigned_bdm_id: BDM, reason: 'Territory change' },
      },
      NAMES,
    );

    expect(result.facts).toEqual([
      { label: 'Assigned to', value: 'Dhanush Kumar R', from: 'Star Garden' },
      { label: 'Reason', value: 'Territory change' },
    ]);
  });

  it('hides unresolvable ids instead of showing a UUID', () => {
    const result = describeAuditEntry({
      action: 'design.designer_assigned',
      entity_type: 'design_project',
      after_data: { lead_id: LEAD, assigned_designer_id: DESIGNER, due_at: null },
    });

    expect(result.facts).toEqual([]);
  });

  it('humanizes enum values', () => {
    const result = describeAuditEntry({
      action: 'call.outcome_recorded',
      entity_type: 'lead',
      after_data: { outcome: 'NOT_INTERESTED', next_action: null, status: 'LOST' },
    });

    expect(result.headline).toBe('Call outcome recorded');
    expect(result.facts).toEqual([
      { label: 'Outcome', value: 'Not interested' },
      { label: 'Status', value: 'Lost' },
    ]);
  });

  it('shows a cleared field as a change, not an omission', () => {
    const result = describeAuditEntry(
      {
        action: 'site_visit.designer_assigned',
        entity_type: 'site_visit',
        before_data: { assigned_designer_id: DESIGNER },
        after_data: { assigned_designer_id: null },
      },
      NAMES,
    );

    expect(result.facts).toEqual([
      { label: 'Designer', value: 'Cleared', from: 'Star Garden' },
    ]);
  });

  it('reads money and file sizes in their own units', () => {
    const result = describeAuditEntry({
      action: 'account.recorded',
      entity_type: 'lead_account',
      after_data: { total_amount: 250000, received_amount: '50000', payment_status: 'PARTIAL' },
    });

    expect(result.facts.map((fact) => fact.value)).toEqual([
      '₹2,50,000.00',
      '₹50,000.00',
      'Partial',
    ]);
  });

  it('flattens a settings payload one level deep', () => {
    const result = describeAuditEntry({
      action: 'setting.updated',
      entity_type: 'app_setting',
      after_data: { lead_normalization: { strip_country_code: true, default_country: 'IN' } },
    });

    expect(result.headline).toBe('Setting changed');
    expect(result.facts).toEqual([
      { label: 'Lead normalization · Strip country code', value: 'Yes' },
      { label: 'Lead normalization · Default country', value: 'IN' },
    ]);
  });

  it('leaves short codes and acronyms alone', () => {
    const result = describeAuditEntry({
      action: 'user.updated',
      entity_type: 'profile',
      after_data: { role: 'BDM', currency: 'INR', status: 'QUALIFIED' },
    });

    expect(result.facts.map((fact) => fact.value)).toEqual(['BDM', 'INR', 'Qualified']);
  });

  it('summarizes lists rather than dumping them', () => {
    const result = describeAuditEntry(
      {
        action: 'execution.project_assigned',
        entity_type: 'execution_project',
        after_data: { assignees: [BDM, DESIGNER] },
      },
      NAMES,
    );

    expect(result.facts).toEqual([
      { label: 'Team', value: 'Dhanush Kumar R, Star Garden' },
    ]);
  });

  it('carries a tone that matches how the event reads', () => {
    expect(describeAuditEntry({ action: 'lead.created', entity_type: 'lead' }).tone).toBe('ok');
    expect(
      describeAuditEntry({ action: 'META_WEBHOOK_FAILED', entity_type: 'meta_sync_run' }).tone,
    ).toBe('danger');
    expect(
      describeAuditEntry({ action: 'site_visit.rescheduled', entity_type: 'site_visit' }).tone,
    ).toBe('warn');
  });
});
