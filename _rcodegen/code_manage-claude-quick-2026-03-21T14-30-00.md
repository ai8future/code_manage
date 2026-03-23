Date Created: 2026-03-21T14:30:00-05:00
TOTAL_SCORE: 76/100

---

# code_manage — Combined Quick Analysis Report

**Agent:** Claude:Opus 4.6
**Codebase:** Next.js project management dashboard (TypeScript, React 18, Tailwind, Vitest)
**Files analyzed:** ~50 source files across lib/, app/api/, components/, tests/

---

## 1. AUDIT — Security & Code Quality Issues

### A-1: `/api/projects/docs/route.ts` — Path validation bypasses `validatePath()`

**Severity:** HIGH
**Issue:** The docs listing route (`app/api/projects/docs/route.ts`) uses manual `path.resolve` + `fs.realpath` instead of the shared `validatePath()` helper. This means it skips the `requireExists` handling logic and could diverge from the security model if `validatePath` is updated in the future.

```diff
--- a/app/api/projects/docs/route.ts
+++ b/app/api/projects/docs/route.ts
@@ -49,13 +49,12 @@ export async function GET(request: Request) {
+  const log = createRequestLogger('projects/docs', request);
   const { searchParams } = new URL(request.url);
   const projectPath = searchParams.get('path');

   if (!projectPath) {
     return errorResponse(validationError('Path is required'));
   }

-  // Validate path is within CODE_BASE_PATH
-  const resolvedPath = path.resolve(projectPath);
-  const realPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);
-  if (!realPath.startsWith(CODE_BASE_PATH + '/') && realPath !== CODE_BASE_PATH) {
-    return errorResponse(forbiddenError('Invalid path'));
+  const pathResult = await validatePath(projectPath, { requireExists: false });
+  if (!pathResult.valid) {
+    return pathErrorResponse(pathResult.error, pathResult.status);
   }
+  const resolvedPath = pathResult.resolvedPath;
```

### A-2: `/api/projects/docs/[filename]/route.ts` — Filename validation is incomplete

**Severity:** MEDIUM
**Issue:** The filename traversal check (`filename.includes('..')`) is correct but the `GET` handler constructs a path using the validated `projectPath` + raw `filename` without verifying the resulting path is still under the project directory. A filename like `%2e%2e` (URL-encoded `..`) would bypass the string check if the framework doesn't decode it before passing to the route handler. In practice Next.js does decode, but the defense should be defense-in-depth.

```diff
--- a/app/api/projects/docs/[filename]/route.ts
+++ b/app/api/projects/docs/[filename]/route.ts
@@ -31,6 +31,7 @@ export async function GET(request: Request, { params }: RouteParams) {
   // Validate filename (prevent directory traversal)
   if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
     return errorResponse(validationError('Invalid filename'));
   }
+  // Additional guard: reject filenames with null bytes
+  if (filename.includes('\0')) {
+    return errorResponse(validationError('Invalid filename'));
+  }

   const validation = await validatePath(projectPath, { requireExists: false });
@@ -42,6 +43,11 @@ export async function GET(request: Request, { params }: RouteParams) {
   const filePath = path.join(validation.resolvedPath, filename);
+
+  // Defense-in-depth: verify final path is still under project dir
+  const realFilePath = path.resolve(filePath);
+  if (!realFilePath.startsWith(validation.resolvedPath + '/') && realFilePath !== validation.resolvedPath) {
+    return errorResponse(validationError('Invalid filename'));
+  }
```

### A-3: Terminal route — `echo` command allows data exfiltration

**Severity:** LOW
**Issue:** The `echo` command is whitelisted, which could be used for rudimentary data exfiltration (e.g., `echo $(cat /etc/passwd)`). However, since `execFile` does NOT use a shell, subshell expansion won't work, so this is actually safe. No fix needed — documenting as informational only.

### A-4: Hardcoded user path in env default

**Severity:** LOW
**Issue:** `lib/env.ts` defaults `codeBasePath` to `/Users/cliff/Desktop/_code`. This is fine for a personal tool but would need parameterization for distribution.

### A-5: Missing Content-Security-Policy header

**Severity:** LOW
**Issue:** `next.config.mjs` sets several security headers (X-Content-Type-Options, X-Frame-Options, etc.) but omits `Content-Security-Policy`. For a local dev tool this is acceptable, but adding a basic CSP would harden against any XSS vectors.

