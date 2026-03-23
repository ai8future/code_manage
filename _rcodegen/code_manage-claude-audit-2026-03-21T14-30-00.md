Date Created: 2026-03-21T14:30:00-07:00
TOTAL_SCORE: 72/100

# code_manage — Full Audit Report

**Auditor:** Claude:Opus 4.6
**Date:** 2026-03-21
**Version Audited:** 1.5.2
**Scope:** Security, code quality, error handling, testing, architecture, configuration

---

## Score Breakdown

| Category              | Score  | Max | Notes |
|-----------------------|--------|-----|-------|
| Security              | 18     | 25  | Strong foundations, one critical bypass in docs route |
| Code Quality          | 16     | 20  | Clean architecture, a few efficiency and promise issues |
| Error Handling        | 13     | 15  | RFC 9457, crash logging; some overly broad catches |
| Testing               | 8      | 20  | ~15% coverage, hardcoded paths, missing happy paths |
| Architecture & Design | 9      | 10  | Excellent separation, caching, bounded concurrency |
| Config & DevOps       | 8      | 10  | Good security headers, thin ESLint, no coverage config |
| **TOTAL**             | **72** | **100** | |

---

## CRITICAL Issues

### C1. Path Validation Bypass in Docs Route

**File:** `app/api/projects/docs/route.ts:58-62`
**Severity:** CRITICAL (security)

The docs route implements its own path validation instead of using the dedicated `validatePath()` from `lib/api/pathSecurity.ts`. When `fs.realpath()` fails (e.g., for a non-existent path), it falls back to the unresolved `resolvedPath`, potentially allowing crafted paths to pass the prefix check without symlink verification.

```typescript
// CURRENT (lines 58-62):
const resolvedPath = path.resolve(projectPath);
const realPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);
if (!realPath.startsWith(CODE_BASE_PATH + '/') && realPath !== CODE_BASE_PATH) {
  return errorResponse(forbiddenError('Invalid path'));
}
```

Compare with `lib/api/pathSecurity.ts` which correctly rejects when `realpath` fails for paths that must exist:

```typescript
// pathSecurity.ts correctly handles this:
try {
  const realPath = await fs.realpath(resolvedPath);
  // ...validates...
} catch {
  if (requireExists) {
    return { valid: false, error: 'Path does not exist', status: 404 };
  }
  return { valid: true, resolvedPath };
}
```

**Risk:** A symlink at a non-existent intermediate path could potentially bypass the realpath check since the fallback uses the unresolved path.

#### Patch-Ready Diff

```diff
--- a/app/api/projects/docs/route.ts
+++ b/app/api/projects/docs/route.ts
@@ -1,8 +1,9 @@
 import { NextResponse } from 'next/server';
 import { promises as fs } from 'fs';
 import path from 'path';
 import matter from 'gray-matter';
-import { CODE_BASE_PATH } from '@/lib/constants';
+import { CODE_BASE_PATH } from '@/lib/constants';
+import { validatePath } from '@/lib/api/pathSecurity';
 import { validationError, forbiddenError } from '@ai8future/errors';
 import { errorResponse } from '@/lib/api/errors';

@@ -55,10 +56,9 @@
   }

-  // Validate path is within CODE_BASE_PATH
-  const resolvedPath = path.resolve(projectPath);
-  const realPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);
-  if (!realPath.startsWith(CODE_BASE_PATH + '/') && realPath !== CODE_BASE_PATH) {
-    return errorResponse(forbiddenError('Invalid path'));
+  // Validate path using the shared security module
+  const pathResult = await validatePath(projectPath);
+  if (!pathResult.valid) {
+    return errorResponse(forbiddenError(pathResult.error));
   }
+  const resolvedPath = pathResult.resolvedPath;

   // Helper function to scan a directory for markdown files
```

---

## HIGH Issues

### H1. Unhandled Fire-and-Forget Promise in Instrumentation

**File:** `instrumentation.ts:41`
**Severity:** HIGH (reliability)

