import { describe, it, expect, beforeEach } from 'vitest';
import {
  trackRequestStart,
  trackRequestEnd,
  inflightRequests,
  takeHealthSnapshot,
} from '@/lib/diagnostics';

describe('inflight request tracking', () => {
  beforeEach(() => {
    inflightRequests.clear();
  });

  it('trackRequestStart adds an entry', () => {
    const key = trackRequestStart('/api/projects', 'req-abc');
    expect(inflightRequests.has(key)).toBe(true);

    const entry = inflightRequests.get(key)!;
    expect(entry.route).toBe('/api/projects');
    expect(entry.requestId).toBe('req-abc');
    expect(entry.startedAt).toBeGreaterThan(0);
  });

  it('trackRequestStart works without requestId', () => {
    const key = trackRequestStart('/api/search');
    const entry = inflightRequests.get(key)!;
    expect(entry.route).toBe('/api/search');
    expect(entry.requestId).toBeUndefined();
  });

  it('trackRequestEnd removes the entry', () => {
    const key = trackRequestStart('/api/search');
    expect(inflightRequests.size).toBeGreaterThanOrEqual(1);

    trackRequestEnd(key);
    expect(inflightRequests.has(key)).toBe(false);
  });

  it('generates unique keys for concurrent requests', () => {
    const key1 = trackRequestStart('/api/projects');
    const key2 = trackRequestStart('/api/search');
    const key3 = trackRequestStart('/api/health');

    expect(key1).not.toBe(key2);
    expect(key2).not.toBe(key3);
    expect(key1).not.toBe(key3);

    // All three should be tracked
    expect(inflightRequests.has(key1)).toBe(true);
    expect(inflightRequests.has(key2)).toBe(true);
    expect(inflightRequests.has(key3)).toBe(true);

    trackRequestEnd(key1);
    trackRequestEnd(key2);
    trackRequestEnd(key3);
  });

  it('trackRequestEnd is idempotent for non-existent keys', () => {
    // Should not throw
    trackRequestEnd('non-existent-key');
  });
});

describe('takeHealthSnapshot', () => {
  it('returns a complete snapshot with expected fields', () => {
    const snap = takeHealthSnapshot();
    expect(snap.rssBytes).toBeGreaterThan(0);
    expect(snap.rssMB).toBeGreaterThan(0);
    expect(snap.heapUsedBytes).toBeGreaterThan(0);
    expect(snap.heapTotalBytes).toBeGreaterThan(0);
    expect(snap.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(snap.pid).toBe(process.pid);
    expect(typeof snap.inflightCount).toBe('number');
    expect(typeof snap.externalBytes).toBe('number');
  });

  it('reflects inflight request count', () => {
    inflightRequests.clear();
    const snap1 = takeHealthSnapshot();
    expect(snap1.inflightCount).toBe(0);

    const key = trackRequestStart('/api/test');
    const snap2 = takeHealthSnapshot();
    expect(snap2.inflightCount).toBe(1);

    trackRequestEnd(key);
    const snap3 = takeHealthSnapshot();
    expect(snap3.inflightCount).toBe(0);
  });
});
