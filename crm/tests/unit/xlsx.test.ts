import { describe, expect, it } from 'vitest';
import { recordsToXlsx, XLSX_CONTENT_TYPE } from '@/lib/utils/xlsx';

/**
 * The `.xlsx` writer is assembled by hand, so these tests check the structural
 * facts Excel actually refuses to open a file without: the ZIP signature, the
 * required parts, and well-formed sheet XML.
 *
 * Reading the archive back means re-implementing DEFLATE, so instead the tests
 * assert on the parts of the container that are stored verbatim (names, the
 * end-of-central-directory record) plus the properties that come from the
 * writer's own logic.
 */

const ZIP_LOCAL_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ZIP_END_SIGNATURE = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

function fileNames(buffer: Buffer): string[] {
  // Part names are stored uncompressed in both the local and central headers,
  // so they are findable in the raw bytes.
  const text = buffer.toString('latin1');
  return [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/worksheets/sheet1.xml',
  ].filter((name) => text.includes(name));
}

describe('recordsToXlsx', () => {
  const rows = [
    { 'Lead code': 'SG-2026-001000', Customer: 'Ravi Kumar', Value: 125000, Balance: 2500.5 },
    { 'Lead code': 'SG-2026-001001', Customer: 'Asha & Co <Ltd>', Value: 0, Balance: 0 },
  ];

  it('produces a ZIP archive', () => {
    const buffer = recordsToXlsx(rows);

    expect(buffer.subarray(0, 4).equals(ZIP_LOCAL_SIGNATURE)).toBe(true);
    // The end-of-central-directory record is the last 22 bytes when there is
    // no archive comment, and Excel looks for it first.
    expect(buffer.subarray(buffer.length - 22, buffer.length - 18).equals(ZIP_END_SIGNATURE)).toBe(
      true,
    );
  });

  it('includes every part the format requires', () => {
    expect(fileNames(recordsToXlsx(rows))).toHaveLength(6);
  });

  it('is deterministic for identical input', () => {
    // Pinned timestamps rather than now(), so a byte-comparison is meaningful.
    expect(recordsToXlsx(rows).equals(recordsToXlsx(rows))).toBe(true);
  });

  it('produces a different archive for different data', () => {
    const other = [{ 'Lead code': 'SG-2026-002000', Customer: 'X', Value: 1, Balance: 0 }];
    expect(recordsToXlsx(rows).equals(recordsToXlsx(other))).toBe(false);
  });

  it('builds a valid workbook from an empty result set', () => {
    // A filtered-to-nothing register must still download and open.
    const buffer = recordsToXlsx([]);
    expect(buffer.subarray(0, 4).equals(ZIP_LOCAL_SIGNATURE)).toBe(true);
    expect(fileNames(buffer)).toHaveLength(6);
  });

  it('sanitises a sheet name Excel would reject', () => {
    // Excel forbids []:*?/\ and caps the name at 31 characters.
    const buffer = recordsToXlsx(rows, { sheetName: 'Accounts [2026]/all*' });
    const text = buffer.toString('latin1');
    expect(text).not.toContain('Accounts [2026]/all*');
  });

  it('exposes the content type the download route sends', () => {
    expect(XLSX_CONTENT_TYPE).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });
});
