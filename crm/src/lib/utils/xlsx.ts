import { deflateRawSync } from 'node:zlib';

/**
 * A minimal, dependency-free `.xlsx` writer.
 *
 * An `.xlsx` file is a ZIP archive of XML parts, and Node already ships the two
 * hard pieces — DEFLATE in `zlib` and CRC-32 is twenty lines. So rather than
 * pull in a spreadsheet library (large, and the popular one has a history of
 * prototype-pollution advisories) for the single feature we need, the archive
 * is assembled here.
 *
 * What this deliberately does NOT do: formulas, multiple sheets, merged cells,
 * images, charts. The Accounts export is a flat table of values, and every line
 * of generality here would be a line nothing calls.
 *
 * Numbers are written as real numeric cells, not text. That is the whole reason
 * for preferring this over CSV: an Admin who exports the register can sum the
 * Balance column without first persuading Excel that it contains numbers.
 */

/* -------------------------------------------------------------------------- */
/* ZIP                                                                         */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    // Both indexes are masked into range, so the non-null assertions are
    // statements of fact rather than hopes: `i` is bounded by the loop and the
    // table lookup is `& 0xff` on a 256-entry table.
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]!) & 0xff]!;
  }
  return (crc ^ -1) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

/**
 * Builds a ZIP archive with DEFLATE compression.
 *
 * Timestamps are pinned to a fixed value rather than `now()`: it makes the
 * output byte-identical for identical input, which is what lets a test assert
 * on the archive instead of on the pieces.
 */
function buildZip(entries: ZipEntry[]): Buffer {
  const DOS_TIME = 0; // 00:00:00
  const DOS_DATE = 0x2821; // 2000-01-01

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const checksum = crc32(entry.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(8, 8); // method: deflate
    localHeader.writeUInt16LE(DOS_TIME, 10);
    localHeader.writeUInt16LE(DOS_DATE, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localParts.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(DOS_TIME, 12);
    centralHeader.writeUInt16LE(DOS_DATE, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra
    centralHeader.writeUInt16LE(0, 32); // comment
    centralHeader.writeUInt16LE(0, 34); // disk number
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with central directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralDirectory, end]);
}

/* -------------------------------------------------------------------------- */
/* XML                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Escapes text for an XML text node, and strips what XML 1.0 cannot carry.
 *
 * Control characters reach here in practice: customers paste requirements out
 * of WhatsApp and Word, and a single 0x0B in a cell makes Excel declare the
 * whole workbook corrupt rather than skipping that character.
 */
function xmlEscape(value: string): string {
  return value
    // Legal in XML 1.0: tab, LF and CR. Every other C0 control is not, and
    // they do arrive here — customers paste requirements out of Word and
    // WhatsApp, and one stray 0x0B makes Excel call the whole file corrupt.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** `1 -> A`, `27 -> AA`. Excel's column naming is base-26 with no zero. */
function columnName(index: number): string {
  let name = '';
  let n = index;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

export type CellValue = string | number | boolean | null | undefined;

function renderCell(reference: string, value: CellValue): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Style 2 is the currency-ish 2dp format defined in `styles.xml`.
    const style = Number.isInteger(value) ? '' : ' s="2"';
    return `<c r="${reference}"${style}><v>${value}</v></c>`;
  }

  if (typeof value === 'boolean') {
    return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }

  // Inline strings rather than a shared-strings table: one fewer part to keep
  // consistent, and the duplication compresses away in the ZIP anyway.
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(
    String(value),
  )}</t></is></c>`;
}

/* -------------------------------------------------------------------------- */
/* Workbook                                                                    */
/* -------------------------------------------------------------------------- */

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/**
 * Three styles: default, bold header, and a two-decimal number format.
 *
 * `numFmtId="4"` is Excel's built-in `#,##0.00`, so no custom format has to be
 * declared — and the file opens with the same appearance in LibreOffice.
 */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF2ED"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

export interface SheetOptions {
  /** Excel rejects a sheet name over 31 characters or containing []:*?/\ */
  sheetName?: string;
  /** Column widths in characters. Missing entries fall back to a sensible width. */
  columnWidths?: number[];
}

/**
 * Turns an array of uniform records into an `.xlsx` buffer.
 *
 * Column order comes from the first row's keys, which is what makes the calling
 * code read as a table definition rather than as a mapping exercise.
 */
export function recordsToXlsx<T extends Record<string, CellValue>>(
  records: T[],
  options: SheetOptions = {},
): Buffer {
  const first = records[0];
  // An empty export still produces a valid workbook with a single header, so a
  // filtered-to-nothing register downloads and opens rather than erroring.
  const headers = first ? Object.keys(first) : ['No data'];
  const sheetName = sanitizeSheetName(options.sheetName ?? 'Sheet1');

  const rows: string[] = [];

  const headerCells = headers
    .map((header, index) => {
      const reference = `${columnName(index + 1)}1`;
      return `<c r="${reference}" s="1" t="inlineStr"><is><t>${xmlEscape(header)}</t></is></c>`;
    })
    .join('');
  rows.push(`<row r="1">${headerCells}</row>`);

  records.forEach((record, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const cells = headers
      .map((header, columnIndex) =>
        renderCell(`${columnName(columnIndex + 1)}${rowNumber}`, record[header]),
      )
      .join('');
    rows.push(`<row r="${rowNumber}">${cells}</row>`);
  });

  const widths = headers
    .map((header, index) => {
      const width = options.columnWidths?.[index] ?? defaultWidth(header, records);
      return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
    })
    .join('');

  const lastCell = `${columnName(headers.length)}${records.length + 1}`;

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${lastCell}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${widths}</cols>
<sheetData>${rows.join('')}</sheetData>
<autoFilter ref="A1:${columnName(headers.length)}1"/>
</worksheet>`;

  return buildZip([
    { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(ROOT_RELS, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbookXml(sheetName), 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(WORKBOOK_RELS, 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(STYLES, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet, 'utf8') },
  ]);
}

/** Widest value in the column, clamped so one long note cannot span the screen. */
function defaultWidth<T extends Record<string, CellValue>>(
  header: string,
  records: T[],
): number {
  let widest = header.length;
  // Sampled rather than exhaustive — the point is a readable column, and
  // scanning ten thousand rows to choose a width is not worth the time.
  for (const record of records.slice(0, 200)) {
    const value = record[header];
    if (value === null || value === undefined) continue;
    widest = Math.max(widest, String(value).length);
  }
  return Math.min(Math.max(widest + 2, 10), 45);
}

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').trim();
  return (cleaned || 'Sheet1').slice(0, 31);
}

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
