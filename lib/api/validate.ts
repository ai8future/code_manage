import { NextResponse } from 'next/server';
import { ZodType, ZodError } from 'zod';

type ParseSuccess<T> = { success: true; data: T };
type ParseFailure = { success: false; response: NextResponse };

/**
 * Parse and validate data against a Zod schema.
 * Returns parsed data on success, or a 400 NextResponse on failure.
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
        response: NextResponse.json({ error: message }, { status: 400 }),
      };
    }
    return {
      success: false,
      response: NextResponse.json({ error: 'Invalid request body' }, { status: 400 }),
    };
  }
}
