import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseBody, parseSecureBody } from '@/lib/api/validate';

const TestSchema = z.object({
  name: z.string().min(1),
  count: z.number().int().positive(),
});

describe('parseBody', () => {
  it('returns success with parsed data for valid input', () => {
    const result = parseBody(TestSchema, { name: 'test', count: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: 'test', count: 5 });
    }
  });

  it('returns failure response for invalid input', () => {
    const result = parseBody(TestSchema, { name: '', count: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
    }
  });

  it('returns failure for wrong types', () => {
    const result = parseBody(TestSchema, { name: 123, count: 'abc' });
    expect(result.success).toBe(false);
  });

  it('returns failure for missing required fields', () => {
    const result = parseBody(TestSchema, {});
    expect(result.success).toBe(false);
  });

  it('strips unknown keys via Zod behavior', () => {
    const result = parseBody(TestSchema, { name: 'test', count: 1, extra: 'ignored' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: 'test', count: 1 });
    }
  });
});

describe('parseSecureBody', () => {
  it('parses valid JSON string against schema', () => {
    const result = parseSecureBody(TestSchema, '{"name":"hello","count":10}');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('hello');
      expect(result.data.count).toBe(10);
    }
  });

  it('rejects invalid JSON syntax', () => {
    const result = parseSecureBody(TestSchema, '{not json}');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
    }
  });

  it('rejects prototype pollution attempts', () => {
    const result = parseSecureBody(TestSchema, '{"__proto__":{"admin":true},"name":"x","count":1}');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
    }
  });

  it('rejects constructor pollution', () => {
    const result = parseSecureBody(TestSchema, '{"constructor":{"prototype":{"admin":true}},"name":"x","count":1}');
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = parseSecureBody(TestSchema, '');
    expect(result.success).toBe(false);
  });
});
