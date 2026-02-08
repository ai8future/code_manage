import { NextResponse } from 'next/server';
import { ZodType, ZodError } from 'zod';
import { validateJSON, SecvalError } from '@/lib/chassis/secval';
import { validationError } from '@/lib/chassis/errors';
import { errorResponse } from '@/lib/api/errors';

type ParseSuccess<T> = { success: true; data: T };
type ParseFailure = { success: false; response: NextResponse };

/**
 * Parse and validate data against a Zod schema.
 * Returns parsed data on success, or an RFC 9457 error response on failure.
 */
export function parseBody<T>(
  schema: ZodType<T>,
  data: unknown,
): ParseSuccess<T> | ParseFailure {
  try {
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (err) {
    if (err instanceof ZodError) {
      const message = err.issues.map((e: { message: string }) => e.message).join('; ');
      return {
        success: false,
        response: errorResponse(validationError(message)),
      };
    }
    return {
      success: false,
      response: errorResponse(validationError('Invalid request body')),
    };
  }
}

/**
 * Validate raw JSON string for security threats (prototype pollution, dangerous keys),
 * then parse the body and validate against a Zod schema.
 */
export function parseSecureBody<T>(
  schema: ZodType<T>,
  rawBody: string,
): ParseSuccess<T> | ParseFailure {
  // Security validation: parse JSON, check for dangerous keys, nesting depth
  let data: unknown;
  try {
    data = validateJSON(rawBody);
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
