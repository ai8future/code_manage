Date Created: 2026-02-17T22:45:00-05:00
TOTAL_SCORE: 34/100

# Code Manage — Unit Test Audit Report

**Agent:** Claude:Opus 4.6
**Project:** code_manage v1.4.3
**Test Framework:** Vitest 4.0.18

---

## Executive Summary

The project has **8 test files** covering a small fraction of the codebase. Existing tests are well-written and focus on input validation and security boundaries, but vast areas of pure business logic have zero coverage. The `lib/chassis/` module (concurrency, security validation, error types) — arguably the most critical and testable code — is entirely untested. Utility functions, the git module, and most scanner functions are also uncovered.

**Estimated line coverage:** ~15-20%
**Estimated branch coverage:** ~12-18%

---

## Current Coverage Map

| Module | Test File | Coverage |
|--------|-----------|----------|
| `lib/schemas.ts` | `tests/lib/schemas.test.ts` | **Full** — all 7 schemas, 23 cases |
| `lib/api/pathSecurity.ts` | `tests/lib/pathSecurity.test.ts` | **Full** — 7 cases |
| `lib/env.ts` | `tests/lib/env.test.ts` | **Partial** — schema shape only |
| `lib/scanner.ts` | `tests/lib/scanner.test.ts` | **Minimal** — only `determineStatus()` (5 cases) |
| `app/api/file/route.ts` | `tests/api/file.test.ts` | **Partial** — error paths only |
| `app/api/actions/move/route.ts` | `tests/api/move.test.ts` | **Partial** — error paths only |
| `app/api/projects/readme/route.ts` | `tests/api/readme.test.ts` | **Partial** — error paths only |
| `app/api/terminal/route.ts` | `tests/api/terminal.test.ts` | **Good** — includes success case |
| `lib/chassis/errors.ts` | — | **None** |
| `lib/chassis/secval.ts` | — | **None** |
| `lib/chassis/work.ts` | — | **None** |
| `lib/git.ts` | — | **None** |
| `lib/ports.ts` | — | **None** |
| `lib/utils/dates.ts` | — | **None** |
| `lib/utils/grades.ts` | — | **None** |
| `lib/api/errors.ts` | — | **None** |
| `lib/api/validate.ts` | — | **None** |
| `lib/config.ts` | — | **None** |
| `lib/scan-cache.ts` | — | **None** |
| `lib/logger.ts` | — | **None** |

---

## Proposed Tests — Priority Order

### 1. `lib/chassis/secval.ts` — Security Validation (HIGH PRIORITY)

This module guards against prototype pollution and injection attacks. Zero coverage is a significant risk.

**Proposed file:** `tests/lib/chassis/secval.test.ts`
**Estimated cases:** 12

