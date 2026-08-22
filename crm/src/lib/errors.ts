/**
 * Error and result types shared by Server Actions and Route Handlers.
 *
 * Server Actions return a discriminated result rather than throwing, so the
 * client can render a field-level message without a error boundary. Throwing is
 * reserved for genuinely exceptional conditions.
 */

export type AppErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'DUPLICATE_LEAD'
  | 'INVALID_TRANSITION'
  | 'NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Field-keyed messages, for form rendering. */
  readonly fields?: Record<string, string>;
  /** Extra payload a caller may need, e.g. the id of a duplicate lead. */
  readonly meta?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    message: string,
    options?: { fields?: Record<string, string>; meta?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.fields = options?.fields;
    this.meta = options?.meta;
  }
}

export const forbidden = (message = 'You do not have access to this record.') =>
  new AppError('FORBIDDEN', message);

export const notFound = (what = 'Record') => new AppError('NOT_FOUND', `${what} not found.`);

export const unauthenticated = () =>
  new AppError('UNAUTHENTICATED', 'Your session has ended. Sign in again.');

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: AppErrorCode;
      message: string;
      fields?: Record<string, string>;
      meta?: Record<string, unknown>;
    };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(error: unknown): ActionResult<never> {
  if (error instanceof AppError) {
    // INTERNAL is the one code whose message is deliberately generic to the
    // client (§15 — a raw database message can carry column names and
    // values). That is exactly why its `cause` must be logged here: without
    // this, the real reason a save failed is visible nowhere at all, not the
    // response and not the server log.
    if (error.code === 'INTERNAL' && error.cause) {
      console.error('[action] internal error:', error.message, '— cause:', error.cause);
    }
    return {
      ok: false,
      code: error.code,
      message: error.message,
      ...(error.fields ? { fields: error.fields } : {}),
      ...(error.meta ? { meta: error.meta } : {}),
    };
  }

  // Anything unrecognised is logged server-side and reported generically —
  // database messages can carry column names and values (§15).
  console.error('[action] unhandled error', error);
  return {
    ok: false,
    code: 'INTERNAL',
    message: 'Something went wrong. Please try again.',
  };
}

/**
 * Wraps a Server Action body so thrown AppErrors become typed results. Keeps
 * every action free of repeated try/catch.
 */
export async function actionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await fn());
  } catch (error) {
    return fail(error);
  }
}

/** Maps a domain error onto the HTTP status a Route Handler should return. */
export function statusForCode(code: AppErrorCode): number {
  switch (code) {
    case 'UNAUTHENTICATED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'VALIDATION':
    case 'INVALID_TRANSITION':
      return 422;
    case 'CONFLICT':
    case 'DUPLICATE_LEAD':
      return 409;
    case 'RATE_LIMITED':
      return 429;
    case 'NOT_CONFIGURED':
      return 503;
    default:
      return 500;
  }
}