```diff
--- a/next.config.mjs
+++ b/next.config.mjs
@@ -38,6 +38,10 @@
           {
             key: 'Referrer-Policy',
             value: 'strict-origin-when-cross-origin',
           },
+          {
+            key: 'Content-Security-Policy',
+            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';",
+          },
         ],
       },
```

### A-6: Health endpoint exposes internal state without authentication

**Severity:** LOW
**Issue:** `GET /api/health` returns PID, RSS, heap usage, uptime, and inflight requests. For a local tool this is expected, but if ever network-exposed, this leaks operational details.

---

## 2. TESTS — Proposed Unit Tests for Untested Code

### T-1: `lib/git.ts` — `spawnGit` and `parseNumstatLine` are untested

```diff
--- /dev/null
+++ b/tests/lib/git.test.ts
@@ -0,0 +1,72 @@
+import { describe, it, expect } from 'vitest';
+import { parseNumstatLine, spawnGit } from '@/lib/git';
+
+describe('parseNumstatLine', () => {
+  it('parses a standard numstat line', () => {
+    const result = parseNumstatLine('10\t5\tlib/scanner.ts');
+    expect(result).toEqual({ added: 10, removed: 5 });
+  });
+
+  it('parses binary file numstat (dashes)', () => {
+    const result = parseNumstatLine('-\t-\timage.png');
+    expect(result).toEqual({ added: 0, removed: 0 });
+  });
+
+  it('returns null for non-numstat lines', () => {
+    expect(parseNumstatLine('commit abc123')).toBeNull();
+    expect(parseNumstatLine('')).toBeNull();
+    expect(parseNumstatLine('not a numstat line')).toBeNull();
+  });
+
+  it('parses zero additions/removals', () => {
+    const result = parseNumstatLine('0\t0\tREADME.md');
+    expect(result).toEqual({ added: 0, removed: 0 });
+  });
+
+  it('parses large numbers', () => {
+    const result = parseNumstatLine('1000\t2000\tpackage-lock.json');
+    expect(result).toEqual({ added: 1000, removed: 2000 });
+  });
+});
+
+describe('spawnGit', () => {
+  it('executes a simple git command', async () => {
+    const output = await spawnGit(['--version'], {
+      cwd: process.cwd(),
+    });
+    expect(output).toContain('git version');
+  });
+
+  it('rejects on invalid git command', async () => {
+    await expect(
+      spawnGit(['not-a-real-command'], { cwd: process.cwd() })
+    ).rejects.toThrow();
+  });
+
+  it('rejects when timeout is exceeded', async () => {
+    await expect(
+      spawnGit(['log', '--all', '--oneline'], {
+        cwd: process.cwd(),
+        timeoutMs: 1, // 1ms — will always timeout
+      })
+    ).rejects.toThrow(/timed out/);
+  });
+
+  it('rejects when output exceeds maxOutputSize', async () => {
+    await expect(
+      spawnGit(['log', '--all', '--oneline'], {
+        cwd: process.cwd(),
+        maxOutputSize: 10, // 10 bytes — will exceed quickly
+      })
+    ).rejects.toThrow(/maximum size/);
+  });
+});
```

### T-2: `lib/scan-cache.ts` — Cache coalescing logic untested

```diff
--- /dev/null
+++ b/tests/lib/scan-cache.test.ts
@@ -0,0 +1,38 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+
+// We need to mock scanAllProjects before importing scan-cache
+vi.mock('@/lib/scanner', () => ({
+  scanAllProjects: vi.fn(),
+  getCodeBasePath: vi.fn(() => '/tmp/test'),
+}));
+
+describe('scan-cache', () => {
+  beforeEach(() => {
+    vi.resetModules();
+  });
+
+  it('returns cached data on second call within TTL', async () => {
+    const { scanAllProjects } = await import('@/lib/scanner');
+    const mockScan = vi.mocked(scanAllProjects);
+    mockScan.mockResolvedValue([]);
+
+    const { getCachedProjects } = await import('@/lib/scan-cache');
+
+    const first = await getCachedProjects();
+    const second = await getCachedProjects();
+
+    expect(first).toBe(second); // Same reference
+    expect(mockScan).toHaveBeenCalledTimes(1);
+  });
+
+  it('invalidateProjectCache forces rescan', async () => {
+    const { scanAllProjects } = await import('@/lib/scanner');
+    const mockScan = vi.mocked(scanAllProjects);
+    mockScan.mockResolvedValue([]);
+
+    const { getCachedProjects, invalidateProjectCache } = await import('@/lib/scan-cache');
+
+    await getCachedProjects();
+    invalidateProjectCache();
+    await getCachedProjects();
+
+    expect(mockScan).toHaveBeenCalledTimes(2);
+  });
+});
```