```diff
--- /dev/null
+++ b/tests/lib/chassis/secval.test.ts
@@ -0,0 +1,98 @@
+import { describe, it, expect } from 'vitest';
+import { validateJSON, SecvalError } from '@/lib/chassis/secval';
+
+describe('secval — validateJSON', () => {
+  // --- Valid JSON ---
+
+  it('accepts valid JSON object', () => {
+    expect(() => validateJSON('{"name":"test","count":42}')).not.toThrow();
+  });
+
+  it('accepts valid JSON array', () => {
+    expect(() => validateJSON('[1, 2, 3]')).not.toThrow();
+  });
+
+  it('accepts nested objects within depth limit', () => {
+    // 5 levels deep — well within the 20 limit
+    const json = '{"a":{"b":{"c":{"d":{"e":"ok"}}}}}';
+    expect(() => validateJSON(json)).not.toThrow();
+  });
+
+  it('accepts primitive JSON values', () => {
+    expect(() => validateJSON('"hello"')).not.toThrow();
+    expect(() => validateJSON('42')).not.toThrow();
+    expect(() => validateJSON('true')).not.toThrow();
+    expect(() => validateJSON('null')).not.toThrow();
+  });
+
+  // --- Invalid JSON ---
+
+  it('throws SecvalError for malformed JSON', () => {
+    expect(() => validateJSON('{invalid}')).toThrow(SecvalError);
+    expect(() => validateJSON('{invalid}')).toThrow(/invalid JSON/);
+  });
+
+  it('throws SecvalError for empty string', () => {
+    expect(() => validateJSON('')).toThrow(SecvalError);
+  });
+
+  // --- Dangerous keys ---
+
+  it('rejects __proto__ key (prototype pollution)', () => {
+    expect(() => validateJSON('{"__proto__":{"admin":true}}')).toThrow(SecvalError);
+    expect(() => validateJSON('{"__proto__":{"admin":true}}')).toThrow(/dangerous key/);
+  });
+
+  it('rejects constructor key', () => {
+    expect(() => validateJSON('{"constructor":{"prototype":{}}}')).toThrow(SecvalError);
+  });
+
+  it('rejects exec key', () => {
+    expect(() => validateJSON('{"exec":"rm -rf /"}')).toThrow(SecvalError);
+  });
+
+  it('rejects dangerous keys nested inside arrays', () => {
+    expect(() => validateJSON('[{"safe":"ok"},{"__proto__":"bad"}]')).toThrow(SecvalError);
+  });
+
+  it('normalises key casing and hyphens before checking', () => {
+    // "Exec" → "exec", "SHELL" → "shell", "re-quire" → "re_quire" (not matched)
+    expect(() => validateJSON('{"EXEC":"bad"}')).toThrow(SecvalError);
+    expect(() => validateJSON('{"Shell":"bad"}')).toThrow(SecvalError);
+    // Hyphenated: "im-port" normalises to "im_port" which is NOT in the set
+    expect(() => validateJSON('{"im-port":"ok"}')).not.toThrow();
+  });
+
+  // --- Nesting depth ---
+
+  it('rejects JSON exceeding max nesting depth of 20', () => {
+    // Build 22 levels deep
+    let json = '"leaf"';
+    for (let i = 0; i < 22; i++) {
+      json = `{"k":${json}}`;
+    }
+    expect(() => validateJSON(json)).toThrow(SecvalError);
+    expect(() => validateJSON(json)).toThrow(/nesting depth/);
+  });
+
+  it('accepts JSON at exactly max nesting depth', () => {
+    // Build exactly 20 levels deep
+    let json = '"leaf"';
+    for (let i = 0; i < 20; i++) {
+      json = `{"k":${json}}`;
+    }
+    expect(() => validateJSON(json)).not.toThrow();
+  });
+});
```

---

### 2. `lib/chassis/errors.ts` — ServiceError & Factories (HIGH PRIORITY)

Core error infrastructure used throughout the app. Pure logic, no I/O.

**Proposed file:** `tests/lib/chassis/errors.test.ts`
**Estimated cases:** 22

