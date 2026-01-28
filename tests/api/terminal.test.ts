import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/terminal/route';

describe('POST /api/terminal', () => {
  it('returns 400 when command is missing', async () => {
    const request = new Request('http://localhost/api/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Command is required');
  });

  it('returns 403 for disallowed commands', async () => {
    const request = new Request('http://localhost/api/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'rm -rf /' }),
    });
    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('not allowed');
  });

  it('returns 403 for invalid cwd outside CODE_BASE_PATH', async () => {
    const request = new Request('http://localhost/api/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'ls', cwd: '/etc' }),
    });
    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('within');
  });

  it('allows whitelisted commands', async () => {
    const request = new Request('http://localhost/api/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'pwd' }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('stdout');
    expect(data).toHaveProperty('exitCode');
  });
});
