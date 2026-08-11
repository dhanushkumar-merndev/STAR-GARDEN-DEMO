import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { AuditAction, recordAudit } from '@/lib/audit';
import { canExportAccounts } from '@/lib/permissions';
import { collectAccountExportRows, type AccountsTab } from '@/server/services/accounts';
import { recordsToXlsx, XLSX_CONTENT_TYPE } from '@/lib/utils/xlsx';

/**
 * Downloads the Accounts register as a real `.xlsx`.
 *
 * A Route Handler rather than a Server Action because the response is a binary
 * body with `Content-Disposition` — Server Actions return serialisable values
 * and cannot set download headers.
 *
 * Every export is audited. A spreadsheet of customer names, phone numbers and
 * project values leaving the system is exactly the event §17 exists to record.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABS: AccountsTab[] = ['READY', 'OPEN', 'CLOSED', 'ALL'];

export async function GET(request: NextRequest) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  if (!canExportAccounts(user)) {
    return NextResponse.json({ error: 'Accounts are Admin-only.' }, { status: 403 });
  }

  const requested = request.nextUrl.searchParams.get('tab');
  const tab: AccountsTab = TABS.includes(requested as AccountsTab)
    ? (requested as AccountsTab)
    : 'ALL';

  try {
    const rows = await collectAccountExportRows(user, tab);

    const workbook = recordsToXlsx(rows, {
      sheetName: `Accounts ${tab.toLowerCase()}`,
      // The three money columns are the ones being read; the rest can size
      // themselves from their content.
      columnWidths: undefined,
    });

    await recordAudit({
      actorUserId: user.id,
      action: AuditAction.ACCOUNT_EXPORTED,
      entityType: 'lead_account',
      after: { tab, row_count: rows.length },
    });

    const filename = `star-gardens-accounts-${tab.toLowerCase()}-${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;

    return new NextResponse(new Uint8Array(workbook), {
      status: 200,
      headers: {
        'Content-Type': XLSX_CONTENT_TYPE,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(workbook.byteLength),
        // A financial export must never be served from a shared cache.
        'Cache-Control': 'no-store, private',
      },
    });
  } catch (error) {
    console.error('[accounts-export] failed', error);
    return NextResponse.json(
      { error: 'Could not build the export. Please try again.' },
      { status: 500 },
    );
  }
}