```diff
--- /dev/null
+++ b/tests/lib/chassis/errors.test.ts
@@ -0,0 +1,184 @@
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
+  writeProblem,
+  type ProblemReply,
+} from '@/lib/chassis/errors';
+
+describe('ServiceError', () => {
+  it('creates instance with correct properties', () => {
+    const err = new ServiceError('test message', 'NOT_FOUND', 404);
+    expect(err).toBeInstanceOf(Error);
+    expect(err).toBeInstanceOf(ServiceError);
+    expect(err.name).toBe('ServiceError');
+    expect(err.message).toBe('test message');
+    expect(err.grpcCode).toBe('NOT_FOUND');
+    expect(err.httpCode).toBe(404);
+    expect(err.details.size).toBe(0);
+  });
+
+  it('supports fluent detail attachment', () => {
+    const err = new ServiceError('fail', 'INTERNAL', 500)
+      .withDetail('field', 'email')
+      .withDetail('reason', 'invalid format');
+
+    expect(err.details.get('field')).toBe('email');
+    expect(err.details.get('reason')).toBe('invalid format');
+    expect(err.details.size).toBe(2);
+  });
+
+  it('returns grpcStatus object', () => {
+    const err = validationError('bad input');
+    const status = err.grpcStatus();
+    expect(status).toEqual({ code: 'INVALID_ARGUMENT', message: 'bad input' });
+  });
+
+  it('generates RFC 9457 problemDetail without requestPath', () => {
+    const err = notFoundError('user not found');
+    const pd = err.problemDetail();
+    expect(pd.type).toBe('https://chassis.ai8future.com/errors/not-found');
+    expect(pd.title).toBe('Not Found');
+    expect(pd.status).toBe(404);
+    expect(pd.detail).toBe('user not found');
+    expect(pd.instance).toBeUndefined();
+    expect(pd.extensions).toBeUndefined();
+  });
+
+  it('includes requestPath as instance in problemDetail', () => {
+    const err = notFoundError('missing');
+    const pd = err.problemDetail('/api/users/42');
+    expect(pd.instance).toBe('/api/users/42');
+  });
+
+  it('includes details as extensions in problemDetail', () => {
+    const err = validationError('bad').withDetail('field', 'name');
+    const pd = err.problemDetail();
+    expect(pd.extensions).toEqual({ field: 'name' });
+  });
+});
+
+describe('factory functions', () => {
+  const factories = [
+    { fn: validationError, grpc: 'INVALID_ARGUMENT', http: 400 },
+    { fn: notFoundError, grpc: 'NOT_FOUND', http: 404 },
+    { fn: unauthorizedError, grpc: 'UNAUTHENTICATED', http: 401 },
+    { fn: timeoutError, grpc: 'DEADLINE_EXCEEDED', http: 504 },
+    { fn: rateLimitError, grpc: 'RESOURCE_EXHAUSTED', http: 429 },
+    { fn: dependencyError, grpc: 'UNAVAILABLE', http: 503 },
+    { fn: internalError, grpc: 'INTERNAL', http: 500 },
+    { fn: conflictError, grpc: 'INVALID_ARGUMENT', http: 409 },
+    { fn: forbiddenError, grpc: 'PERMISSION_DENIED', http: 403 },
+  ] as const;
+
+  for (const { fn, grpc, http } of factories) {
+    it(`${fn.name}() returns ServiceError with grpc=${grpc}, http=${http}`, () => {
+      const err = fn('test');
+      expect(err).toBeInstanceOf(ServiceError);
+      expect(err.grpcCode).toBe(grpc);
+      expect(err.httpCode).toBe(http);
+      expect(err.message).toBe('test');
+    });
+  }
+});
+
+describe('fromError', () => {
+  it('returns existing ServiceError unchanged', () => {
+    const original = notFoundError('nope');
+    expect(fromError(original)).toBe(original);
+  });
+
+  it('wraps plain Error as internalError', () => {
+    const err = fromError(new Error('boom'));
+    expect(err).toBeInstanceOf(ServiceError);
+    expect(err.httpCode).toBe(500);
+    expect(err.message).toBe('boom');
+  });
+
+  it('wraps non-Error values as internalError', () => {
+    const err = fromError('string error');
+    expect(err.httpCode).toBe(500);
+    expect(err.message).toBe('string error');
+  });
+});
+
+describe('typeUriForStatus', () => {
+  it('returns correct URI for known status codes', () => {
+    expect(typeUriForStatus(400)).toContain('validation');
+    expect(typeUriForStatus(404)).toContain('not-found');
+    expect(typeUriForStatus(429)).toContain('rate-limit');
+  });
+
+  it('falls back to internal URI for unknown status', () => {
+    expect(typeUriForStatus(418)).toContain('internal');
+  });
+});
+
+describe('titleForStatus', () => {
+  it('returns correct title for known status codes', () => {
+    expect(titleForStatus(400)).toBe('Bad Request');
+    expect(titleForStatus(404)).toBe('Not Found');
+    expect(titleForStatus(503)).toBe('Service Unavailable');
+  });
+
+  it('falls back to "Error" for unknown status', () => {
+    expect(titleForStatus(418)).toBe('Error');
+  });
+});
+
+describe('problemDetailForStatus', () => {
+  it('builds ProblemDetail from status code', () => {
+    const pd = problemDetailForStatus(404, 'user not found');
+    expect(pd.status).toBe(404);
+    expect(pd.detail).toBe('user not found');
+    expect(pd.type).toContain('not-found');
+    expect(pd.title).toBe('Not Found');
+  });
+
+  it('includes optional instance and extensions', () => {
+    const pd = problemDetailForStatus(400, 'bad', '/api/test', { field: 'name' });
+    expect(pd.instance).toBe('/api/test');
+    expect(pd.extensions).toEqual({ field: 'name' });
+  });
+
+  it('omits instance and extensions when not provided', () => {
+    const pd = problemDetailForStatus(500, 'fail');
+    expect(pd.instance).toBeUndefined();
+    expect(pd.extensions).toBeUndefined();
+  });
+});
+
+describe('writeProblem', () => {
+  function mockReply(): ProblemReply & { captured: { status: number; headers: Record<string, string>; body: unknown } } {
+    const captured = { status: 0, headers: {} as Record<string, string>, body: null as unknown };
+    const reply: ProblemReply & { captured: typeof captured } = {
+      captured,
+      code(s: number) { captured.status = s; return reply; },
+      header(k: string, v: string) { captured.headers[k] = v; return reply; },
+      send(b: unknown) { captured.body = b; },
+    };
+    return reply;
+  }
+
+  it('writes correct status and content-type', () => {
+    const reply = mockReply();
+    writeProblem(reply, notFoundError('missing'));
+    expect(reply.captured.status).toBe(404);
+    expect(reply.captured.headers['content-type']).toBe('application/problem+json');
+  });
+
+  it('suppresses detail for 5xx errors', () => {
+    const reply = mockReply();
+    writeProblem(reply, internalError('secret db password exposed'));
+    const body = reply.captured.body as { detail: string };
+    expect(body.detail).toBe('Internal Server Error');
+  });
+
+  it('preserves detail for 4xx errors', () => {
+    const reply = mockReply();
+    writeProblem(reply, validationError('name is required'));
+    const body = reply.captured.body as { detail: string };
+    expect(body.detail).toBe('name is required');
+  });
+});
```

