import { describe, it, expect } from 'vitest';
import { conflictError, pathErrorResponse } from '@/lib/api/errors';

describe('conflictError', () => {
  it('creates a ServiceError with 409 status', () => {
    const err = conflictError('Resource already exists');
    expect(err.httpCode).toBe(409);
    expect(err.message).toBe('Resource already exists');
  });

  it('has INVALID_ARGUMENT gRPC code', () => {
    const err = conflictError('duplicate');
    expect(err.grpcCode).toBe('INVALID_ARGUMENT');
  });

  it('is an instance of Error', () => {
    const err = conflictError('test');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('pathErrorResponse', () => {
  it('returns RFC 9457 problem+json for 403', async () => {
    const response = pathErrorResponse('Invalid path', 403, '/api/file');
    expect(response.status).toBe(403);

    const data = await response.json();
    expect(data.status).toBe(403);
    expect(data.detail).toBe('Invalid path');
    expect(data.instance).toBe('/api/file');
    expect(data.type).toBeDefined();
    expect(data.title).toBeDefined();
  });

  it('returns RFC 9457 problem+json for 404', async () => {
    const response = pathErrorResponse('Not found', 404);
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.status).toBe(404);
    expect(data.detail).toBe('Not found');
    expect(data.instance).toBeUndefined();
  });

  it('sets content-type header to application/problem+json', () => {
    const response = pathErrorResponse('err', 400);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
  });

  it('includes title and type for known status codes', async () => {
    const response = pathErrorResponse('test', 400);
    const data = await response.json();
    expect(data.title).toBeTruthy();
    expect(data.type).toBeTruthy();
  });
});
