Date Created: 2026-01-28 17:15:00
TOTAL_SCORE: 40/100

# Test Coverage Analysis

The current codebase has minimal test coverage. While there are some integration tests for API routes (`tests/api/`) and basic tests for `determineStatus` in `scanner.ts`, the bulk of the core logic and utility functions remain untested.

## Key Findings
1.  **Utilities Untested**: `lib/utils/dates.ts` and `lib/utils/grades.ts` contain pure functions that are critical for UI display but have zero test coverage.
2.  **Scanner Logic**: The `lib/scanner.ts` file contains complex logic for detecting tech stacks, git info, and descriptions. This logic relies on file system operations and is currently untested, making it fragile to changes.
3.  **API Tests**: Existing API tests are good but could be more comprehensive regarding edge cases.

## Recommendations
I propose adding unit tests for the utility functions and the complex scanner logic. I have mocked the file system interactions to make the scanner tests fast and reliable.

## Proposed Tests

### 1. Date Utilities Tests
New file: `tests/lib/utils/dates.test.ts`

```typescript
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { formatRelativeDate, formatShortDate } from '@/lib/utils/dates';

describe('dates utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('formatRelativeDate', () => {
    it('returns "Today" for current date', () => {
      const now = new Date('2024-01-01T12:00:00Z');
      vi.setSystemTime(now);
      expect(formatRelativeDate(now.toISOString())).toBe('Today');
    });

    it('returns "Yesterday" for 1 day ago', () => {
      const now = new Date('2024-01-02T12:00:00Z');
      vi.setSystemTime(now);
      const yesterday = new Date('2024-01-01T12:00:00Z');
      expect(formatRelativeDate(yesterday.toISOString())).toBe('Yesterday');
    });

    it('returns "X days ago" for 2-6 days ago', () => {
      const now = new Date('2024-01-10T12:00:00Z');
      vi.setSystemTime(now);
      const fiveDaysAgo = new Date('2024-01-05T12:00:00Z');
      expect(formatRelativeDate(fiveDaysAgo.toISOString())).toBe('5 days ago');
    });

    it('returns "X weeks ago" for 7-29 days ago', () => {
      const now = new Date('2024-02-01T12:00:00Z');
      vi.setSystemTime(now);
      const twoWeeksAgo = new Date('2024-01-15T12:00:00Z');
      expect(formatRelativeDate(twoWeeksAgo.toISOString())).toBe('2 weeks ago');
    });

    it('returns "X months ago" for 30-364 days ago', () => {
      const now = new Date('2024-06-01T12:00:00Z');
      vi.setSystemTime(now);
      const twoMonthsAgo = new Date('2024-04-01T12:00:00Z');
      expect(formatRelativeDate(twoMonthsAgo.toISOString())).toBe('2 months ago');
    });

    it('returns "X years ago" for >= 365 days', () => {
      const now = new Date('2026-01-01T12:00:00Z');
      vi.setSystemTime(now);
      const twoYearsAgo = new Date('2024-01-01T12:00:00Z');
      expect(formatRelativeDate(twoYearsAgo.toISOString())).toBe('2 years ago');
    });
  });

  describe('formatShortDate', () => {
    it('formats date correctly', () => {
      const date = '2024-01-25T10:00:00Z';
      expect(formatShortDate(date)).toBe('Jan 25, 2024');
    });
  });
});
```