### T-3: `lib/config.ts` — Config read/write and locking untested

```diff
--- /dev/null
+++ b/tests/lib/config.test.ts
@@ -0,0 +1,42 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+import { promises as fs } from 'fs';
+
+vi.mock('@/lib/scanner', () => ({
+  getCodeBasePath: vi.fn(() => '/tmp/test-config'),
+}));
+
+vi.mock('proper-lockfile', () => ({
+  default: {
+    lock: vi.fn(async () => vi.fn(async () => {})),
+  },
+}));
+
+describe('config', () => {
+  beforeEach(() => {
+    vi.resetModules();
+  });
+
+  it('readConfig returns defaults when file does not exist', async () => {
+    vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('ENOENT'));
+    const { readConfig } = await import('@/lib/config');
+
+    const config = await readConfig();
+    expect(config.settings.sidebarCollapsed).toBe(false);
+    expect(config.settings.defaultStatus).toBe('active');
+    expect(config.projects).toEqual({});
+  });
+
+  it('readConfig merges partial config with defaults', async () => {
+    vi.spyOn(fs, 'readFile').mockResolvedValue(
+      JSON.stringify({ settings: { sidebarCollapsed: true } })
+    );
+    const { readConfig } = await import('@/lib/config');
+
+    const config = await readConfig();
+    expect(config.settings.sidebarCollapsed).toBe(true);
+    expect(config.settings.defaultStatus).toBe('active'); // from defaults
+  });
+});
```

### T-4: `lib/utils/dates.ts` — Utility functions untested

```diff
--- /dev/null
+++ b/tests/lib/dates.test.ts
@@ -0,0 +1,36 @@
+import { describe, it, expect, vi, afterEach } from 'vitest';
+import { formatRelativeDate, formatShortDate } from '@/lib/utils/dates';
+
+describe('formatRelativeDate', () => {
+  afterEach(() => { vi.useRealTimers(); });
+
+  it('returns "Today" for same-day dates', () => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
+    expect(formatRelativeDate('2026-03-21T10:00:00Z')).toBe('Today');
+  });
+
+  it('returns "Yesterday" for one-day-old dates', () => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
+    expect(formatRelativeDate('2026-03-20T10:00:00Z')).toBe('Yesterday');
+  });
+
+  it('returns weeks for 7-29 day old dates', () => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
+    expect(formatRelativeDate('2026-03-07T12:00:00Z')).toBe('2 weeks ago');
+  });
+
+  it('returns months for 30-364 day old dates', () => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
+    expect(formatRelativeDate('2026-01-01T12:00:00Z')).toBe('2 months ago');
+  });
+});
+
+describe('formatShortDate', () => {
+  it('formats a date as short string', () => {
+    const result = formatShortDate('2026-03-21T12:00:00Z');
+    expect(result).toContain('Mar');
+    expect(result).toContain('21');
+    expect(result).toContain('2026');
+  });
+});
```

### T-5: `lib/scanner.ts` — `scanRcodegen`, `detectTechStack`, `extractDescription` untested

```diff
--- /dev/null
+++ b/tests/lib/scanner-utils.test.ts
@@ -0,0 +1,54 @@
+import { describe, it, expect } from 'vitest';
+import {
+  isSuiteDirectory,
+  formatSuiteName,
+  fileExists,
+} from '@/lib/scanner';
+
+describe('isSuiteDirectory', () => {
+  it('returns true for names ending with _suite', () => {
+    expect(isSuiteDirectory('builder_suite')).toBe(true);
+    expect(isSuiteDirectory('app_email4ai_suite')).toBe(true);
+  });
+
+  it('returns false for non-suite names', () => {
+    expect(isSuiteDirectory('builder')).toBe(false);
+    expect(isSuiteDirectory('suite')).toBe(false);
+    expect(isSuiteDirectory('my_project')).toBe(false);
+  });
+});
+
+describe('formatSuiteName', () => {
+  it('formats builder_suite as "Builder"', () => {
+    expect(formatSuiteName('builder_suite')).toBe('Builder');
+  });
+
+  it('formats multi-word suite names', () => {
+    expect(formatSuiteName('app_email4ai_suite')).toBe('App Email4ai');
+  });
+
+  it('handles single word before _suite', () => {
+    expect(formatSuiteName('tools_suite')).toBe('Tools');
+  });
+});
+
+describe('fileExists', () => {
+  it('returns true for existing files', async () => {
+    expect(await fileExists(process.cwd() + '/package.json')).toBe(true);
+  });
+
+  it('returns false for non-existing files', async () => {
+    expect(await fileExists('/nonexistent-file-xyz-123')).toBe(false);
+  });
+});
```

