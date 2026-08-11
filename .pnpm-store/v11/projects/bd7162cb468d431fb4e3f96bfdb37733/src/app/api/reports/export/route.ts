import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { fail, statusForCode } from '@/lib/errors';
import { exportActivitiesCsv, exportLeadsCsv } from '@/server/services/reports';

/**
 * Filtered CSV export (AGENTS.md §3.1, §12).
 *
 * Admin-only — enforced by `canExportCsv` inside the service, not by hiding the
 * button. Each export is written to the audit log with its filters and row
 * count (§17).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const params = request.nextUrl.searchParams;

    const filters = {
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
      status: params.get('status') ?? undefined,
      source: params.get('source') ?? undefined,
      assignedTo: params.get('assignedTo') ?? undefined,
    };

    const report = params.get('report') === 'activities' ? 'activities' : 'leads';

    const { csv, filename } =
      report === 'activities'
        ? await exportActivitiesCsv(user, filters)
        : await exportLeadsCsv(user, filters);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // Customer data: never cached by a proxy (§15).
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    const result = fail(error);
    return NextResponse.json(result, {
      status: statusForCode(result.ok ? 'INTERNAL' : result.code),
    });
  }
}