### 2. Grade Utilities Tests
New file: `tests/lib/utils/grades.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { getGradeColor, getGradeBgColor, getGradeClasses } from '@/lib/utils/grades';

describe('grades utils', () => {
  describe('getGradeColor', () => {
    it('returns green for >= 80', () => {
      expect(getGradeColor(80)).toContain('text-green');
      expect(getGradeColor(100)).toContain('text-green');
    });

    it('returns yellow for 60-79', () => {
      expect(getGradeColor(60)).toContain('text-yellow');
      expect(getGradeColor(79)).toContain('text-yellow');
    });

    it('returns red for < 60', () => {
      expect(getGradeColor(59)).toContain('text-red');
      expect(getGradeColor(0)).toContain('text-red');
    });
  });

  describe('getGradeBgColor', () => {
    it('returns green bg for >= 80', () => {
      expect(getGradeBgColor(85)).toContain('bg-green');
    });

    it('returns yellow bg for 60-79', () => {
      expect(getGradeBgColor(70)).toContain('bg-yellow');
    });

    it('returns red bg for < 60', () => {
      expect(getGradeBgColor(30)).toContain('bg-red');
    });
  });

  describe('getGradeClasses', () => {
    it('combines color and background', () => {
      const classes = getGradeClasses(90);
      expect(classes).toContain('text-green');
      expect(classes).toContain('bg-green');
    });
  });
});
```

### 3. Scanner Logic Tests
New file: `tests/lib/scanner-extended.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectTechStack, extractDescription } from '@/lib/scanner';
import path from 'path';

// Mock fs
const mockReadFile = vi.fn();
const mockAccess = vi.fn();
const mockStat = vi.fn();

vi.mock('fs', () => ({
  promises: {
    readFile: (...args: any[]) => mockReadFile(...args),
    access: (...args: any[]) => mockAccess(...args),
    stat: (...args: any[]) => mockStat(...args),
  }
}));

describe('scanner extended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectTechStack', () => {
    it('detects Node.js when no specific framework found but package.json exists', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({
        dependencies: { 'lodash': '1.0.0' }
      }));
      
      const techs = await detectTechStack('/tmp/project');
      expect(techs).toContain('Node.js');
    });

    it('detects Next.js and React', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({
        dependencies: { 
          'next': '14.0.0', 
          'react': '18.0.0',
          'typescript': '5.0.0'
        }
      }));
      
      const techs = await detectTechStack('/tmp/project');
      expect(techs).toContain('Next.js');
      expect(techs).toContain('React');
      expect(techs).toContain('TypeScript');
      // Should sort by priority (Next.js 10 > React 9 > TS 6)
      expect(techs[0]).toBe('Next.js');
    });

    it('detects Python/FastAPI from requirements.txt', async () => {
      // Fail package.json read
      mockReadFile.mockImplementation((p) => {
        if (p.endsWith('package.json')) return Promise.reject('no file');
        if (p.endsWith('requirements.txt')) return Promise.resolve('fastapi==0.100.0\nuvicorn');
        return Promise.reject('no file');
      });
      
      // Mock existence checks
      mockAccess.mockImplementation((p) => {
        if (p.endsWith('requirements.txt')) return Promise.resolve();
        return Promise.reject('no file');
      });

      const techs = await detectTechStack('/tmp/project');
      expect(techs).toContain('Python');
      expect(techs).toContain('FastAPI');
    });
  });

  describe('extractDescription', () => {
    it('prioritizes package.json description', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({
        description: 'Package json description'
      }));

      const desc = await extractDescription('/tmp/project');
      expect(desc).toBe('Package json description');
    });

    it('falls back to README content', async () => {
      mockReadFile.mockImplementation((p) => {
        if (p.endsWith('package.json')) return Promise.resolve('{}');
        if (p.endsWith('README.md')) return Promise.resolve('# Title\n\nThis is the readme description.\n\nMore text.');
        return Promise.reject('no file');
      });

      const desc = await extractDescription('/tmp/project');
      expect(desc).toBe('This is the readme description.');
    });

    it('ignores badges and images in README', async () => {
      mockReadFile.mockImplementation((p) => {
        if (p.endsWith('package.json')) return Promise.resolve('{}');
        if (p.endsWith('README.md')) return Promise.resolve('# Title\n\n![Image](img.png)\n[![Badge](badge.svg)](link)\n\nReal description here.');
        return Promise.reject('no file');
      });

      const desc = await extractDescription('/tmp/project');
      expect(desc).toBe('Real description here.');
    });
  });
});
```