---

### 3. `lib/chassis/work.ts` — Concurrency Primitives (HIGH PRIORITY)

Semaphore, workMap, workRace, workAll, workStream — pure async logic.

**Proposed file:** `tests/lib/chassis/work.test.ts`
**Estimated cases:** 15

```diff
--- /dev/null
+++ b/tests/lib/chassis/work.test.ts
@@ -0,0 +1,156 @@
+import { describe, it, expect } from 'vitest';
+import { workMap, workRace, workAll, workStream } from '@/lib/chassis/work';
+
+describe('workMap', () => {
+  it('processes all items and returns results in input order', async () => {
+    const items = [1, 2, 3, 4, 5];
+    const results = await workMap(
+      items,
+      async (item) => item * 2,
+      { workers: 2 },
+    );
+    expect(results).toHaveLength(5);
+    expect(results.map(r => r.value)).toEqual([2, 4, 6, 8, 10]);
+    expect(results.map(r => r.index)).toEqual([0, 1, 2, 3, 4]);
+  });
+
+  it('captures errors per-item without aborting other items', async () => {
+    const results = await workMap(
+      [1, 2, 3],
+      async (item) => {
+        if (item === 2) throw new Error('boom');
+        return item;
+      },
+      { workers: 1 },
+    );
+    expect(results[0]!.value).toBe(1);
+    expect(results[1]!.error).toBeInstanceOf(Error);
+    expect(results[1]!.error!.message).toBe('boom');
+    expect(results[2]!.value).toBe(3);
+  });
+
+  it('handles empty input array', async () => {
+    const results = await workMap([], async () => 'nope', { workers: 2 });
+    expect(results).toEqual([]);
+  });
+
+  it('respects workers concurrency limit', async () => {
+    let concurrent = 0;
+    let maxConcurrent = 0;
+
+    await workMap(
+      [1, 2, 3, 4, 5, 6],
+      async () => {
+        concurrent++;
+        maxConcurrent = Math.max(maxConcurrent, concurrent);
+        await new Promise(r => setTimeout(r, 20));
+        concurrent--;
+      },
+      { workers: 2 },
+    );
+
+    expect(maxConcurrent).toBeLessThanOrEqual(2);
+  });
+
+  it('throws RangeError for workers < 1', async () => {
+    await expect(
+      workMap([1], async (x) => x, { workers: 0 }),
+    ).rejects.toThrow(RangeError);
+  });
+});
+
+describe('workRace', () => {
+  it('returns the first successful result', async () => {
+    const result = await workRace(
+      async () => {
+        await new Promise(r => setTimeout(r, 100));
+        return 'slow';
+      },
+      async () => {
+        return 'fast';
+      },
+    );
+    expect(result).toBe('fast');
+  });
+
+  it('throws AggregateError when all tasks fail', async () => {
+    await expect(
+      workRace(
+        async () => { throw new Error('fail1'); },
+        async () => { throw new Error('fail2'); },
+      ),
+    ).rejects.toThrow(AggregateError);
+  });
+
+  it('throws when called with no tasks', async () => {
+    await expect(workRace()).rejects.toThrow('workRace requires at least one task');
+  });
+
+  it('succeeds if at least one task succeeds despite others failing', async () => {
+    const result = await workRace(
+      async () => { throw new Error('fail'); },
+      async () => 'ok',
+    );
+    expect(result).toBe('ok');
+  });
+});
+
+describe('workAll', () => {
+  it('runs heterogeneous tasks and returns results', async () => {
+    const results = await workAll(
+      [
+        async () => 'a',
+        async () => 42,
+        async () => true,
+      ],
+      { workers: 2 },
+    );
+    expect(results).toHaveLength(3);
+    expect(results[0]!.value).toBe('a');
+    expect(results[1]!.value).toBe(42);
+    expect(results[2]!.value).toBe(true);
+  });
+
+  it('captures task errors in results', async () => {
+    const results = await workAll([
+      async () => { throw new Error('nope'); },
+      async () => 'ok',
+    ]);
+    expect(results[0]!.error).toBeInstanceOf(Error);
+    expect(results[1]!.value).toBe('ok');
+  });
+});
+
+describe('workStream', () => {
+  async function* asyncItems<T>(items: T[]): AsyncGenerator<T> {
+    for (const item of items) {
+      yield item;
+    }
+  }
+
+  it('yields results from async iterable', async () => {
+    const results: { value?: number; index: number }[] = [];
+
+    for await (const r of workStream(
+      asyncItems([10, 20, 30]),
+      async (item) => item + 1,
+      { workers: 2 },
+    )) {
+      results.push(r);
+    }
+
+    expect(results).toHaveLength(3);
+    const values = results.map(r => r.value).sort();
+    expect(values).toEqual([11, 21, 31]);
+  });
+
+  it('handles errors in stream items', async () => {
+    const results = [];
+
+    for await (const r of workStream(
+      asyncItems([1, 2]),
+      async (item) => {
+        if (item === 2) throw new Error('stream error');
+        return item;
+      },
+      { workers: 1 },
+    )) {
+      results.push(r);
+    }
+
+    expect(results).toHaveLength(2);
+    expect(results.find(r => r.error)?.error?.message).toBe('stream error');
+  });
+});
```

