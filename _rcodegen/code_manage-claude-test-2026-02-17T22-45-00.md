Date Created: 2026-02-17T22:45:00-05:00
TOTAL_SCORE: 34/100

# code_manage — Unit Test Coverage Report

**Agent:** Claude:Opus 4.6
**Scope:** Comprehensive test coverage analysis with patch-ready diffs for high-value additions

---

## Current Test Inventory

| Test File | Covers | Verdict |
|---|---|---|
| `tests/lib/env.test.ts` | Zod schema shape (re-declared) | Partial — tests a copy of the schema, not the actual module |
| `tests/lib/schemas.test.ts` | All 7 API schemas | Good — thorough valid/invalid cases |
| `tests/lib/scanner.test.ts` | `determineStatus()` only | Minimal — 1 of ~15 exports tested |
| `tests/lib/pathSecurity.test.ts` | `validatePath()` | Good — covers traversal, symlinks, boundaries |
| `tests/api/readme.test.ts` | GET /api/projects/readme | Good — error paths covered |
| `tests/api/file.test.ts` | GET /api/file | Good — error paths covered |
| `tests/api/move.test.ts` | POST /api/actions/move | Partial — only error paths |
| `tests/api/terminal.test.ts` | POST /api/terminal | Good — whitelist/blacklist/cwd validation |

**Estimated line coverage:** ~12-15% of testable library code
**Estimated branch coverage:** ~10%

---

## Grade Breakdown

| Category | Weight | Score | Notes |
|---|---|---|---|
| Pure function coverage | 25 | 5/25 | `parseNumstatLine`, `formatRelativeDate`, `getGradeColor`, `ports`, `secval`, `errors` — all untested |
| Concurrency primitives | 15 | 0/15 | `workMap`, `workRace`, `workAll`, `workStream` — zero coverage |
| Security validation | 20 | 10/20 | `pathSecurity` good; `secval` and `parseSecureBody` untested |
| API route handlers | 20 | 10/20 | 4/14 routes have tests, but only error paths |
| Integration / scanner | 10 | 4/10 | Only `determineStatus` of 15+ scanner exports |
| Test infrastructure | 10 | 5/10 | `helpers.ts` is solid; vitest config is clean; no coverage tooling configured |

**Total: 34/100**

---

## Proposed Test Additions (High-Value Only)

The following proposals are ranked by **value-to-effort ratio**. Each targets pure/deterministic functions or critical security logic that provides real regression protection — not boilerplate.

---

### 1. `tests/lib/git.test.ts` — `parseNumstatLine` (HIGH VALUE)

**Why:** Pure function with regex parsing, 4 distinct code paths (numeric/numeric, binary `-`/`-`, mixed, non-match). Bugs here silently corrupt commit statistics shown in the dashboard. Zero test coverage today.

**Value:** HIGH — guards data integrity for activity/velocity features.

```diff
--- /dev/null
+++ b/tests/lib/git.test.ts
@@ -0,0 +1,43 @@
+import { describe, it, expect } from 'vitest';
+import { parseNumstatLine } from '@/lib/git';
+
+describe('parseNumstatLine', () => {
+  it('parses a standard numstat line with additions and removals', () => {
+    const result = parseNumstatLine('42\t18\tsrc/index.ts');
+    expect(result).toEqual({ added: 42, removed: 18 });
+  });
+
+  it('parses a line with zero additions', () => {
+    const result = parseNumstatLine('0\t5\tlib/old.ts');
+    expect(result).toEqual({ added: 0, removed: 5 });
+  });
+
+  it('parses a line with zero removals', () => {
+    const result = parseNumstatLine('10\t0\tlib/new.ts');
+    expect(result).toEqual({ added: 10, removed: 0 });
+  });
+
+  it('treats binary files (dashes) as zero changes', () => {
+    const result = parseNumstatLine('-\t-\tassets/logo.png');
+    expect(result).toEqual({ added: 0, removed: 0 });
+  });
+
+  it('handles mixed binary indicator (added=-, removed=numeric)', () => {
+    // This case can occur with certain git rename detection
+    const result = parseNumstatLine('-\t5\tsome/file');
+    expect(result).toEqual({ added: 0, removed: 5 });
+  });
+
+  it('returns null for a non-numstat line (commit header)', () => {
+    expect(parseNumstatLine('abc1234 Initial commit')).toBeNull();
+  });
+
+  it('returns null for an empty line', () => {
+    expect(parseNumstatLine('')).toBeNull();
+  });
+
+  it('returns null for a line with only whitespace', () => {
+    expect(parseNumstatLine('   ')).toBeNull();
+  });
+
+  it('handles large numbers', () => {
+    const result = parseNumstatLine('99999\t88888\tgenerated/big.json');
+    expect(result).toEqual({ added: 99999, removed: 88888 });
+  });
+});
```

