import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/actions/move/route';

describe('POST /api/actions/move', () => {
  it('returns 400 when required fields are missing', async () => {
    const request = new Request('http://localhost/api/actions/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'test' }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it('returns 403 for source path outside CODE_BASE_PATH', async () => {
    const request = new Request('http://localhost/api/actions/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'test',
        projectPath: '/etc/passwd',
        newStatus: 'icebox',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Invalid path');
  });

  it('returns 400 for invalid status', async () => {
    const request = new Request('http://localhost/api/actions/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'test',
        projectPath: '/Users/cliff/Desktop/_code/test-project',
        newStatus: 'invalid_status',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });
});
