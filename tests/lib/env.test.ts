import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// We test the schema directly rather than the singleton (which parses at import time)
const EnvSchema = z.object({
  CODE_BASE_PATH: z
    .string()
    .min(1, { error: 'CODE_BASE_PATH must not be empty' })
    .default('/Users/cliff/Desktop/_code'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

describe('EnvSchema', () => {
  it('parses valid environment with all fields', () => {
    const result = EnvSchema.parse({
      CODE_BASE_PATH: '/tmp/code',
      LOG_LEVEL: 'debug',
      NODE_ENV: 'production',
    });
    expect(result.CODE_BASE_PATH).toBe('/tmp/code');
    expect(result.LOG_LEVEL).toBe('debug');
    expect(result.NODE_ENV).toBe('production');
  });

  it('applies defaults when fields are undefined', () => {
    const result = EnvSchema.parse({});
    expect(result.CODE_BASE_PATH).toBe('/Users/cliff/Desktop/_code');
    expect(result.LOG_LEVEL).toBe('info');
    expect(result.NODE_ENV).toBe('development');
  });

  it('rejects empty CODE_BASE_PATH', () => {
    expect(() =>
      EnvSchema.parse({ CODE_BASE_PATH: '' })
    ).toThrow();
  });

  it('rejects invalid LOG_LEVEL', () => {
    expect(() =>
      EnvSchema.parse({ LOG_LEVEL: 'verbose' })
    ).toThrow();
  });

  it('rejects invalid NODE_ENV', () => {
    expect(() =>
      EnvSchema.parse({ NODE_ENV: 'staging' })
    ).toThrow();
  });
});