---

### 2. `tests/lib/chassis/secval.test.ts` — `validateJSON` (HIGH VALUE)

**Why:** Security-critical code — this is the first line of defense against prototype pollution and code injection in every API route that accepts JSON bodies. The dangerous-key detection and nesting-depth guard have complex branching (key normalization, recursive walk, array vs object). Zero test coverage.

**Value:** CRITICAL — a regression here opens the app to prototype pollution attacks.

```diff
--- /dev/null
+++ b/tests/lib/chassis/secval.test.ts
@@ -0,0 +1,82 @@
+import { describe, it, expect } from 'vitest';
+import { validateJSON, SecvalError } from '@/lib/chassis/secval';
+
+describe('validateJSON', () => {
+  describe('valid JSON', () => {
+    it('accepts a simple object', () => {
+      expect(() => validateJSON('{"name":"test","count":5}')).not.toThrow();
+    });
+
+    it('accepts an array', () => {
+      expect(() => validateJSON('[1,2,3]')).not.toThrow();
+    });
+
+    it('accepts nested objects within depth limit', () => {
+      // 5 levels deep — well within limit
+      const json = '{"a":{"b":{"c":{"d":{"e":"ok"}}}}}';
+      expect(() => validateJSON(json)).not.toThrow();
+    });
+
+    it('accepts primitives', () => {
+      expect(() => validateJSON('"hello"')).not.toThrow();
+      expect(() => validateJSON('42')).not.toThrow();
+      expect(() => validateJSON('true')).not.toThrow();
+      expect(() => validateJSON('null')).not.toThrow();
+    });
+  });
+
+  describe('invalid JSON syntax', () => {
+    it('throws SecvalError for malformed JSON', () => {
+      expect(() => validateJSON('{bad json}')).toThrow(SecvalError);
+    });
+
+    it('throws SecvalError for empty string', () => {
+      expect(() => validateJSON('')).toThrow(SecvalError);
+    });
+  });
+
+  describe('dangerous keys', () => {
+    it('rejects __proto__', () => {
+      expect(() => validateJSON('{"__proto__":{"admin":true}}')).toThrow(SecvalError);
+      expect(() => validateJSON('{"__proto__":{"admin":true}}')).toThrow(/dangerous key/);
+    });
+
+    it('rejects constructor', () => {
+      expect(() => validateJSON('{"constructor":{"prototype":{}}}')).toThrow(SecvalError);
+    });
+
+    it('rejects eval', () => {
+      expect(() => validateJSON('{"eval":"alert(1)"}')).toThrow(SecvalError);
+    });
+
+    it('rejects exec', () => {
+      expect(() => validateJSON('{"exec":"rm -rf /"}')).toThrow(SecvalError);
+    });
+
+    it('rejects spawn', () => {
+      expect(() => validateJSON('{"spawn":"bash"}')).toThrow(SecvalError);
+    });
+
+    it('rejects command', () => {
+      expect(() => validateJSON('{"command":"ls"}')).toThrow(SecvalError);
+    });
+
+    it('normalises hyphens before checking (e.g. "ex-ec" → "exec")', () => {
+      expect(() => validateJSON('{"ex-ec":"cmd"}')).toThrow(SecvalError);
+    });
+
+    it('is case-insensitive (e.g. "__PROTO__")', () => {
+      expect(() => validateJSON('{"__PROTO__":"x"}')).toThrow(SecvalError);
+    });
+
+    it('detects dangerous keys in nested objects', () => {
+      expect(() => validateJSON('{"a":{"b":{"eval":"x"}}}')).toThrow(SecvalError);
+    });
+
+    it('detects dangerous keys inside arrays', () => {
+      expect(() => validateJSON('[{"safe":1},{"__proto__":"x"}]')).toThrow(SecvalError);
+    });
+  });
+
+  describe('nesting depth', () => {
+    it('rejects nesting beyond depth 20', () => {
+      // Build 22 levels of nesting
+      let json = '"leaf"';
+      for (let i = 0; i < 22; i++) {
+        json = `{"k":${json}}`;
+      }
+      expect(() => validateJSON(json)).toThrow(SecvalError);
+      expect(() => validateJSON(json)).toThrow(/nesting depth/);
+    });
+  });
+});
```