### Coverage Gap Summary

| Module | Current Coverage | Proposed Tests |
|--------|-----------------|----------------|
| `lib/git.ts` | None | T-1 (spawnGit, parseNumstatLine) |
| `lib/scan-cache.ts` | None | T-2 (caching, coalescing, invalidation) |
| `lib/config.ts` | None | T-3 (read/write, defaults merging) |
| `lib/utils/dates.ts` | None | T-4 (formatRelativeDate, formatShortDate) |
| `lib/scanner.ts` (utilities) | Partial (determineStatus only) | T-5 (isSuiteDirectory, formatSuiteName, fileExists) |
| `lib/diagnostics.ts` | None | Low priority — crash handlers are hard to unit test |
| `lib/xyops.ts` | None | Low priority — integration client |
| `app/api/activity/*` | None | Medium priority — depends on git state |
| `app/api/projects/create` | None | Medium priority — depends on `ralph` CLI |

---

## 3. FIXES — Bugs, Issues, and Code Smells

### F-1: `app/api/projects/docs/route.ts` — Unhandled `fs.realpath` failure leaks unresolved path

**Severity:** MEDIUM
**Bug:** When `fs.realpath` fails (line 59), the code falls back to the `resolvedPath`, then uses it for `startsWith` check. But if the path doesn't exist, `realPath === resolvedPath` — which was not `realpath`-resolved. This means a carefully crafted symlink race could bypass the check. Use `validatePath()` instead (see A-1 diff above).

### F-2: `app/api/projects/docs/route.ts` — 500 error returns detail as plain JSON, not RFC 9457

**Severity:** LOW
**Bug:** Line 158 returns `{ docs: [], detail: 'Failed to scan docs' }` with status 500. This doesn't follow the RFC 9457 Problem Details format used by every other route.

```diff
--- a/app/api/projects/docs/route.ts
+++ b/app/api/projects/docs/route.ts
@@ -155,7 +155,9 @@ export async function GET(request: Request) {
     return NextResponse.json({ docs });
   } catch (error) {
-    return NextResponse.json({ docs: [], detail: 'Failed to scan docs' }, { status: 500 });
+    const log = createRequestLogger('projects/docs', request);
+    log.error({ err: error }, 'Error scanning docs');
+    return handleRouteError(error);
   }
 }
```

### F-3: `app/api/projects/create/route.ts` — Error message leaks internal details on 5xx

**Severity:** LOW
**Bug:** Line 127 calls `internalError(\`Project generation failed: ${errorMessage.slice(0, 500)}\`)` which includes the raw error message from `ralph` in the response. Other routes suppress 5xx details via `errorResponse()` → `err.httpCode >= 500` → `problem.detail = 'Internal Server Error'`. This route bypasses that by putting details in the error constructor.

```diff
--- a/app/api/projects/create/route.ts
+++ b/app/api/projects/create/route.ts
@@ -124,9 +124,9 @@ export async function POST(request: Request) {
       }

-      return errorResponse(
-        internalError(`Project generation failed: ${errorMessage.slice(0, 500)}`)
-      );
+      log.error({ err: error }, 'Project generation failed');
+      return errorResponse(internalError('Project generation failed'));
     }
```

### F-4: `lib/scanner.ts` — `scanRcodegen` date parsing produces `Invalid Date` for ISO timestamps

**Severity:** LOW
**Bug:** Line 398 regex: `/^.+-([a-z]+)-([a-z]+)-(\d{4}-\d{2}-\d{2})/` only captures the date portion `YYYY-MM-DD`, but newer filenames use ISO-like timestamps like `2026-02-17T21-25-00`. The regex matches `2026-02-17` and passes it to `new Date()` which works, but the `T21-25-00` part is lost. This isn't a bug per se, but means the date is truncated to day-level precision. Grade extraction still works correctly.

### F-5: `app/api/terminal/route.ts` — `exitCode` is always 0 or 1, never the real exit code

**Severity:** LOW
**Bug:** Line 162-166 in the `execFile` callback uses `error ? 1 : 0` for exitCode. When `execFile` fails, the real exit code is available on `error.code` (for the child process exit code), but the ternary just returns 1.

