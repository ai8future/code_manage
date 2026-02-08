import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/projects/readme/route';

describe('GET /api/projects/readme', () => {
  it('returns 400 when path is missing', async () => {
    const request = new Request('http://localhost/api/projects/readme');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.detail).toBe('Path is required');
  });

  it('returns 403 for path traversal attempts', async () => {
    const request = new Request(
      'http://localhost/api/projects/readme?path=' + encodeURIComponent('/Users/cliff/Desktop/_code/../../../etc')
    );
    const response = await GET(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.detail).toBe('Invalid path');
  });

  it('returns 403 for paths outside CODE_BASE_PATH', async () => {
    const request = new Request(
      'http://localhost/api/projects/readme?path=' + encodeURIComponent('/tmp')
    );
    const response = await GET(request);

    expect(response.status).toBe(403);
  });

  it('returns 404 when README not found in valid path', async () => {
    const request = new Request(
      'http://localhost/api/projects/readme?path=' + encodeURIComponent('/Users/cliff/Desktop/_code/__nonexistent_folder__')
    );
    const response = await GET(request);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.detail).toBe('README not found');
  });
});
