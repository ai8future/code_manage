import { NextResponse } from 'next/server';
import { type ZodType } from 'zod';
import { validateJSON, SecvalError } from '@/lib/chassis/secval';
import { validationError } from '@/lib/chassis/errors';
import { errorResponse } from '@/lib/api/errors';

type ParseSuccess<T> = { success: true; data: T };
type ParseFailure = { success: false; response: NextResponse };

/**
 * Parse and validate data against a Zod schema.
 * Returns parsed data on success, or an RFC 9457 error response on failure.
 * Uses safeParse (Zod v4 preferred) instead of try/catch with instanceof ZodError.
 */
export function parseBody<T>(
  schema: ZodType<T>,
  data: unknown,
): ParseSuccess<T> | ParseFailure {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const message = result.error.issues.map((e) => e.message).join('; ');
  return {
    success: false,
    response: errorResponse(validationError(message)),
  };
}

/**
 * Validate raw JSON string for security threats (prototype pollution, dangerous keys),
 * then parse the body and validate against a Zod schema.
 */
export function parseSecureBody<T>(
  schema: ZodType<T>,
  rawBody: string,
): ParseSuccess<T> | ParseFailure {
  // Security validation: check for dangerous keys, nesting depth
  let data: unknown;
  try {
    validateJSON(rawBody);
    data = JSON.parse(rawBody);
  } catch (err) {
    if (err instanceof SecvalError) {
      return {
        success: false,
        response: errorResponse(validationError(err.message)),
      };
    }
    return {
      success: false,
      response: errorResponse(validationError('Invalid JSON')),
    };
  }

  return parseBody(schema, data);
}