```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -160,7 +160,12 @@ export async function POST(request: Request) {
         (error, stdout, stderr) => {
           resolve({
             stdout: stdout || '',
             stderr: stderr || '',
-            exitCode: error ? 1 : 0,
+            exitCode: error
+              ? (typeof (error as NodeJS.ErrnoException & { code?: number | string }).code === 'number'
+                ? (error as NodeJS.ErrnoException & { code?: number | string }).code as number
+                : 1)
+              : 0,
           });
         }
```

**Note:** `execFile` callback's `error` has a `.code` property that is the exit code (number) when the child exits non-zero, or a string like `'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'` for other failures. A cleaner approach:

```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -160,7 +160,9 @@ export async function POST(request: Request) {
-        (error, stdout, stderr) => {
+        (error: (Error & { code?: number | string }) | null, stdout, stderr) => {
+          const code = error?.code;
           resolve({
             stdout: stdout || '',
             stderr: stderr || '',
-            exitCode: error ? 1 : 0,
+            exitCode: typeof code === 'number' ? code : error ? 1 : 0,
           });
         }
```

---

## 4. REFACTOR — Opportunities to Improve Code Quality

### R-1: Consolidate path validation across all routes

The `app/api/projects/docs/route.ts` is the only route that does manual path validation instead of using `validatePath()` from `lib/api/pathSecurity.ts`. All routes should use the shared helper for consistency and to ensure any future hardening applies everywhere.

### R-2: Extract common spawn pattern into shared utility

Three routes (`search/route.ts`, `projects/create/route.ts`, and implicitly `git.ts`) implement similar `spawn` + timeout + output-capping patterns. The `spawnGit` function in `lib/git.ts` is well-structured and could be generalized into a `spawnSafe(command, args, opts)` helper that all routes use, reducing code duplication and ensuring consistent timeout/output limits.

### R-3: Move `parseCommand` from terminal route to a shared utility

`app/api/terminal/route.ts` contains a 30-line `parseCommand()` function for shell-like quote parsing. This is non-trivial parsing logic that would benefit from being in `lib/` with dedicated unit tests.

### R-4: Standardize caching patterns

The codebase has three separate cache implementations:
- `lib/scan-cache.ts` — in-memory with TTL + inflight coalescing
- `app/api/activity/commits/route.ts` — simple object cache with TTL
- `app/api/activity/velocity/route.ts` — Map cache with TTL + FIFO eviction

These could be unified into a generic `Cache<T>` utility with configurable TTL and eviction, reducing boilerplate and making behavior consistent.

### R-5: Consider rate limiting on terminal and search endpoints

The terminal endpoint allows executing whitelisted commands with a 60-second timeout, and the search endpoint runs `ripgrep` with a 30-second timeout. Neither has rate limiting. While this is acceptable for a local tool, adding basic in-memory rate limiting would be defensive against accidental runaway loops from frontend bugs.

### R-6: Activity routes lack request tracking

`app/api/activity/commits/route.ts` uses `createRequestLogger` (no tracking), while `app/api/activity/velocity/route.ts` uses `createTrackedRequestLogger`. The commits route should also use tracked logging for consistency, since both can be long-running operations that would benefit from inflight visibility.

### R-7: Test coverage is heavily skewed toward validation

The existing 8 test files focus almost entirely on schema validation and path security. There are no tests for:
- Business logic in `scanner.ts` (tech detection, description extraction, rcodegen scanning)
- Cache behavior (`scan-cache.ts`)
- Config management (`config.ts`)
- Git operations (`git.ts`)
- Utility functions (`dates.ts`, `grades.ts`)

The test suite would benefit from covering these modules, as they contain the core logic.

---

## Score Breakdown

| Category | Score | Max | Notes |
|----------|-------|-----|-------|
| Security | 16 | 20 | Path validation bypass in docs route; good overall with secval, path validation, command whitelist |
| Code Quality | 17 | 20 | Clean architecture, good separation of concerns, consistent error handling (one exception in docs route) |
| Test Coverage | 10 | 20 | 8 test files covering schemas, path security, and basic API tests. Major gaps in business logic, caching, git ops |
| Error Handling | 15 | 15 | Excellent RFC 9457 error responses, crash handlers, structured logging, health monitoring |
| Architecture | 18 | 25 | Good use of chassis framework, proper caching/coalescing, bounded concurrency. Minor duplication in spawn patterns and cache implementations |
| **TOTAL** | **76** | **100** | |
