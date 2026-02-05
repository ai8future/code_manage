import { vi } from 'vitest';

interface LogEntry {
  level: string;
  msg: string;
  [key: string]: unknown;
}

/**
 * Creates a test logger that captures structured log entries for assertions.
 */
export function createTestLogger() {
  const entries: LogEntry[] = [];

  const makeLevel = (level: string) =>
    (obj: Record<string, unknown> | string, msg?: string) => {
      if (typeof obj === 'string') {
        entries.push({ level, msg: obj });
      } else {
        entries.push({ level, msg: msg || '', ...obj });
      }
    };

  const logger = {
    fatal: vi.fn(makeLevel('fatal')),
    error: vi.fn(makeLevel('error')),
    warn: vi.fn(makeLevel('warn')),
    info: vi.fn(makeLevel('info')),
    debug: vi.fn(makeLevel('debug')),
    trace: vi.fn(makeLevel('trace')),
    child: vi.fn(() => logger),
    entries,
  };

  return logger;
}

/**
 * Safely override environment variables for a test, restoring originals after.
 */
export function withEnv(overrides: Record<string, string | undefined>) {
  const originals: Record<string, string | undefined> = {};

  for (const key of Object.keys(overrides)) {
    originals[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }

  return function restore() {
    for (const key of Object.keys(originals)) {
      if (originals[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originals[key];
      }
    }
  };
}
