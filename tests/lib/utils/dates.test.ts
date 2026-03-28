import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeDate, formatShortDate } from '@/lib/utils/dates';

describe('formatRelativeDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Today" for the current date', () => {
    expect(formatRelativeDate('2026-06-15T08:00:00Z')).toBe('Today');
  });

  it('returns "Yesterday" for 1 day ago', () => {
    expect(formatRelativeDate('2026-06-14T12:00:00Z')).toBe('Yesterday');
  });

  it('returns "N days ago" for 2-6 days', () => {
    expect(formatRelativeDate('2026-06-12T12:00:00Z')).toBe('3 days ago');
  });

  it('returns "N weeks ago" for 7-29 days', () => {
    expect(formatRelativeDate('2026-06-01T12:00:00Z')).toBe('2 weeks ago');
  });

  it('returns "N months ago" for 30-364 days', () => {
    expect(formatRelativeDate('2026-03-15T12:00:00Z')).toBe('3 months ago');
  });

  it('returns "N years ago" for 365+ days', () => {
    expect(formatRelativeDate('2024-06-15T12:00:00Z')).toBe('2 years ago');
  });
});

describe('formatShortDate', () => {
  it('formats a date with month, day, and year', () => {
    const result = formatShortDate('2026-03-21T12:00:00Z');
    expect(result).toContain('Mar');
    expect(result).toContain('21');
    expect(result).toContain('2026');
  });

  it('formats a different date correctly', () => {
    const result = formatShortDate('2026-12-25T12:00:00Z');
    expect(result).toContain('Dec');
    expect(result).toContain('2026');
  });
});
