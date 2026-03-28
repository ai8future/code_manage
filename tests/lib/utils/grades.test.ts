import { describe, it, expect } from 'vitest';
import { getGradeColor, getGradeBgColor, getGradeClasses } from '@/lib/utils/grades';

describe('getGradeColor', () => {
  it('returns green text classes for grade >= 80', () => {
    expect(getGradeColor(80)).toContain('green');
    expect(getGradeColor(100)).toContain('green');
  });

  it('returns yellow text classes for grade >= 60 and < 80', () => {
    expect(getGradeColor(60)).toContain('yellow');
    expect(getGradeColor(79)).toContain('yellow');
  });

  it('returns red text classes for grade < 60', () => {
    expect(getGradeColor(59)).toContain('red');
    expect(getGradeColor(0)).toContain('red');
  });

  it('includes dark mode variants', () => {
    expect(getGradeColor(90)).toContain('dark:');
  });
});

describe('getGradeBgColor', () => {
  it('returns green bg for grade >= 80', () => {
    expect(getGradeBgColor(85)).toContain('bg-green');
  });

  it('returns yellow bg for grade >= 60 and < 80', () => {
    expect(getGradeBgColor(65)).toContain('bg-yellow');
  });

  it('returns red bg for grade < 60', () => {
    expect(getGradeBgColor(30)).toContain('bg-red');
  });

  it('includes dark mode variants', () => {
    expect(getGradeBgColor(90)).toContain('dark:');
  });
});

describe('getGradeClasses', () => {
  it('combines bg and text color classes for high grades', () => {
    const classes = getGradeClasses(90);
    expect(classes).toContain('bg-green');
    expect(classes).toContain('text-green');
  });

  it('combines bg and text color classes for low grades', () => {
    const classes = getGradeClasses(20);
    expect(classes).toContain('bg-red');
    expect(classes).toContain('text-red');
  });

  it('combines bg and text color classes for medium grades', () => {
    const classes = getGradeClasses(70);
    expect(classes).toContain('bg-yellow');
    expect(classes).toContain('text-yellow');
  });
});