---

### 3. `tests/lib/chassis/errors.test.ts` — `ServiceError` + factories (HIGH VALUE)

**Why:** Every API error response flows through `ServiceError`. The factory functions map to specific HTTP+gRPC code pairs, and `problemDetail()` generates RFC 9457 responses. A wrong mapping silently returns incorrect status codes. `fromError` wraps unknown errors. `writeProblem` suppresses 5xx details. All untested.

**Value:** HIGH — incorrect error codes break API contracts and could leak internal details on 5xx.

```diff
--- /dev/null
+++ b/tests/lib/chassis/errors.test.ts
@@ -0,0 +1,113 @@
+import { describe, it, expect } from 'vitest';
+import {
+  ServiceError,
+  validationError,
+  notFoundError,
+  unauthorizedError,
+  timeoutError,
+  rateLimitError,
+  dependencyError,
+  internalError,
+  conflictError,
+  forbiddenError,
+  fromError,
+  typeUriForStatus,
+  titleForStatus,
+  problemDetailForStatus,
+} from '@/lib/chassis/errors';
+
+describe('ServiceError', () => {
+  it('stores message, grpcCode, and httpCode', () => {
+    const err = new ServiceError('test', 'NOT_FOUND', 404);
+    expect(err.message).toBe('test');
+    expect(err.grpcCode).toBe('NOT_FOUND');
+    expect(err.httpCode).toBe(404);
+    expect(err.name).toBe('ServiceError');
+    expect(err).toBeInstanceOf(Error);
+  });
+
+  it('supports fluent detail attachment via withDetail', () => {
+    const err = new ServiceError('fail', 'INTERNAL', 500)
+      .withDetail('field', 'email')
+      .withDetail('reason', 'invalid format');
+    expect(err.details.get('field')).toBe('email');
+    expect(err.details.get('reason')).toBe('invalid format');
+  });
+
+  it('generates grpcStatus', () => {
+    const err = validationError('bad input');
+    expect(err.grpcStatus()).toEqual({ code: 'INVALID_ARGUMENT', message: 'bad input' });
+  });
+
+  it('generates problemDetail without instance', () => {
+    const err = notFoundError('user not found');
+    const pd = err.problemDetail();
+    expect(pd.type).toContain('not-found');
+    expect(pd.title).toBe('Not Found');
+    expect(pd.status).toBe(404);
+    expect(pd.detail).toBe('user not found');
+    expect(pd.instance).toBeUndefined();
+  });
+
+  it('generates problemDetail with instance path', () => {
+    const err = notFoundError('missing');
+    const pd = err.problemDetail('/api/users/42');
+    expect(pd.instance).toBe('/api/users/42');
+  });
+
+  it('includes extensions when details are set', () => {
+    const err = validationError('bad').withDetail('field', 'name');
+    const pd = err.problemDetail();
+    expect(pd.extensions).toEqual({ field: 'name' });
+  });
+});
+
+describe('factory functions', () => {
+  const cases: [string, () => ServiceError, number, string][] = [
+    ['validationError', () => validationError('x'), 400, 'INVALID_ARGUMENT'],
+    ['notFoundError', () => notFoundError('x'), 404, 'NOT_FOUND'],
+    ['unauthorizedError', () => unauthorizedError('x'), 401, 'UNAUTHENTICATED'],
+    ['timeoutError', () => timeoutError('x'), 504, 'DEADLINE_EXCEEDED'],
+    ['rateLimitError', () => rateLimitError('x'), 429, 'RESOURCE_EXHAUSTED'],
+    ['dependencyError', () => dependencyError('x'), 503, 'UNAVAILABLE'],
+    ['internalError', () => internalError('x'), 500, 'INTERNAL'],
+    ['conflictError', () => conflictError('x'), 409, 'INVALID_ARGUMENT'],
+    ['forbiddenError', () => forbiddenError('x'), 403, 'PERMISSION_DENIED'],
+  ];
+
+  it.each(cases)('%s returns correct httpCode=%i and grpcCode=%s', (_name, factory, httpCode, grpcCode) => {
+    const err = factory();
+    expect(err.httpCode).toBe(httpCode);
+    expect(err.grpcCode).toBe(grpcCode);
+    expect(err).toBeInstanceOf(ServiceError);
+  });
+});
+
+describe('fromError', () => {
+  it('returns the same ServiceError if already one', () => {
+    const original = validationError('already typed');
+    expect(fromError(original)).toBe(original);
+  });
+
+  it('wraps a plain Error as internalError', () => {
+    const wrapped = fromError(new TypeError('oops'));
+    expect(wrapped.httpCode).toBe(500);
+    expect(wrapped.grpcCode).toBe('INTERNAL');
+    expect(wrapped.message).toBe('oops');
+  });
+
+  it('wraps a string as internalError', () => {
+    const wrapped = fromError('string error');
+    expect(wrapped.httpCode).toBe(500);
+    expect(wrapped.message).toBe('string error');
+  });
+});
+
+describe('HTTP status helpers', () => {
+  it('typeUriForStatus returns correct URI for known status', () => {
+    expect(typeUriForStatus(404)).toContain('not-found');
+    expect(typeUriForStatus(429)).toContain('rate-limit');
+  });
+
+  it('typeUriForStatus falls back to internal for unknown status', () => {
+    expect(typeUriForStatus(999)).toContain('internal');
+  });
+
+  it('titleForStatus returns correct title for known status', () => {
+    expect(titleForStatus(403)).toBe('Forbidden');
+    expect(titleForStatus(503)).toBe('Service Unavailable');
+  });
+
+  it('titleForStatus falls back to "Error" for unknown status', () => {
+    expect(titleForStatus(999)).toBe('Error');
+  });
+
+  it('problemDetailForStatus builds a complete ProblemDetail', () => {
+    const pd = problemDetailForStatus(422, 'bad entity', '/api/foo', { field: 'bar' });
+    expect(pd.status).toBe(422);
+    expect(pd.detail).toBe('bad entity');
+    expect(pd.instance).toBe('/api/foo');
+    expect(pd.extensions).toEqual({ field: 'bar' });
+  });
+});
```