---

### 4. `lib/git.ts` — `parseNumstatLine` (MEDIUM PRIORITY)

Pure parsing function — trivial to test, high value for correctness.

**Proposed file:** `tests/lib/git.test.ts`
**Estimated cases:** 6

```diff
--- /dev/null
+++ b/tests/lib/git.test.ts
@@ -0,0 +1,42 @@
+import { describe, it, expect } from 'vitest';
+import { parseNumstatLine } from '@/lib/git';
+
+describe('parseNumstatLine', () => {
+  it('parses standard numstat line', () => {
+    const result = parseNumstatLine('10\t5\tsrc/app.ts');
+    expect(result).toEqual({ added: 10, removed: 5 });
+  });
+
+  it('parses line with zero additions', () => {
+    const result = parseNumstatLine('0\t12\tREADME.md');
+    expect(result).toEqual({ added: 0, removed: 12 });
+  });
+
+  it('treats binary marker "-" as 0', () => {
+    const result = parseNumstatLine('-\t-\timage.png');
+    expect(result).toEqual({ added: 0, removed: 0 });
+  });
+
+  it('returns null for non-numstat lines', () => {
+    expect(parseNumstatLine('')).toBeNull();
+    expect(parseNumstatLine('commit abc123')).toBeNull();
+    expect(parseNumstatLine('Author: Test')).toBeNull();
+  });
+
+  it('handles large numbers', () => {
+    const result = parseNumstatLine('9999\t1234\tlib/big-file.ts');
+    expect(result).toEqual({ added: 9999, removed: 1234 });
+  });
+
+  it('handles paths with spaces and special chars', () => {
+    const result = parseNumstatLine('3\t1\tpath with spaces/file (1).ts');
+    expect(result).toEqual({ added: 3, removed: 1 });
+  });
+});
```

