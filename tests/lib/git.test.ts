import { describe, it, expect } from 'vitest';
import { parseNumstatLine } from '@/lib/git';

describe('parseNumstatLine', () => {
  it('parses a standard numstat line with additions and removals', () => {
    const result = parseNumstatLine('42\t18\tsrc/index.ts');
    expect(result).toEqual({ added: 42, removed: 18 });
  });

  it('parses a line with zero additions', () => {
    const result = parseNumstatLine('0\t5\tlib/old.ts');
    expect(result).toEqual({ added: 0, removed: 5 });
  });

  it('parses a line with zero removals', () => {
    const result = parseNumstatLine('10\t0\tlib/new.ts');
    expect(result).toEqual({ added: 10, removed: 0 });
  });

  it('treats binary files (dashes) as zero changes', () => {
    const result = parseNumstatLine('-\t-\tassets/logo.png');
    expect(result).toEqual({ added: 0, removed: 0 });
  });

  it('returns null for a non-numstat line (commit header)', () => {
    expect(parseNumstatLine('abc1234 Initial commit')).toBeNull();
  });

  it('returns null for an empty line', () => {
    expect(parseNumstatLine('')).toBeNull();
  });

  it('returns null for a line with only whitespace', () => {
    expect(parseNumstatLine('   ')).toBeNull();
  });

  it('handles large numbers', () => {
    const result = parseNumstatLine('99999\t88888\tgenerated/big.json');
    expect(result).toEqual({ added: 99999, removed: 88888 });
  });

  it('handles tab-separated path with spaces', () => {
    const result = parseNumstatLine('3\t1\tpath with spaces/file.ts');
    expect(result).toEqual({ added: 3, removed: 1 });
  });
});
