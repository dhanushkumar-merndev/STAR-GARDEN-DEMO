import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { fail, statusForCode } from '@/lib/errors';
import { getFileAccessUrl } from '@/server/services/files';

/**
 * File preview / download (AGENTS.md §4.4 steps 8–9, §23.13).
 *
 * Authorization is re-derived from the file's parent record on every call, so
 * guessing a file id gains nothing — an unrelated user gets 404, the same
 * answer a nonexistent id produces.
 *
 * Two response modes:
 *   - `?redirect=1` (the default) sends a 302 to the signed URL, which is what
 *     an `<a>` or `window.open` needs.
 *   - `?redirect=0` returns JSON, for the preview pane that wants to show a
 *     warning banner before rendering.
 *
 * The signed URL lives for a couple of minutes and is never stored (§15).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const user = await requireUser();
    const { fileId } = await params;

    const mode = request.nextUrl.searchParams.get('mode');
    const action = mode === 'preview' ? 'PREVIEW' : 'DOWNLOAD';
    const wantsRedirect = request.nextUrl.searchParams.get('redirect') !== '0';

    const result = await getFileAccessUrl(user, fileId, action);

    if (wantsRedirect) {
      const response = NextResponse.redirect(result.url, { status: 302 });
      // The signed URL must never be cached by a proxy or the browser.
      response.headers.set('Cache-Control', 'no-store, max-age=0');
      return response;
    }

    return NextResponse.json(
      {
        url: result.url,
        expiresInSeconds: result.expiresInSeconds,
        previewable: result.previewable,
        filename: result.filename,
        isOutdatedVersion: result.isOutdatedVersion,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    const result = fail(error);
    return NextResponse.json(result, {
      status: statusForCode(result.ok ? 'INTERNAL' : result.code),
    });
  }
}