---

### 5. `lib/utils/grades.ts` — Grade Color Utilities (MEDIUM PRIORITY)

Pure functions with three thresholds — easy to cover completely.

**Proposed file:** `tests/lib/utils/grades.test.ts`
**Estimated cases:** 10

```diff
--- /dev/null
+++ b/tests/lib/utils/grades.test.ts
@@ -0,0 +1,60 @@
+import { describe, it, expect } from 'vitest';
+import { getGradeColor, getGradeBgColor, getGradeClasses } from '@/lib/utils/grades';
+
+describe('getGradeColor', () => {
+  it('returns green for grade >= 80', () => {
+    expect(getGradeColor(80)).toContain('green');
+    expect(getGradeColor(100)).toContain('green');
+    expect(getGradeColor(95)).toContain('green');
+  });
+
+  it('returns yellow for grade 60-79', () => {
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
+    expect(getGradeBgColor(80)).toContain('green');
+  });
+
+  it('returns yellow bg for grade 60-79', () => {
+    expect(getGradeBgColor(65)).toContain('yellow');
+  });
+
+  it('returns red bg for grade < 60', () => {
+    expect(getGradeBgColor(30)).toContain('red');
+  });
+});
+
+describe('getGradeClasses', () => {
+  it('combines bg and text color classes', () => {
+    const classes = getGradeClasses(90);
+    expect(classes).toContain('bg-green');
+    expect(classes).toContain('text-green');
+  });
+
+  it('returns yellow classes at boundary', () => {
+    const classes = getGradeClasses(60);
+    expect(classes).toContain('bg-yellow');
+    expect(classes).toContain('text-yellow');
+  });
+
+  it('returns red classes for low grades', () => {
+    const classes = getGradeClasses(10);
+    expect(classes).toContain('bg-red');
+    expect(classes).toContain('text-red');
+  });
+});
```

---

### 6. `lib/utils/dates.ts` — Date Formatting (MEDIUM PRIORITY)

Pure functions. `formatRelativeDate` has multiple branches that should all be tested.

**Proposed file:** `tests/lib/utils/dates.test.ts`
**Estimated cases:** 8

```diff
--- /dev/null
+++ b/tests/lib/utils/dates.test.ts
@@ -0,0 +1,56 @@
+import { describe, it, expect, vi, afterEach } from 'vitest';
+import { formatRelativeDate, formatShortDate } from '@/lib/utils/dates';
+
+describe('formatRelativeDate', () => {
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('returns "Today" for current date', () => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-02-17T12:00:00Z'));
+    expect(formatRelativeDate('2026-02-17T10:00:00Z')).toBe('Today');
+  });
+
+  it('returns "Yesterday" for 1 day ago', () => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-02-17T12:00:00Z'));
+    expect(formatRelativeDate('2026-02-16T12:00:00Z')).toBe('Yesterday');
+  });
+
+  it('returns "N days ago" for 2-6 days', () => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-02-17T12:00:00Z'));
+    expect(formatRelativeDate('2026-02-14T12:00:00Z')).toBe('3 days ago');
+  });
+
+  it('returns "N weeks ago" for 7-29 days', () => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-02-17T12:00:00Z'));
+    expect(formatRelativeDate('2026-02-03T12:00:00Z')).toBe('2 weeks ago');
+  });
+
+  it('returns "N months ago" for 30-364 days', () => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-02-17T12:00:00Z'));
+    expect(formatRelativeDate('2025-11-17T12:00:00Z')).toBe('3 months ago');
+  });
+
+  it('returns "N years ago" for 365+ days', () => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-02-17T12:00:00Z'));
+    expect(formatRelativeDate('2024-02-17T12:00:00Z')).toBe('2 years ago');
+  });
+});
+
+describe('formatShortDate', () => {
+  it('formats date in en-US short format', () => {
+    const result = formatShortDate('2026-02-17T12:00:00Z');
+    expect(result).toMatch(/Feb\s+17,\s+2026/);
+  });
+
+  it('handles different months', () => {
+    const result = formatShortDate('2026-12-25T00:00:00Z');
+    expect(result).toMatch(/Dec\s+25,\s+2026/);
+  });
+});
```

---

