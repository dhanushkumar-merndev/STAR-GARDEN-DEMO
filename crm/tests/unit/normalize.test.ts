import { describe, expect, it } from 'vitest';
import {
  cleanText,
  normalizeEmail,
  normalizeLeadFields,
  normalizeName,
  NORMALIZATION_DEFAULTS,
  stripPhoneFormatting,
} from '@/lib/utils/normalize';

/**
 * Lead normalization is the highest-leverage pure code in the intake path: if
 * it is wrong, duplicate detection silently stops matching and the same
 * customer is called twice by two different people.
 */

const on = NORMALIZATION_DEFAULTS;

describe('cleanText', () => {
  it('trims and collapses runs of whitespace', () => {
    expect(cleanText('  Ravi   Kumar \n', on)).toBe('Ravi Kumar');
  });

  it('returns null for a value that is only whitespace', () => {
    expect(cleanText('   ', on)).toBeNull();
    expect(cleanText('', on)).toBeNull();
    expect(cleanText(null, on)).toBeNull();
  });

  it('leaves the value alone when the rules are off', () => {
    const off = { ...on, trimWhitespace: false, collapseSpaces: false };
    expect(cleanText('  Ravi   Kumar ', off)).toBe('  Ravi   Kumar ');
  });
});

describe('normalizeName', () => {
  it('title-cases a name typed in one case', () => {
    expect(normalizeName('RAVI KUMAR', on)).toBe('Ravi Kumar');
    expect(normalizeName('ravi kumar', on)).toBe('Ravi Kumar');
  });

  it('leaves deliberate capitalisation alone', () => {
    // "McDonald" and "D'Souza" are already correct; "fixing" them is wrong.
    expect(normalizeName('Ronald McDonald', on)).toBe('Ronald McDonald');
    expect(normalizeName("Maria D'Souza", on)).toBe("Maria D'Souza");
  });

  it('capitalises after apostrophes and hyphens in single-case input', () => {
    expect(normalizeName("o'brien-smith", on)).toBe("O'Brien-Smith");
  });

  it('handles non-Latin scripts without mangling them', () => {
    expect(normalizeName('  ரவி  குமார் ', on)).toBe('ரவி குமார்');
  });

  it('skips title-casing when the rule is off', () => {
    expect(normalizeName('RAVI KUMAR', { ...on, titleCaseNames: false })).toBe('RAVI KUMAR');
  });
});

describe('normalizeEmail', () => {
  it('lowercases and strips stray whitespace', () => {
    expect(normalizeEmail('  Ravi.Kumar@Example.COM ', on)).toBe('ravi.kumar@example.com');
  });

  it('rejects anything that is not shaped like an address', () => {
    expect(normalizeEmail('not-an-email', on)).toBeNull();
    expect(normalizeEmail('missing@tld', on)).toBeNull();
    expect(normalizeEmail('@example.com', on)).toBeNull();
  });

  it('drops placeholders that mean "no email given"', () => {
    expect(normalizeEmail('noreply@example.com', on)).toBeNull();
    expect(normalizeEmail('test@test.com', on)).toBeNull();
    expect(normalizeEmail('na@somewhere.com', on)).toBeNull();
    expect(normalizeEmail('donotreply@stargardens.in', on)).toBeNull();
  });

  it('keeps placeholders when that rule is switched off', () => {
    expect(normalizeEmail('test@test.com', { ...on, dropPlaceholderEmails: false })).toBe(
      'test@test.com',
    );
  });

  it('does not mistake a real address for a placeholder', () => {
    expect(normalizeEmail('nathan@example.com', on)).toBe('nathan@example.com');
    expect(normalizeEmail('testa@example.com', on)).toBe('testa@example.com');
  });
});

describe('stripPhoneFormatting', () => {
  it('reduces a formatted number to digits, keeping the plus', () => {
    expect(stripPhoneFormatting('+91 98765 43210', on)).toBe('+919876543210');
    expect(stripPhoneFormatting('(080) 2345-6789', on)).toBe('08023456789');
  });

  it('converts the 00 international prefix to +', () => {
    expect(stripPhoneFormatting('0091 98765 43210', on)).toBe('+919876543210');
  });

  it('returns null when there are no digits at all', () => {
    expect(stripPhoneFormatting('n/a', on)).toBeNull();
    expect(stripPhoneFormatting('', on)).toBeNull();
  });
});

describe('normalizeLeadFields', () => {
  it('cleans a whole record in one pass', () => {
    const result = normalizeLeadFields(
      {
        customerName: '  RAVI   KUMAR  ',
        phone: '+91 98765 43210',
        email: '  Ravi@Example.COM ',
        locationText: '  Whitefield,  Bangalore ',
        requirementSummary: 'Terrace garden\n\n- 400 sq ft\n- irrigation',
      },
      on,
    );

    expect(result).toEqual({
      customerName: 'Ravi Kumar',
      phone: '+919876543210',
      email: 'ravi@example.com',
      locationText: 'Whitefield, Bangalore',
      siteAddress: null,
      // Line breaks survive: a bulleted requirement run onto one line is
      // unreadable, and a human reads this field.
      requirementSummary: 'Terrace garden\n\n- 400 sq ft\n- irrigation',
    });
  });

  it('nulls every field that normalizes to nothing', () => {
    const result = normalizeLeadFields(
      { customerName: '   ', email: 'noreply@example.com', locationText: '' },
      on,
    );

    expect(result.customerName).toBeNull();
    expect(result.email).toBeNull();
    expect(result.locationText).toBeNull();
  });
});
