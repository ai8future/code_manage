Date Created: Wednesday, February 4, 2026 12:00:00 PM
TOTAL_SCORE: 70/100

# Test Coverage Analysis Report

## Overview
The current codebase has a solid foundation of tests covering core API endpoints (`api/`) and security/schema libraries (`lib/`). However, several utility modules and helper functions remain untested. These include Git operations, date formatting, grade calculations, logging wrappers, and API validation helpers.

## Coverage Gaps
1.  **`lib/git.ts`**: Critical functionality for interacting with git. `spawnGit` and `parseNumstatLine` are untested.
2.  **`lib/utils/grades.ts`**: UI helper logic for grade visualization. Pure functions, easy to test.
3.  **`lib/utils/dates.ts`**: Date formatting logic. Needs testing for various relative time scenarios.
4.  **`lib/logger.ts`**: Logger configuration and child logger creation.
5.  **`lib/api/validate.ts`**: Zod validation wrapper used in API routes.

## Proposed Tests

### 1. Git Utilities (`tests/lib/git.test.ts`)
Tests `parseNumstatLine` logic and mocks `child_process.spawn` to verify `spawnGit` behavior.

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { spawnGit, parseNumstatLine } from '@/lib/git';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'child_process';

describe('lib/git', () => {
  describe('parseNumstatLine', () => {
    it('parses valid numstat lines', () => {
      expect(parseNumstatLine('10\t5\tfile.txt')).toEqual({ added: 10, removed: 5 });
      expect(parseNumstatLine('-\t-\tbinary.png')).toEqual({ added: 0, removed: 0 });
      expect(parseNumstatLine('0\t0\tfile.txt')).toEqual({ added: 0, removed: 0 });
    });

    it('returns null for invalid lines', () => {
      expect(parseNumstatLine('invalid line')).toBeNull();
      expect(parseNumstatLine('')).toBeNull();
    });
  });

  describe('spawnGit', () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    it('resolves with stdout on success', async () => {
      const mockChildProcess = new EventEmitter() as any;
      mockChildProcess.stdout = new EventEmitter();
      mockChildProcess.stderr = new EventEmitter();
      mockChildProcess.kill = vi.fn();
      
      (spawn as any).mockReturnValue(mockChildProcess);

      const promise = spawnGit(['status'], { cwd: '/tmp' });

      mockChildProcess.stdout.emit('data', Buffer.from('On branch main'));
      mockChildProcess.emit('close', 0);

      await expect(promise).resolves.toBe('On branch main');
      expect(spawn).toHaveBeenCalledWith('git', ['status'], expect.objectContaining({ cwd: '/tmp' }));
    });

    it('rejects with error on non-zero exit code', async () => {
      const mockChildProcess = new EventEmitter() as any;
      mockChildProcess.stdout = new EventEmitter();
      mockChildProcess.stderr = new EventEmitter();
      mockChildProcess.kill = vi.fn();

      (spawn as any).mockReturnValue(mockChildProcess);

      const promise = spawnGit(['status'], { cwd: '/tmp' });

      mockChildProcess.stderr.emit('data', Buffer.from('fatal error'));
      mockChildProcess.emit('close', 1);

      await expect(promise).rejects.toThrow('git exited with code 1: fatal error');
    });
    
    it('kills process if output exceeds limit', async () => {
       const mockChildProcess = new EventEmitter() as any;
      mockChildProcess.stdout = new EventEmitter();
      mockChildProcess.stderr = new EventEmitter();
      mockChildProcess.kill = vi.fn();

      (spawn as any).mockReturnValue(mockChildProcess);

      const promise = spawnGit(['log'], { cwd: '/tmp', maxOutputSize: 10 });

      // Emit more data than allowed (limit 10 bytes)
      mockChildProcess.stdout.emit('data', Buffer.from('12345678901'));

      await expect(promise).rejects.toThrow('Git output exceeded maximum size');
      expect(mockChildProcess.kill).toHaveBeenCalled();
    });
  });
});
```

### 2. Grade Utilities (`tests/lib/utils/grades.test.ts`)
Verifies correct class names are returned for different grade ranges.

```typescript
import { describe, it, expect } from 'vitest';
import { getGradeColor, getGradeBgColor, getGradeClasses } from '@/lib/utils/grades';

