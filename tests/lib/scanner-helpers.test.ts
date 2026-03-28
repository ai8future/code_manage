import { describe, it, expect } from 'vitest';
import { isSuiteDirectory, formatSuiteName } from '@/lib/scanner';

describe('isSuiteDirectory', () => {
  it('returns true for names ending in _suite', () => {
    expect(isSuiteDirectory('builder_suite')).toBe(true);
    expect(isSuiteDirectory('app_email4ai_suite')).toBe(true);
  });

  it('returns false for regular directory names', () => {
    expect(isSuiteDirectory('my-project')).toBe(false);
    expect(isSuiteDirectory('suite_builder')).toBe(false);
  });

  it('returns true for edge case: just "_suite" suffix', () => {
    expect(isSuiteDirectory('_suite')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isSuiteDirectory('')).toBe(false);
  });

  it('returns false for "suite" without underscore prefix', () => {
    expect(isSuiteDirectory('suite')).toBe(false);
  });
});

describe('formatSuiteName', () => {
  it('formats "builder_suite" to "Builder"', () => {
    expect(formatSuiteName('builder_suite')).toBe('Builder');
  });

  it('formats multi-word suite names', () => {
    expect(formatSuiteName('app_email4ai_suite')).toBe('App Email4ai');
  });

  it('handles single-word suite', () => {
    expect(formatSuiteName('tools_suite')).toBe('Tools');
  });

  it('handles edge case: just "_suite"', () => {
    // "_suite" -> replace _suite -> "" -> split on _ -> [""] -> capitalize -> ""
    expect(formatSuiteName('_suite')).toBe('');
  });

  it('capitalizes each word segment', () => {
    expect(formatSuiteName('my_cool_project_suite')).toBe('My Cool Project');
  });
});