### 7. `lib/ports.ts` — Deterministic Port Assignment (MEDIUM PRIORITY)

Pure, deterministic function — easy to snapshot-test.

**Proposed file:** `tests/lib/ports.test.ts`
**Estimated cases:** 6

```diff
--- /dev/null
+++ b/tests/lib/ports.test.ts
@@ -0,0 +1,42 @@
+import { describe, it, expect } from 'vitest';
+import { getPortFromDirectory, getPortConfig } from '@/lib/ports';
+
+describe('getPortFromDirectory', () => {
+  it('returns a number within the valid port range', () => {
+    const { MIN_PORT, MAX_PORT } = getPortConfig();
+    const port = getPortFromDirectory('my-project');
+    expect(port).toBeGreaterThanOrEqual(MIN_PORT);
+    expect(port).toBeLessThanOrEqual(MAX_PORT);
+  });
+
+  it('is deterministic (same input → same output)', () => {
+    const port1 = getPortFromDirectory('code_manage');
+    const port2 = getPortFromDirectory('code_manage');
+    expect(port1).toBe(port2);
+  });
+
+  it('returns different ports for different directory names', () => {
+    const port1 = getPortFromDirectory('project-alpha');
+    const port2 = getPortFromDirectory('project-beta');
+    // Not strictly guaranteed but overwhelmingly likely with MD5
+    expect(port1).not.toBe(port2);
+  });
+
+  it('handles empty string', () => {
+    const { MIN_PORT, MAX_PORT } = getPortConfig();
+    const port = getPortFromDirectory('');
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
+
+  it('MIN_PORT < MAX_PORT', () => {
+    const { MIN_PORT, MAX_PORT } = getPortConfig();
+    expect(MIN_PORT).toBeLessThan(MAX_PORT);
+  });
+});
```

---

### 8. `lib/scanner.ts` — Additional Scanner Functions (MEDIUM PRIORITY)

`isSuiteDirectory` and `formatSuiteName` are pure synchronous functions that can be tested without mocking the filesystem.

**Proposed addition to:** `tests/lib/scanner.test.ts`
**Estimated cases:** 10

```diff
--- a/tests/lib/scanner.test.ts
+++ b/tests/lib/scanner.test.ts
@@ -1,5 +1,5 @@
 import { describe, it, expect } from 'vitest';
-import { determineStatus } from '@/lib/scanner';
+import { determineStatus, isSuiteDirectory, formatSuiteName } from '@/lib/scanner';

 describe('scanner', () => {
   describe('determineStatus', () => {
@@ -22,4 +22,42 @@
       expect(determineStatus('/Users/cliff/Desktop/_code/_icebox/subfolder/project')).toBe('icebox');
     });
   });
+
+  describe('isSuiteDirectory', () => {
+    it('returns true for names ending with _suite', () => {
+      expect(isSuiteDirectory('builder_suite')).toBe(true);
+      expect(isSuiteDirectory('app_email4ai_suite')).toBe(true);
+    });
+
+    it('returns false for names not ending with _suite', () => {
+      expect(isSuiteDirectory('my-project')).toBe(false);
+      expect(isSuiteDirectory('suite')).toBe(false);
+      expect(isSuiteDirectory('suite_builder')).toBe(false);
+    });
+
+    it('returns false for empty string', () => {
+      expect(isSuiteDirectory('')).toBe(false);
+    });
+  });
+
+  describe('formatSuiteName', () => {
+    it('converts builder_suite to "Builder"', () => {
+      expect(formatSuiteName('builder_suite')).toBe('Builder');
+    });
+
+    it('converts multi-word suite names', () => {
+      expect(formatSuiteName('app_email4ai_suite')).toBe('App Email4ai');
+    });
+
+    it('capitalizes each word segment', () => {
+      expect(formatSuiteName('my_cool_app_suite')).toBe('My Cool App');
+    });
+
+    it('handles single word before _suite', () => {
+      expect(formatSuiteName('tools_suite')).toBe('Tools');
+    });
+
+    it('handles name that is just _suite', () => {
+      // Edge case: "_suite" → removes _suite → empty string → splits on _ → [""]
+      const result = formatSuiteName('_suite');
+      expect(result).toBe('');
+    });
+  });
 });
```

---

### 9. `lib/api/validate.ts` — Body Parsing (LOWER PRIORITY)

