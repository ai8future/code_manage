// Adapted from @ai8future/secval v5 — JSON security validation

/** Module-local error — NOT a ServiceError. */
export class SecvalError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, SecvalError.prototype);
    this.name = 'SecvalError';
  }
}

const DANGEROUS_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'execute',
  'eval',
  'include',
  'import',
  'require',
  'system',
  'shell',
  'script',
  'exec',
  'spawn',
  'fork',
  'command',
]);

const MAX_NESTING_DEPTH = 20;

/**
 * Parses data as JSON and scans for dangerous keys and excessive nesting.
 * Throws SecvalError on violation. Use JSON.parse() separately for the parsed value.
 */
export function validateJSON(data: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (err) {
    throw new SecvalError(`invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  walkValue(parsed, 0);
}

function walkValue(value: unknown, depth: number): void {
  if (depth > MAX_NESTING_DEPTH) {
    throw new SecvalError(`nesting depth ${depth} exceeds maximum ${MAX_NESTING_DEPTH}`);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      walkValue(item, depth + 1);
    }
    return;
  }

  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const normalised = key.toLowerCase().replaceAll('-', '_');
      if (DANGEROUS_KEYS.has(normalised)) {
        throw new SecvalError(`dangerous key detected: "${key}"`);
      }
      walkValue((value as Record<string, unknown>)[key], depth + 1);
    }
  }
}