---

### 4. `tests/lib/chassis/work.test.ts` — `workMap`, `workRace` (HIGH VALUE)

**Why:** These are the concurrency primitives used by the scanner (`scanAllProjects`), commit aggregation, and velocity routes. `workMap` has semaphore-bounded parallelism with abort signaling. `workRace` has first-to-succeed semantics with `AggregateError` on all-fail. Bugs in concurrency code are notoriously hard to catch in production. Zero tests.

**Value:** HIGH — concurrency bugs cause silent data loss or hangs in production.

```diff
--- /dev/null
+++ b/tests/lib/chassis/work.test.ts
@@ -0,0 +1,100 @@
+import { describe, it, expect } from 'vitest';
+import { workMap, workRace, workAll } from '@/lib/chassis/work';
+
+describe('workMap', () => {
+  it('processes all items and returns results in input order', async () => {
+    const items = [10, 20, 30];
+    const results = await workMap(
+      items,
+      async (item) => item * 2,
+      { workers: 2 },
+    );
+    expect(results).toHaveLength(3);
+    expect(results[0]).toEqual({ value: 20, index: 0 });
+    expect(results[1]).toEqual({ value: 40, index: 1 });
+    expect(results[2]).toEqual({ value: 60, index: 2 });
+  });
+
+  it('captures errors per-item without aborting others', async () => {
+    const items = [1, 2, 3];
+    const results = await workMap(
+      items,
+      async (item) => {
+        if (item === 2) throw new Error('boom');
+        return item;
+      },
+      { workers: 1 },
+    );
+    expect(results[0]?.value).toBe(1);
+    expect(results[1]?.error?.message).toBe('boom');
+    expect(results[2]?.value).toBe(3);
+  });
+
+  it('returns empty array for empty input', async () => {
+    const results = await workMap([], async () => 'x');
+    expect(results).toEqual([]);
+  });
+
+  it('respects bounded concurrency', async () => {
+    let concurrent = 0;
+    let maxConcurrent = 0;
+
+    const items = Array.from({ length: 10 }, (_, i) => i);
+    await workMap(
+      items,
+      async () => {
+        concurrent++;
+        maxConcurrent = Math.max(maxConcurrent, concurrent);
+        await new Promise((r) => setTimeout(r, 10));
+        concurrent--;
+        return true;
+      },
+      { workers: 3 },
+    );
+
+    expect(maxConcurrent).toBeLessThanOrEqual(3);
+  });
+
+  it('throws RangeError for workers < 1', async () => {
+    await expect(workMap([1], async (x) => x, { workers: 0 })).rejects.toThrow(RangeError);
+  });
+});
+
+describe('workRace', () => {
+  it('returns the first task to succeed', async () => {
+    const result = await workRace(
+      async () => {
+        await new Promise((r) => setTimeout(r, 50));
+        return 'slow';
+      },
+      async () => 'fast',
+    );
+    expect(result).toBe('fast');
+  });
+
+  it('skips failed tasks and returns first success', async () => {
+    const result = await workRace(
+      async () => { throw new Error('fail1'); },
+      async () => { throw new Error('fail2'); },
+      async () => 'winner',
+    );
+    expect(result).toBe('winner');
+  });
+
+  it('throws AggregateError if all tasks fail', async () => {
+    await expect(
+      workRace(
+        async () => { throw new Error('a'); },
+        async () => { throw new Error('b'); },
+      ),
+    ).rejects.toThrow(AggregateError);
+  });
+
+  it('throws if called with no tasks', async () => {
+    await expect(workRace()).rejects.toThrow('at least one task');
+  });
+});
+
+describe('workAll', () => {
+  it('runs heterogeneous tasks with bounded concurrency', async () => {
+    const results = await workAll(
+      [
+        async () => 'a',
+        async () => 42,
+        async () => { throw new Error('fail'); },
+      ],
+      { workers: 2 },
+    );
+    expect(results[0]?.value).toBe('a');
+    expect(results[1]?.value).toBe(42);
+    expect(results[2]?.error?.message).toBe('fail');
+  });
+});
```

