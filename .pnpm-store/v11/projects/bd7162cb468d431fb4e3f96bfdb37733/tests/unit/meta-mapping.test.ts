import { describe, expect, it } from 'vitest';
import {
  applyMapping,
  composeRequirement,
  isMappingComplete,
  validateMapping,
  type MappingEntry,
} from '@/lib/meta/mapping';

const completeMapping: MappingEntry[] = [
  { metaFieldKey: 'full_name', crmField: 'customer_name' },
  { metaFieldKey: 'phone_number', crmField: 'mobile' },
  { metaFieldKey: 'email', crmField: 'email' },
  { metaFieldKey: 'city', crmField: 'location_text' },
  { metaFieldKey: 'project_details', crmField: 'requirement_summary' },
  { metaFieldKey: 'budget', crmField: 'IGNORE' },
];

describe('Meta form mapping validation', () => {
  it('accepts exactly one name and mobile mapping', () => {
    expect(validateMapping(completeMapping)).toEqual({ valid: true, errors: {} });
    expect(isMappingComplete(completeMapping)).toBe(true);
  });

  it.each([
    ['customer_name', 'Customer name'],
    ['mobile', 'Phone'],
  ] as const)('requires %s', (missing, label) => {
    const entries = completeMapping.filter((entry) => entry.crmField !== missing);
    const result = validateMapping(entries);

    expect(result.valid).toBe(false);
    expect(result.errors._form).toContain(label);
    expect(isMappingComplete(entries)).toBe(false);
  });

  it.each(['customer_name', 'mobile', 'email', 'location_text', 'requirement_summary'] as const)(
    'rejects two Meta questions mapped to %s',
    (crmField) => {
      const result = validateMapping([
        ...completeMapping,
        { metaFieldKey: `duplicate_${crmField}`, crmField },
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors[`duplicate_${crmField}`]).toContain('mapped 2 times');
    },
  );

  it('rejects one Meta question claiming two destinations', () => {
    const result = validateMapping([
      ...completeMapping,
      { metaFieldKey: 'full_name', crmField: 'IGNORE' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.full_name).toContain('appears more than once');
  });

  it('allows several questions to be ignored', () => {
    const result = validateMapping([
      ...completeMapping,
      { metaFieldKey: 'preferred_style', crmField: 'IGNORE' },
    ]);

    expect(result.valid).toBe(true);
  });
});

describe('applyMapping', () => {
  it('maps case-insensitively, joins multivalue answers, and ignores configured fields', () => {
    const result = applyMapping(
      [
        { name: ' FULL_NAME ', values: ['  Asha Rao  '] },
        { name: 'phone_number', values: ['9876543210'] },
        { name: 'email', values: ['ASHA@EXAMPLE.COM'] },
        { name: 'city', values: ['Bengaluru'] },
        { name: 'project_details', values: ['Terrace', 'Native plants'] },
        { name: 'budget', values: ['5 lakh'] },
      ],
      completeMapping,
    );

    expect(result).toEqual({
      customerName: 'Asha Rao',
      mobile: '9876543210',
      email: 'ASHA@EXAMPLE.COM',
      locationText: 'Bengaluru',
      requirementSummary: 'Terrace, Native plants',
      unmapped: {},
    });
  });

  it('preserves unexpected answers in the composed requirement', () => {
    const result = applyMapping(
      [
        { name: 'full_name', values: ['Asha Rao'] },
        { name: 'phone_number', values: ['9876543210'] },
        { name: 'project_details', values: ['Balcony garden'] },
        { name: 'preferred_timeline', values: ['Before Diwali'] },
      ],
      completeMapping,
    );

    expect(result.unmapped).toEqual({ preferred_timeline: 'Before Diwali' });
    expect(composeRequirement(result)).toBe(
      'Balcony garden\n\nPreferred timeline: Before Diwali',
    );
  });
});
