// Adapted from @ai8future/config v5 — Zod v4 config loading with fail-fast validation
import { z, type ZodType } from 'zod';

/**
 * Maps Zod schema fields to environment variable names.
 */
export interface EnvMapping<T extends ZodType> {
  schema: T;
  env: Record<keyof z.infer<T>, string>;
}

/**
 * Loads configuration from environment variables, validates against a Zod schema,
 * and returns the typed result. Calls process.exit(1) on validation failure.
 *
 * This follows chassis fail-fast semantics: config errors are never recoverable
 * at runtime. Crash hard at boot with a clear message.
 */
export function mustLoad<T extends ZodType>(mapping: EnvMapping<T>): z.infer<T> {
  const raw: Record<string, unknown> = {};

  for (const [field, envVar] of Object.entries(mapping.env)) {
    const value = process.env[envVar as string];
    if (value !== undefined) {
      raw[field] = value;
    }
  }

  const result = mapping.schema.safeParse(raw);

  if (!result.success) {
    const envLookup = mapping.env as Record<string, string>;
    const lines = result.error.issues.map((issue) => {
      const fieldPath = issue.path.map(String).join('.');
      const envVar = envLookup[fieldPath] ?? fieldPath;
      return `  ${envVar} (${fieldPath}): ${issue.message}`;
    });

    console.error(`config: validation failed\n${lines.join('\n')}`);
    process.exit(1);
  }

  return result.data;
}