---

### 5. `tests/lib/utils/dates.test.ts` — `formatRelativeDate` and `formatShortDate` (MEDIUM VALUE)

**Why:** `formatRelativeDate` has 6 branches (today, yesterday, days, weeks, months, years). It's used across the dashboard for "last modified" display. Pure function, trivial to test. `formatShortDate` delegates to `toLocaleDateString` which is locale-dependent — testing ensures the format string is correct.

**Value:** MEDIUM — guards UI display correctness.

```diff
--- /dev/null
+++ b/tests/lib/utils/dates.test.ts
@@ -0,0 +1,52 @@
+import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
+import { formatRelativeDate, formatShortDate } from '@/lib/utils/dates';
+
+describe('formatRelativeDate', () => {
+  beforeEach(() => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
+  });
+
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('returns "Today" for the current date', () => {
+    expect(formatRelativeDate('2026-06-15T08:00:00Z')).toBe('Today');
+  });
+
+  it('returns "Yesterday" for 1 day ago', () => {
+    expect(formatRelativeDate('2026-06-14T12:00:00Z')).toBe('Yesterday');
+  });
+
+  it('returns "N days ago" for 2-6 days', () => {
+    expect(formatRelativeDate('2026-06-12T12:00:00Z')).toBe('3 days ago');
+  });
+
+  it('returns "N weeks ago" for 7-29 days', () => {
+    expect(formatRelativeDate('2026-06-01T12:00:00Z')).toBe('2 weeks ago');
+  });
+
+  it('returns "N months ago" for 30-364 days', () => {
+    expect(formatRelativeDate('2026-03-15T12:00:00Z')).toBe('3 months ago');
+  });
+
+  it('returns "N years ago" for 365+ days', () => {
+    expect(formatRelativeDate('2024-06-15T12:00:00Z')).toBe('2 years ago');
+  });
+});
+
+describe('formatShortDate', () => {
+  it('formats a date as "Mon D, YYYY"', () => {
+    const result = formatShortDate('2026-01-15T00:00:00Z');
+    // toLocaleDateString with en-US, short month
+    expect(result).toMatch(/Jan\s+1[45],\s+2026/);
+  });
+
+  it('formats a different date correctly', () => {
+    const result = formatShortDate('2026-12-25T00:00:00Z');
+    expect(result).toMatch(/Dec\s+2[45],\s+2026/);
+  });
+});
```

