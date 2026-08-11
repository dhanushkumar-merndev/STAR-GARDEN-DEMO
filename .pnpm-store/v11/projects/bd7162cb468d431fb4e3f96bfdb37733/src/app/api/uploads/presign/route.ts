import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { AppError, fail, statusForCode } from '@/lib/errors';
import { parseOrThrow, presignUploadSchema } from '@/lib/validation/schemas';
import { authorizeUpload } from '@/server/services/files';

/**
 * Upload authorization (AGENTS.md §4.4 steps 1–4).
 *
 * The browser asks for permission to upload; the server checks the role, checks
 * access to the parent record, validates filename/type/size, and returns a
 * short-lived presigned PUT plus a signed token that carries the decision
 * forward to `/finalize`.
 *
 * The bucket credentials never leave the server (§18).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    const body = await request.json().catch(() => {
      throw new AppError('VALIDATION', 'Malformed request.');
    });

    const input = parseOrThrow(presignUploadSchema, body);
    const result = await authorizeUpload(user, input);

    return NextResponse.json({
      uploadUrl: result.uploadUrl,
      headers: result.headers,
      uploadToken: result.uploadToken,
      expiresInSeconds: result.expiresInSeconds,
    });
  } catch (error) {
    const result = fail(error);
    return NextResponse.json(result, { status: statusForCode(result.ok ? 'INTERNAL' : result.code) });
  }
}