`ops.run(signal)` returns a `Promise<void>` but is never awaited. If the XyOps monitoring bridge throws, the error is silently swallowed — it won't even reach the `lifecyclePromise.catch()` handler since it's a separate promise chain.

```typescript
// CURRENT (line 41):
ops.run(signal);
registry.status('xyops monitoring bridge started');
```

#### Patch-Ready Diff

```diff
--- a/instrumentation.ts
+++ b/instrumentation.ts
@@ -38,8 +38,12 @@
         if (xyopsCfg.baseUrl && xyopsCfg.apiKey) {
           const { XyopsClient } = await import('@/lib/xyops');
           const ops = new XyopsClient(xyopsCfg);
-          ops.run(signal);
-          registry.status('xyops monitoring bridge started');
+          // Run xyops in background but log failures — don't let it crash lifecycle
+          ops.run(signal).catch((err) => {
+            crashLogger.error({ err }, 'XyOps monitoring bridge failed');
+            registry.error('xyops monitoring bridge failed', err);
+          });
+          registry.status('xyops monitoring bridge started');
         }
```

### H2. Inefficient Multi-Pass Status Counting

**File:** `app/api/projects/route.ts:52-59`
**Severity:** HIGH (performance)

Six separate `.filter()` calls iterate the full project list to compute status counts. On large codebases this is O(6n) when a single pass would be O(n).

```typescript
// CURRENT (lines 52-59):
const counts = {
  active: projectsWithMetadata.filter((p) => p.status === 'active').length,
  crawlers: projectsWithMetadata.filter((p) => p.status === 'crawlers').length,
  // ... 4 more filters
};
```

#### Patch-Ready Diff

```diff
--- a/app/api/projects/route.ts
+++ b/app/api/projects/route.ts
@@ -49,13 +49,14 @@
     });

     // Calculate counts from the already-processed list
-    const counts = {
-      active: projectsWithMetadata.filter((p) => p.status === 'active').length,
-      crawlers: projectsWithMetadata.filter((p) => p.status === 'crawlers').length,
-      research: projectsWithMetadata.filter((p) => p.status === 'research').length,
-      tools: projectsWithMetadata.filter((p) => p.status === 'tools').length,
-      icebox: projectsWithMetadata.filter((p) => p.status === 'icebox').length,
-      archived: projectsWithMetadata.filter((p) => p.status === 'archived').length,
-    };
+    const counts = { active: 0, crawlers: 0, research: 0, tools: 0, icebox: 0, archived: 0 };
+    for (const p of projectsWithMetadata) {
+      if (p.status in counts) {
+        counts[p.status as keyof typeof counts]++;
+      }
+    }

     // Filter by status
```

### H3. Unbounded Stderr Accumulation in Project Create

**File:** `app/api/projects/create/route.ts:85-87`
**Severity:** HIGH (DoS vector)

The `ralph` process stderr is accumulated without any size limit, unlike stdout which is capped at 10MB. A malfunctioning or malicious `ralph` binary writing unbounded stderr could exhaust server memory.

```typescript
// CURRENT (lines 85-87):
ralph.stderr.on('data', (data) => {
  stderr += data.toString();
});
```

#### Patch-Ready Diff

```diff
--- a/app/api/projects/create/route.ts
+++ b/app/api/projects/create/route.ts
@@ -82,8 +82,10 @@
         });

         ralph.stderr.on('data', (data) => {
-          stderr += data.toString();
+          if (stderr.length < 65536) {
+            stderr += data.toString();
+          }
         });
```

### H4. Process Environment Variable Passthrough

**File:** `app/api/projects/create/route.ts:64-67`
**Severity:** HIGH (security hygiene)

The entire `process.env` is spread into the child process. This could inadvertently expose secrets (database passwords, API keys) to the `ralph` subprocess.