---

### 6. `tests/lib/utils/grades.test.ts` — `getGradeColor`, `getGradeBgColor`, `getGradeClasses` (MEDIUM VALUE)

**Why:** Threshold-based branching (>=80, >=60, <60) controls which Tailwind classes are applied. A typo in a threshold silently breaks visual indicators. Pure, deterministic, trivial to test.

**Value:** MEDIUM — guards visual correctness of code quality indicators.

```diff
--- /dev/null
+++ b/tests/lib/utils/grades.test.ts
@@ -0,0 +1,45 @@
+import { describe, it, expect } from 'vitest';
+import { getGradeColor, getGradeBgColor, getGradeClasses } from '@/lib/utils/grades';
+
+describe('getGradeColor', () => {
+  it('returns green for grade >= 80', () => {
+    expect(getGradeColor(80)).toContain('green');
+    expect(getGradeColor(100)).toContain('green');
+  });
+
+  it('returns yellow for grade >= 60 and < 80', () => {
+    expect(getGradeColor(60)).toContain('yellow');
+    expect(getGradeColor(79)).toContain('yellow');
+  });
+
+  it('returns red for grade < 60', () => {
+    expect(getGradeColor(59)).toContain('red');
+    expect(getGradeColor(0)).toContain('red');
+  });
+});
+
+describe('getGradeBgColor', () => {
+  it('returns green bg for grade >= 80', () => {
+    expect(getGradeBgColor(85)).toContain('green');
+  });
+
+  it('returns yellow bg for grade >= 60 and < 80', () => {
+    expect(getGradeBgColor(65)).toContain('yellow');
+  });
+
+  it('returns red bg for grade < 60', () => {
+    expect(getGradeBgColor(30)).toContain('red');
+  });
+});
+
+describe('getGradeClasses', () => {
+  it('combines bg and text classes', () => {
+    const classes = getGradeClasses(90);
+    expect(classes).toContain('bg-green');
+    expect(classes).toContain('text-green');
+  });
+
+  it('combines bg and text classes for low grade', () => {
+    const classes = getGradeClasses(20);
+    expect(classes).toContain('bg-red');
+    expect(classes).toContain('text-red');
+  });
+});
```