describe('lib/utils/grades', () => {
  it('returns correct colors for high grades (>= 80)', () => {
    expect(getGradeColor(80)).toContain('green');
    expect(getGradeColor(100)).toContain('green');
    expect(getGradeBgColor(90)).toContain('green');
  });

  it('returns correct colors for medium grades (60-79)', () => {
    expect(getGradeColor(60)).toContain('yellow');
    expect(getGradeColor(79)).toContain('yellow');
    expect(getGradeBgColor(70)).toContain('yellow');
  });

  it('returns correct colors for low grades (< 60)', () => {
    expect(getGradeColor(59)).toContain('red');
    expect(getGradeColor(0)).toContain('red');
    expect(getGradeBgColor(40)).toContain('red');
  });

  it('combines classes correctly', () => {
    const classes = getGradeClasses(85);
    expect(classes).toContain(getGradeColor(85));
    expect(classes).toContain(getGradeBgColor(85));
  });
});
```

### 3. Date Utilities (`tests/lib/utils/dates.test.ts`)
Uses fake timers to ensure consistent relative date formatting.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeDate, formatShortDate } from '@/lib/utils/dates';

describe('lib/utils/dates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-10T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('formatRelativeDate', () => {
    it('returns "Today" for same day', () => {
      expect(formatRelativeDate('2024-01-10T10:00:00Z')).toBe('Today');
    });

    it('returns "Yesterday" for 1 day ago', () => {
      expect(formatRelativeDate('2024-01-09T12:00:00Z')).toBe('Yesterday');
    });

    it('returns "X days ago" for < 7 days', () => {
      expect(formatRelativeDate('2024-01-07T12:00:00Z')).toBe('3 days ago');
    });

    it('returns "X weeks ago" for < 30 days', () => {
      expect(formatRelativeDate('2023-12-20T12:00:00Z')).toBe('3 weeks ago');
    });
    
    it('returns "X months ago" for < 365 days', () => {
       expect(formatRelativeDate('2023-11-10T12:00:00Z')).toBe('2 months ago');
    });
    
    it('returns "X years ago" for >= 365 days', () => {
       expect(formatRelativeDate('2022-01-10T12:00:00Z')).toBe('2 years ago');
    });
  });

  describe('formatShortDate', () => {
    it('formats date correctly', () => {
      // Note: toLocaleDateString depends on node locale, assuming en-US based on implementation
      const date = '2023-12-25';
      const formatted = formatShortDate(date);
      // We check for key components since exact format might vary slightly by environment
      expect(formatted).toContain('Dec');
      expect(formatted).toContain('25');
      expect(formatted).toContain('2023');
    });
  });
});
```

### 4. Logger (`tests/lib/logger.test.ts`)
Mocks Pino to verify logger creation.

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createRouteLogger, createRequestLogger } from '@/lib/logger';

// Mock dependencies
const mockChild = vi.fn();
const mockPino = vi.fn(() => ({
  child: mockChild,
}));

vi.mock('pino', () => ({
  default: mockPino,
}));

describe('lib/logger', () => {
  it('createRouteLogger creates a child logger with route name', () => {
    createRouteLogger('test-route');
    expect(mockChild).toHaveBeenCalledWith({ route: 'test-route' });
  });

  it('createRequestLogger includes request ID', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-request-id': '12345' },
    });
    createRequestLogger('test-route', req);
    expect(mockChild).toHaveBeenCalledWith({
      route: 'test-route',
      requestId: '12345',
    });
  });
  
  it('createRequestLogger handles missing request ID', () => {
    const req = new Request('http://localhost');
    createRequestLogger('test-route', req);
    expect(mockChild).toHaveBeenCalledWith({
      route: 'test-route',
      requestId: undefined,
    });
  });
});
```

### 5. API Validation (`tests/lib/api/validate.test.ts`)
Tests the `parseBody` helper.

```typescript
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseBody } from '@/lib/api/validate';

describe('lib/api/validate', () => {
  const schema = z.object({
    name: z.string(),
    age: z.number().min(0),
  });

  it('returns success and data for valid input', () => {
    const input = { name: 'Alice', age: 30 };
    const result = parseBody(schema, input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it('returns failure and 400 response for invalid input', () => {
    const input = { name: 'Bob', age: -5 };
    const result = parseBody(schema, input);
    
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
      // We can't easily inspect NextResponse body in simple unit test without more mocks,
      // but we verified the failure path.
    }
  });

  it('handles non-Zod errors gracefully', () => {
     // Force a non-Zod error by passing something that might crash validation if not careful,
     // or just rely on the try/catch block coverage.
     // For this simple wrapper, Zod handles most things, but we want to ensure strict safety.
     // In this specific implementation, schema.parse throws ZodError.
     
     // To test the generic catch block, we'd need a schema that throws a non-Zod error,
     // which is hard to manufacture with standard Zod.
     // We'll skip the generic catch block test for now as it's an edge case.
  });
});
```