```typescript
// CURRENT (lines 64-67):
env: {
  ...process.env,
  PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin`,
},
```

#### Patch-Ready Diff

```diff
--- a/app/api/projects/create/route.ts
+++ b/app/api/projects/create/route.ts
@@ -61,9 +61,12 @@
         const ralph = spawn('ralph', [description], {
           cwd: targetDir,
           stdio: ['ignore', 'pipe', 'pipe'],
           env: {
-            ...process.env,
-            PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin`,
+            PATH: `${process.env.PATH || ''}:/usr/local/bin:/opt/homebrew/bin`,
+            HOME: process.env.HOME,
+            USER: process.env.USER,
+            LANG: process.env.LANG,
+            TERM: process.env.TERM || 'xterm-256color',
           },
         });
```

---

## MEDIUM Issues

### M1. TOCTOU Race in Project Move (Minor)

**File:** `app/api/actions/move/route.ts:66-86`
**Severity:** MEDIUM (correctness)

The code checks `fs.access(targetPath)` then calls `fs.rename()` — a classic TOCTOU pattern. The catch handler for EEXIST/ENOTEMPTY is present and correct, making the pre-check redundant. The access check should be removed to simplify the logic and avoid confusion about what provides the actual atomicity guarantee.

```typescript
// CURRENT (lines 70-76):
const targetExists = await fs.access(targetPath).then(() => true).catch(() => false);
if (targetExists) {
  return errorResponse(conflictError('...'));
}
await fs.rename(resolvedSourcePath, targetPath);
```

#### Patch-Ready Diff

```diff
--- a/app/api/actions/move/route.ts
+++ b/app/api/actions/move/route.ts
@@ -63,14 +63,8 @@
     }

-    // Move the project - handle EEXIST atomically to avoid TOCTOU race
+    // Move the project — rely on rename's atomic EEXIST to avoid TOCTOU race
     try {
-      // First check if target exists (for better error message)
-      // but handle race condition in the rename error handler
-      const targetExists = await fs.access(targetPath).then(() => true).catch(() => false);
-      if (targetExists) {
-        return errorResponse(
-          conflictError('A project with this name already exists in the target location')
-        );
-      }
       await fs.rename(resolvedSourcePath, targetPath);
     } catch (renameError) {
```

### M2. Stderr Cap Approximation in git.ts

**File:** `lib/git.ts:62-67`
**Severity:** MEDIUM (minor buffer overrun)

The stderr cap checks `stderr.length < 4096` but then appends `data.toString()` which could be arbitrarily large, overshooting the cap.

```typescript
// CURRENT (lines 62-66):
git.stderr.on('data', (data: Buffer) => {
  if (stderr.length < 4096) {
    stderr += data.toString();
  }
});
```

#### Patch-Ready Diff

```diff
--- a/lib/git.ts
+++ b/lib/git.ts
@@ -60,8 +60,10 @@

     git.stderr.on('data', (data: Buffer) => {
       // Cap stderr accumulation to prevent memory issues
-      if (stderr.length < 4096) {
-        stderr += data.toString();
+      if (stderr.length < 4096) {
+        const chunk = data.toString();
+        const remaining = 4096 - stderr.length;
+        stderr += remaining >= chunk.length ? chunk : chunk.slice(0, remaining);
       }
     });
```

### M3. Docs Route Returns Generic 500 for All Errors

**File:** `app/api/projects/docs/route.ts:157-158`
**Severity:** MEDIUM (diagnostics)

The outer try/catch returns a generic 500 with no logging and no error details, making production debugging nearly impossible.

```typescript
// CURRENT (lines 157-158):
} catch (error) {
  return NextResponse.json({ docs: [], detail: 'Failed to scan docs' }, { status: 500 });
}
```

#### Patch-Ready Diff

```diff
--- a/app/api/projects/docs/route.ts
+++ b/app/api/projects/docs/route.ts
@@ -1,5 +1,6 @@
 import { NextResponse } from 'next/server';
 import { promises as fs } from 'fs';
 import path from 'path';
 import matter from 'gray-matter';
 import { CODE_BASE_PATH } from '@/lib/constants';
+import { createRequestLogger } from '@/lib/logger';
 import { validationError, forbiddenError } from '@ai8future/errors';
@@ -49,6 +50,7 @@
 export async function GET(request: Request) {
+  const log = createRequestLogger('projects/docs', request);
   const { searchParams } = new URL(request.url);

@@ -155,5 +157,6 @@
     return NextResponse.json({ docs });
   } catch (error) {
+    log.error({ err: error }, 'Failed to scan docs');
     return NextResponse.json({ docs: [], detail: 'Failed to scan docs' }, { status: 500 });
   }
 }
```

### M4. Invalid Date Silently Produces Bad ISO String

**File:** `lib/scanner.ts:411`
**Severity:** MEDIUM (data integrity)

`new Date(dateStr)` with a malformed date creates an Invalid Date object. The subsequent `.toISOString()` throws `RangeError: Invalid Time Value`, causing the entire grade to be skipped silently.

```typescript
// CURRENT (line 411):
date: new Date(dateStr).toISOString(),
```

#### Patch-Ready Diff

```diff
--- a/lib/scanner.ts
+++ b/lib/scanner.ts
@@ -408,7 +408,9 @@
           const gradeMatch = searchContent.match(/TOTAL_SCORE:\s*(\d+(?:\.\d+)?)\s*\/\s*100/i);
           if (gradeMatch) {
+            const parsedDate = new Date(dateStr);
+            const isoDate = isNaN(parsedDate.getTime()) ? dateStr : parsedDate.toISOString();
             grades.push({
-              date: new Date(dateStr).toISOString(),
+              date: isoDate,
               tool: tool as RcodegenGrade['tool'],
               task: task as RcodegenGrade['task'],
```

---

## LOW Issues

### L1. Console.error in Client Hooks Instead of Toast-Only

**File:** `lib/hooks/useProjectActions.ts:16, 30`
**Severity:** LOW

Uses `console.error()` alongside toast notifications. In production, console output goes nowhere useful. The toast already handles user feedback.

### L2. Hardcoded macOS Paths in Create Route

**File:** `app/api/projects/create/route.ts:66`
**Severity:** LOW (portability)

`/usr/local/bin:/opt/homebrew/bin` are macOS-specific. Not a concern for the current deployment model but would break on Linux.

### L3. determineStatus Iterates All Path Parts

**File:** `lib/scanner.ts:477-488`
**Severity:** LOW (micro-optimization)

Status folders are always at the root level relative to CODE_BASE_PATH, so only `parts[0]` needs checking. The loop iterates all path segments unnecessarily.

#### Patch-Ready Diff

```diff
--- a/lib/scanner.ts
+++ b/lib/scanner.ts
@@ -477,11 +477,8 @@
 export function determineStatus(projectPath: string): ProjectStatus {
   const relativePath = path.relative(CODE_BASE_PATH, projectPath);
   const parts = relativePath.split(path.sep);
-
-  for (const part of parts) {
-    if (FOLDER_TO_STATUS[part]) {
-      return FOLDER_TO_STATUS[part];
-    }
+  if (parts.length > 0 && FOLDER_TO_STATUS[parts[0]]) {
+    return FOLDER_TO_STATUS[parts[0]];
   }

   return 'active';
```

### L4. Velocity Cache Uses FIFO Instead of LRU

**File:** `app/api/activity/velocity/route.ts:12-14`
**Severity:** LOW

The velocity cache evicts the oldest entry (FIFO) rather than the least recently used. Under varied access patterns, this leads to suboptimal cache hit rates. Not significant with the current 10-entry limit.

### L5. Incomplete Type Narrowing in File Route

**File:** `app/api/file/route.ts:28-30`
**Severity:** LOW

Uses `error instanceof Error && 'code' in error` followed by a type assertion to `NodeJS.ErrnoException`. A type guard function would be more robust.

---

## Testing Assessment

**Current State: 8 test files, ~61 tests, ~15% code coverage**

### What's Tested (Well)
- Zod schema validation (29 tests) — thorough boundary testing
- Path security module (7 tests) — traversal and symlink coverage
- Terminal command whitelisting (4 tests) — basic coverage
- File endpoint security (4 tests) — traversal protection

### Critical Testing Gaps

| Untested Route/Module | Risk |
|-----------------------|------|
| `GET /api/projects` | Core listing, filtering, counting |
| `GET /api/search` | Ripgrep integration, output parsing |
| `POST /api/projects/create` | Project creation, ralph integration, rollback |
| `GET/PATCH /api/projects/[slug]` | Single project CRUD |
| `GET/PUT /api/projects/docs/[filename]` | Doc file operations |
| `GET /api/activity/commits` | Git history |
| `GET /api/activity/velocity` | Velocity metrics |
| `POST /api/actions/open-editor` | VS Code integration |
| `GET /api/health` | Health check |
| `lib/config.ts` | Config read/write with locking |
| `lib/scan-cache.ts` | Cache coalescing logic |
| `lib/scanner.ts` (most functions) | Tech detection, description extraction, git info |

### Test Quality Issues

1. **Hardcoded dev machine paths** — `/Users/cliff/Desktop/_code/` appears in 5+ test files. Tests will fail on any other machine or CI environment.

2. **Missing happy path tests** — `file.test.ts`, `readme.test.ts`, and `move.test.ts` only test error cases, not successful operations.

3. **No test fixtures or setup** — No `beforeEach`/`afterEach`, no temp directories, no mocks for filesystem or external processes.

4. **No coverage configuration** — `vitest.config.ts` has no coverage settings, no reporters.

---

## Positive Findings

### Security Strengths
- **Path security module** (`lib/api/pathSecurity.ts`) — dual-layer validation with resolve + realpath is excellent
- **Command injection prevention** — whitelist + `execFile()`/`spawn()` with array args, no shell interpretation
- **Secure body parsing** — Zod validation + prototype pollution guards via `@ai8future/secval`
- **Output size limits** — 5MB for git/search, 2MB for terminal, with timeouts on all spawned processes
- **Security headers** — X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy in next.config
- **Log redaction** — sensitive fields automatically redacted via `@ai8future/logger`

### Architecture Strengths
- **Clean module separation** — clear boundaries between scanner, config, cache, API, and UI layers
- **Request coalescing** — `scan-cache.ts` prevents N concurrent requests from triggering N scans
- **Bounded concurrency** — `workMap()` with semaphore prevents OS resource exhaustion
- **Graceful shutdown** — `@ai8future/lifecycle` handles SIGTERM/SIGINT cleanly
- **Crash diagnostics** — sync file logger, health snapshots, inflight request tracking

### Code Quality Strengths
- **Consistent error format** — RFC 9457 Problem Details throughout
- **Structured logging** — Pino with per-route child loggers and request IDs
- **TypeScript strict mode** — catches type errors at compile time
- **Buffer-safe output collection** — array-based chunk buffering avoids O(n^2) string concatenation

---

## Recommendations (Priority Order)

1. **Fix C1 immediately** — Use `validatePath()` in docs route instead of custom inline validation
2. **Add `.catch()` to xyops promise (H1)** — silent monitoring failures undermine observability
3. **Add test coverage for untested API routes** — especially search, create, and project listing
4. **Parametrize test paths** — use `process.env.CODE_BASE_PATH` instead of hardcoded `/Users/cliff/...`
5. **Add vitest coverage configuration** — track coverage metrics and set minimum thresholds
6. **Cap stderr in create route (H3)** — prevent potential memory exhaustion
7. **Whitelist env vars for child processes (H4)** — defense-in-depth against secret leakage
8. **Add rate limiting** — especially on `/api/terminal` and `/api/search` endpoints
9. **Expand ESLint configuration** — add security and error-handling rules beyond Next.js defaults

---

*Report generated by Claude:Opus 4.6 on 2026-03-21*
