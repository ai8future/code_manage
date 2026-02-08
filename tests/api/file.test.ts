import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/file/route';

describe('GET /api/file', () => {
  it('returns 400 when path is missing', async () => {
    const request = new Request('http://localhost/api/file');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.detail).toBe('Path is required');
  });

  it('returns 403 for path traversal attempts', async () => {
    const request = new Request(
      'http://localhost/api/file?path=' + encodeURIComponent('/Users/cliff/Desktop/_code/../../../etc/passwd')
    );
    const response = await GET(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.detail).toBe('Invalid path');
  });

  it('returns 403 for paths outside CODE_BASE_PATH', async () => {
    const request = new Request(
      'http://localhost/api/file?path=' + encodeURIComponent('/etc/passwd')
    );
    const response = await GET(request);

    expect(response.status).toBe(403);
  });

  it('returns 404 for non-existent file within allowed path', async () => {
    const request = new Request(
      'http://localhost/api/file?path=' + encodeURIComponent('/Users/cliff/Desktop/_code/__nonexistent_test_file_12345__.txt')
    );
    const response = await GET(request);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.detail).toBe('File not found');
  });
});
