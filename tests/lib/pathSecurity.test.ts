import { describe, it, expect } from 'vitest';
import { validatePath } from '@/lib/api/pathSecurity';

describe('validatePath', () => {
  it('accepts a valid path within CODE_BASE_PATH', async () => {
    // This directory exists on the dev machine
    const result = await validatePath('/Users/cliff/Desktop/_code/builder_suite/code_manage');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.resolvedPath).toContain('code_manage');
    }
  });

  it('rejects path outside CODE_BASE_PATH', async () => {
    const result = await validatePath('/etc/passwd');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.status).toBe(403);
      expect(result.error).toBe('Invalid path');
    }
  });

  it('rejects path traversal attempt', async () => {
    const result = await validatePath('/Users/cliff/Desktop/_code/../../../etc/passwd');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.status).toBe(403);
    }
  });

  it('returns 404 for non-existent path when requireExists is true', async () => {
    const result = await validatePath(
      '/Users/cliff/Desktop/_code/nonexistent-project-xyz-123',
      { requireExists: true },
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.status).toBe(404);
    }
  });

  it('allows non-existent path when requireExists is false', async () => {
    const result = await validatePath(
      '/Users/cliff/Desktop/_code/nonexistent-project-xyz-123',
      { requireExists: false },
    );
    expect(result.valid).toBe(true);
  });

  it('accepts CODE_BASE_PATH itself', async () => {
    const result = await validatePath('/Users/cliff/Desktop/_code');
    expect(result.valid).toBe(true);
  });

  it('rejects root path', async () => {
    const result = await validatePath('/');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.status).toBe(403);
    }
  });
});