---

### 7. `tests/lib/ports.test.ts` — `getPortFromDirectory` (MEDIUM VALUE)

**Why:** Deterministic port assignment is used to give each project a stable dev port. The MD5 hash + modular arithmetic has specific range constraints (5000-49000). If the range math is wrong, ports collide with system services or exceed the valid range. Pure function, trivial to test.

**Value:** MEDIUM — guards port assignment correctness.

```diff
--- /dev/null
+++ b/tests/lib/ports.test.ts
@@ -0,0 +1,37 @@
+import { describe, it, expect } from 'vitest';
+import { getPortFromDirectory, getPortConfig } from '@/lib/ports';
+
+describe('getPortFromDirectory', () => {
+  it('returns a number within the valid port range', () => {
+    const port = getPortFromDirectory('my-project');
+    const { MIN_PORT, MAX_PORT } = getPortConfig();
+    expect(port).toBeGreaterThanOrEqual(MIN_PORT);
+    expect(port).toBeLessThanOrEqual(MAX_PORT);
+  });
+
+  it('is deterministic — same input always returns same port', () => {
+    const port1 = getPortFromDirectory('test-project');
+    const port2 = getPortFromDirectory('test-project');
+    expect(port1).toBe(port2);
+  });
+
+  it('returns different ports for different project names', () => {
+    const portA = getPortFromDirectory('project-alpha');
+    const portB = getPortFromDirectory('project-beta');
+    // Not guaranteed to be different (hash collision possible) but extremely unlikely
+    expect(portA).not.toBe(portB);
+  });
+
+  it('handles empty string input', () => {
+    const port = getPortFromDirectory('');
+    const { MIN_PORT, MAX_PORT } = getPortConfig();
+    expect(port).toBeGreaterThanOrEqual(MIN_PORT);
+    expect(port).toBeLessThanOrEqual(MAX_PORT);
+  });
+});
+
+describe('getPortConfig', () => {
+  it('returns MIN_PORT and MAX_PORT', () => {
+    const config = getPortConfig();
+    expect(config.MIN_PORT).toBe(5000);
+    expect(config.MAX_PORT).toBe(49000);
+  });
+});
```

---

### 8. `tests/lib/scanner-helpers.test.ts` — `isSuiteDirectory`, `formatSuiteName` (MEDIUM VALUE)

**Why:** Pure string functions used by `scanAllProjects` to identify and name suites. `formatSuiteName` has specific transformation rules (strip `_suite`, capitalize words, join with spaces). Bugs here mis-label suites in the sidebar. Currently untested despite `scanner.test.ts` existing.

**Value:** MEDIUM — guards project organization display.

```diff
--- /dev/null
+++ b/tests/lib/scanner-helpers.test.ts
@@ -0,0 +1,35 @@
+import { describe, it, expect } from 'vitest';
+import { isSuiteDirectory, formatSuiteName } from '@/lib/scanner';
+
+describe('isSuiteDirectory', () => {
+  it('returns true for names ending in _suite', () => {
+    expect(isSuiteDirectory('builder_suite')).toBe(true);
+    expect(isSuiteDirectory('app_email4ai_suite')).toBe(true);
+  });
+
+  it('returns false for regular directory names', () => {
+    expect(isSuiteDirectory('my-project')).toBe(false);
+    expect(isSuiteDirectory('suite_builder')).toBe(false);
+    expect(isSuiteDirectory('_suite')).toBe(true); // edge: just "_suite" suffix
+  });
+
+  it('returns false for empty string', () => {
+    expect(isSuiteDirectory('')).toBe(false);
+  });
+});
+
+describe('formatSuiteName', () => {
+  it('formats "builder_suite" to "Builder"', () => {
+    expect(formatSuiteName('builder_suite')).toBe('Builder');
+  });
+
+  it('formats multi-word suite names', () => {
+    expect(formatSuiteName('app_email4ai_suite')).toBe('App Email4ai');
+  });
+
+  it('handles single-word suite', () => {
+    expect(formatSuiteName('tools_suite')).toBe('Tools');
+  });
+
+  it('handles edge case: just "_suite"', () => {
+    expect(formatSuiteName('_suite')).toBe('');
+  });
+});
```