Depends on NextResponse but still valuable. Can be tested by checking the `success` discriminant.

**Proposed file:** `tests/lib/api/validate.test.ts`
**Estimated cases:** 7

```diff
--- /dev/null
+++ b/tests/lib/api/validate.test.ts
@@ -0,0 +1,56 @@
+import { describe, it, expect } from 'vitest';
+import { z } from 'zod';
+import { parseBody, parseSecureBody } from '@/lib/api/validate';
+
+const TestSchema = z.object({
+  name: z.string().min(1),
+  age: z.number().int().positive(),
+});
+
+describe('parseBody', () => {
+  it('returns success with valid data', () => {
+    const result = parseBody(TestSchema, { name: 'Alice', age: 30 });
+    expect(result.success).toBe(true);
+    if (result.success) {
+      expect(result.data).toEqual({ name: 'Alice', age: 30 });
+    }
+  });
+
+  it('returns failure for invalid data', () => {
+    const result = parseBody(TestSchema, { name: '', age: -1 });
+    expect(result.success).toBe(false);
+    if (!result.success) {
+      expect(result.response.status).toBe(400);
+    }
+  });
+
+  it('returns failure for wrong types', () => {
+    const result = parseBody(TestSchema, { name: 123, age: 'abc' });
+    expect(result.success).toBe(false);
+  });
+});
+
+describe('parseSecureBody', () => {
+  it('returns success for valid secure JSON', () => {
+    const result = parseSecureBody(TestSchema, '{"name":"Bob","age":25}');
+    expect(result.success).toBe(true);
+    if (result.success) {
+      expect(result.data).toEqual({ name: 'Bob', age: 25 });
+    }
+  });
+
+  it('rejects malformed JSON', () => {
+    const result = parseSecureBody(TestSchema, '{bad json}');
+    expect(result.success).toBe(false);
+  });
+
+  it('rejects JSON with dangerous keys (prototype pollution)', () => {
+    const result = parseSecureBody(TestSchema, '{"__proto__":{"admin":true},"name":"Eve","age":1}');
+    expect(result.success).toBe(false);
+    if (!result.success) {
+      expect(result.response.status).toBe(400);
+    }
+  });
+
+  it('rejects valid JSON that fails schema validation', () => {
+    const result = parseSecureBody(TestSchema, '{"name":"","age":-5}');
+    expect(result.success).toBe(false);
+  });
+});
```

---

## Scoring Breakdown

| Category | Max Points | Score | Notes |
|----------|-----------|-------|-------|
| **Core business logic coverage** | 25 | 5 | `lib/chassis/*` has zero tests; `scanner.ts` barely tested |
| **Security-critical code** | 20 | 10 | `pathSecurity` is well tested; `secval.ts` has zero tests |
| **Utility/helper coverage** | 15 | 2 | `dates.ts`, `grades.ts`, `ports.ts` all untested |
| **API route coverage** | 15 | 8 | 4 of 14 routes tested; only error paths covered |
| **Test quality** | 10 | 7 | Existing tests are well-written, use proper assertions |
| **Edge case coverage** | 10 | 1 | Almost no boundary/edge case testing outside schemas |
| **Test infrastructure** | 5 | 4 | Vitest configured properly, alias working, clear structure |

**TOTAL: 34/100**

---

## Recommendations (Priority Order)

1. **Immediately add tests for `lib/chassis/secval.ts`** — this is security-critical code with zero coverage
2. **Add tests for `lib/chassis/errors.ts`** — used by every API route, 9 factory functions untested
3. **Add tests for `lib/chassis/work.ts`** — concurrency primitives are subtle and need regression protection
4. **Add tests for `parseNumstatLine` in `lib/git.ts`** — pure function, trivial to test
5. **Add tests for all `lib/utils/` functions** — low effort, high confidence gain
6. **Add tests for `lib/ports.ts`** — deterministic function, snapshot-testable
7. **Expand `scanner.test.ts`** to cover `isSuiteDirectory`, `formatSuiteName`
8. **Add tests for `lib/api/validate.ts`** — critical middleware, covers secval integration

The proposed tests above would add approximately **89 test cases** across 7 new files and 1 expanded file, bringing estimated coverage from ~15% to ~55-60%.