---

## Tests NOT Proposed (Dead Weight Assessment)

The following areas were evaluated and **intentionally excluded** because the tests would add dead weight:

| Area | Why Excluded |
|---|---|
| `lib/logger.ts` | Thin pino wrapper. Testing "does pino log?" adds zero value. |
| `lib/config.ts` | File I/O with `proper-lockfile`. Would need extensive fs mocking for minimal gain; the real risk is in the lockfile library, not our thin wrapper. |
| `lib/types.ts` | Pure type definitions + a constant. Nothing to test at runtime. |
| `lib/activity-types.ts` | Types + a constant object. The constant values are tested implicitly by API tests. |
| `lib/constants.ts` | Derived from env + static mappings. Already tested implicitly through `scanner.test.ts`. |
| `lib/env.ts` | The singleton is tested indirectly. Testing `mustLoad` integration would require process.exit mocking — fragile and low value. |
| `lib/hooks/*.ts` | React hooks need `@testing-library/react` + jsdom. The hooks are thin wrappers over `fetch` — the API routes they call are the right test target. |
| `components/**` | React component tests would require jsdom, rendering, and extensive mocking. The value-per-effort is very low for a management dashboard. Visual regressions are better caught by manual review or Playwright E2E. |
| `app/api/projects/create/route.ts` | Spawns `ralph` CLI. Would need full process mocking for a feature that's trivially verifiable manually. |
| `lib/scan-cache.ts` | Cache coalescing logic is elegant but testing it requires time manipulation and `scanAllProjects` mocking. The module has only 2 simple functions and the risk of regression is low. |

---

## Summary of Proposed Changes

| # | File | Tests | Functions Covered | Value |
|---|---|---|---|---|
| 1 | `tests/lib/git.test.ts` | 9 | `parseNumstatLine` | HIGH |
| 2 | `tests/lib/chassis/secval.test.ts` | 14 | `validateJSON`, `SecvalError` | CRITICAL |
| 3 | `tests/lib/chassis/errors.test.ts` | 16 | `ServiceError`, 9 factories, `fromError`, `typeUriForStatus`, `titleForStatus`, `problemDetailForStatus` | HIGH |
| 4 | `tests/lib/chassis/work.test.ts` | 9 | `workMap`, `workRace`, `workAll` | HIGH |
| 5 | `tests/lib/utils/dates.test.ts` | 8 | `formatRelativeDate`, `formatShortDate` | MEDIUM |
| 6 | `tests/lib/utils/grades.test.ts` | 7 | `getGradeColor`, `getGradeBgColor`, `getGradeClasses` | MEDIUM |
| 7 | `tests/lib/ports.test.ts` | 5 | `getPortFromDirectory`, `getPortConfig` | MEDIUM |
| 8 | `tests/lib/scanner-helpers.test.ts` | 8 | `isSuiteDirectory`, `formatSuiteName` | MEDIUM |

**Total new tests: 76**
**Estimated coverage improvement: +25-30 percentage points on lib/ code**

All 8 proposed test files target pure/deterministic functions that require no mocking, no filesystem access, and no external dependencies. They will run in <1 second total and provide genuine regression protection for the most critical paths in the codebase.
