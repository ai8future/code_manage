Date Created: 2026-02-17T23:15:00-05:00
TOTAL_SCORE: 54/100

# Code Manage — Cross-Report Fix Analysis

**Auditor:** Claude:Opus 4.6
**Project:** code_manage v1.4.x
**Framework:** Next.js 16 (App Router) + React 18 + TypeScript
**Date:** 2026-02-17
**Method:** Analyzed 11 rcodegen reports (most recent per base name, excluding test reports), verified each finding against current source code, deduplicated, and graded.

---

## Reports Analyzed

| Report | Date | Type | Score |
|--------|------|------|-------|
| claude-audit-2026-02-17T22-30-00 | 2026-02-17 | Audit | 52/100 |
| claude-audit-2026-02-17T21-25-00 | 2026-02-17 | Audit | 72/100 |
| claude-fix-2026-01-28_142001 | 2026-01-28 | Fix | 74/100 |
| claude-quick-2026-01-28_165430 | 2026-01-28 | Quick | 58/100 |
| claude-refactor-2026-01-28_163200 | 2026-01-28 | Refactor | 76/100 |
| codex-audit-2026-01-28_183423 | 2026-01-28 | Audit | 68/100 |
| codex-fix-2026-01-28_185034 | 2026-01-28 | Fix | 84/100 |
| codex-quick-2026-01-28_185955 | 2026-01-28 | Quick | 76/100 |
| codex-refactor-2026-01-28-185516 | 2026-01-28 | Refactor | 84/100 |
| gemini-audit-2026-02-04_120000 | 2026-02-04 | Audit | 83/100 |
| gemini-fix-2026-02-04_120000 | 2026-02-04 | Fix | 80/100 |
| gemini-quick-2026-02-04_120000 | 2026-02-04 | Quick | 85/100 |
| gemini-refactor-2026-02-04_120000 | 2026-02-04 | Refactor | 83/100 |

---

## Score Breakdown

| Category | Score | Max | Notes |
|----------|-------|-----|-------|
| Security | 12 | 30 | Terminal route: find -exec, unrestricted git, file-read commands bypass path validation. Docs route bypasses validatePath. pathSecurity symlink escape on non-existent parents. |
| Code Quality | 14 | 20 | Good patterns but: NaN propagation in 2 routes, no max lengths on Zod schemas, search param uncapped, writeConfig not atomic, process.exit in mustLoad |
| Architecture | 12 | 15 | Clean separation; config write is public and non-atomic, velocity cache unbounded |
| Test Coverage | 5 | 20 | Unchanged from prior audits — 3 of 14 API routes tested; 0 tests for security paths |
| Frontend Quality | 11 | 15 | Clean Tailwind; date formatting broken for edge cases, toast timer leak, missing CSP header |
| **TOTAL** | **54** | **100** | |

---

## Verified Findings — Still Present in Current Code

### CRITICAL-1: Terminal Route — `find -exec` Enables Arbitrary Command Execution

**File:** `app/api/terminal/route.ts:14-17`
**Confidence:** 92%
**Reports:** claude-audit-22:30
**Verified:** YES — `find` is in `ALLOWED_COMMANDS`, `validateCommandArgs` has no check for `-exec`/`-execdir`/`-delete`

`find / -name "*.pem" -exec cat {} \;` executes arbitrary commands via the terminal API.

```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -23,6 +23,9 @@ const BLOCKED_NPX_ARGS = new Set(['--yes', '-y', '--package', '-p']);
+// Dangerous find arguments that enable code execution or destructive operations
+const BLOCKED_FIND_ARGS = new Set(['-exec', '-execdir', '-delete', '-ok', '-okdir']);
+
 function validateCommandArgs(baseCommand: string, args: string[]): string | null {
+  // Block dangerous find arguments
+  if (baseCommand === 'find') {
+    for (const arg of args) {
+      if (BLOCKED_FIND_ARGS.has(arg)) {
+        return `find argument '${arg}' is not allowed for security reasons`;
+      }
+    }
+  }
+
   // Block dangerous node arguments
```

---

### CRITICAL-2: Terminal Route — `cat`/`head`/`tail`/`grep` Allow Reading Any File

**File:** `app/api/terminal/route.ts:14-17`
**Confidence:** 90%
**Reports:** claude-audit-22:30, codex-audit, codex-fix, codex-quick
**Verified:** YES — No path argument validation exists for these commands

`cat /etc/passwd`, `grep -r "password" /etc/` all work from the terminal API.

```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -23,6 +23,8 @@ const BLOCKED_NPX_ARGS = new Set(['--yes', '-y', '--package', '-p']);
+const PATH_SENSITIVE_COMMANDS = new Set(['cat', 'head', 'tail', 'grep', 'find', 'ls']);
+
 // After validateCommandArgs check in POST handler (~line 146):
+    // Block absolute paths and traversal in path-sensitive commands
+    if (PATH_SENSITIVE_COMMANDS.has(baseCommand)) {
+      for (const arg of args) {
+        if (arg.startsWith('-')) continue;
+        if (arg.startsWith('/') && !arg.startsWith(CODE_BASE_PATH + '/')) {
+          return errorResponse(forbiddenError('Absolute paths outside the code base are not allowed'));
+        }
+        if (arg.includes('..')) {
+          return errorResponse(forbiddenError('Path traversal sequences are not allowed'));
+        }
+      }
+    }
```

---

### CRITICAL-3: Terminal Route — `git` Has No Subcommand Restrictions

**File:** `app/api/terminal/route.ts:14-17`
**Confidence:** 85%
**Reports:** claude-audit-22:30, codex-quick
**Verified:** YES — `git` is whitelisted with zero subcommand filtering

`git config --global core.hooksPath /tmp/evil`, `git clone file:///etc/passwd` all work.

```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -23,6 +23,12 @@ const BLOCKED_NPX_ARGS = new Set(['--yes', '-y', '--package', '-p']);
+const ALLOWED_GIT_SUBCOMMANDS = new Set([
+  'status', 'log', 'diff', 'show', 'branch', 'tag', 'stash', 'blame',
+  'rev-parse', 'shortlog', 'describe', 'ls-files', 'ls-tree', 'remote',
+]);
+
 function validateCommandArgs(baseCommand: string, args: string[]): string | null {
+  // Restrict git to read-only subcommands
+  if (baseCommand === 'git') {
+    const subcommand = args.find(a => !a.startsWith('-'));
+    if (!subcommand || !ALLOWED_GIT_SUBCOMMANDS.has(subcommand)) {
+      return `git '${subcommand ?? '(none)'}' is not allowed for security reasons`;
+    }
+  }
+
   // Block dangerous node arguments
```

---

### CRITICAL-4: `docs/route.ts` Bypasses `validatePath()` — Uses Unsafe Inline Check

**File:** `app/api/projects/docs/route.ts:57-62`
**Confidence:** 100%
**Reports:** claude-audit-22:30, codex-audit, codex-quick, gemini-quick
**Verified:** YES — Uses inline `path.resolve` + `startsWith` + `.catch(() => resolvedPath)` fallback. Does not use `validatePath`. Per-file reads in `scanDirectory` have no realpath check. Error handler at line 158 does not use `handleRouteError`.

```diff
--- a/app/api/projects/docs/route.ts
+++ b/app/api/projects/docs/route.ts
@@ -5,7 +5,9 @@ import matter from 'gray-matter';
 import { CODE_BASE_PATH } from '@/lib/constants';
 import { validationError, forbiddenError } from '@/lib/chassis/errors';
-import { errorResponse } from '@/lib/api/errors';
+import { errorResponse, handleRouteError, pathErrorResponse } from '@/lib/api/errors';
+import { validatePath } from '@/lib/api/pathSecurity';
+import { createRequestLogger } from '@/lib/logger';

 export async function GET(request: Request) {
+  const log = createRequestLogger('projects/docs', request);
   const { searchParams } = new URL(request.url);
@@ -57,10 +59,9 @@ export async function GET(request: Request) {
-  // Validate path is within CODE_BASE_PATH
-  const resolvedPath = path.resolve(projectPath);
-  const realPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);
-  if (!realPath.startsWith(CODE_BASE_PATH + '/') && realPath !== CODE_BASE_PATH) {
-    return errorResponse(forbiddenError('Invalid path'));
-  }
+  const validation = await validatePath(projectPath, { requireExists: false });
+  if (!validation.valid) {
+    return pathErrorResponse(validation.error, validation.status);
+  }
+  const resolvedPath = validation.resolvedPath;

@@ -157,3 +158,4 @@
   } catch (error) {
-    return NextResponse.json({ docs: [], detail: 'Failed to scan docs' }, { status: 500 });
+    log.error({ err: error }, 'Error scanning docs');
+    return handleRouteError(error);
   }
```

---

### HIGH-1: `pathSecurity.ts` — Symlink Escape via Non-Existent Parent Directory

**File:** `lib/api/pathSecurity.ts:36-42`
**Confidence:** 88%
**Reports:** claude-audit-22:30
**Verified:** YES — When `requireExists: false`, catch block returns unverified `resolvedPath` without checking parent directory's realpath

Attack: Create symlink `CODE_BASE_PATH/evil-link -> /etc/`, request `path=evil-link/newfile` with `requireExists: false`. `realpath()` fails (newfile doesn't exist), catch returns `resolvedPath` which follows the symlink on `fs.writeFile`.

```diff
--- a/lib/api/pathSecurity.ts
+++ b/lib/api/pathSecurity.ts
@@ -36,5 +36,14 @@ export async function validatePath(
   } catch {
     if (requireExists) {
       return { valid: false, error: 'Path does not exist', status: 404 };
     }
-    // Path doesn't exist yet (for new files) - use the resolved path
+    // Path doesn't exist yet — verify the parent directory is safe
+    const parentDir = path.dirname(resolvedPath);
+    try {
+      const realParent = await fs.realpath(parentDir);
+      if (!realParent.startsWith(CODE_BASE_PATH + '/') && realParent !== CODE_BASE_PATH) {
+        return { valid: false, error: 'Invalid path: symlink outside allowed directory', status: 403 };
+      }
+    } catch {
+      // Parent also doesn't exist — the prefix check on resolvedPath is sufficient
+    }
     return { valid: true, resolvedPath };
```

---

### HIGH-2: `docs/[filename]/route.ts` — Missing Null-Byte Check

**File:** `app/api/projects/docs/[filename]/route.ts:33,85`
**Confidence:** 85%
**Reports:** claude-audit-22:30
**Verified:** YES — Checks `/`, `\`, `..` but not `\0` or dot-only filenames

```diff
--- a/app/api/projects/docs/[filename]/route.ts
+++ b/app/api/projects/docs/[filename]/route.ts
@@ -33 +33 @@
-  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
+  if (filename.includes('/') || filename.includes('\\') || filename.includes('..') || filename.includes('\0') || /^\.+$/.test(filename)) {

 // Apply identical change at line 85 (PUT handler)
```

---

### HIGH-3: `writeConfig()` Is Exported and Non-Atomic

**File:** `lib/config.ts:68-71`
**Confidence:** 85%
**Reports:** claude-audit-22:30
**Verified:** YES — `writeConfig` is `export async function`, uses direct `fs.writeFile` (no temp+rename)

```diff
--- a/lib/config.ts
+++ b/lib/config.ts
@@ -68,4 +68,6 @@
-export async function writeConfig(config: CodeManageConfig): Promise<void> {
+async function writeConfig(config: CodeManageConfig): Promise<void> {
   const configPath = getConfigPath();
-  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
+  const tmpPath = `${configPath}.tmp.${process.pid}`;
+  await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
+  await fs.rename(tmpPath, configPath);
 }
```

---

### HIGH-4: `parseInt` NaN Propagation in Commits and Velocity Routes

**File:** `app/api/activity/commits/route.ts:18-21`, `app/api/activity/velocity/route.ts:18-21`
**Confidence:** 95%
**Reports:** claude-audit-21:25
**Verified:** YES — `parseInt('abc', 10)` returns NaN, `Math.max(NaN, 1)` returns NaN, propagates to git `--since=NaN days ago`

```diff
--- a/app/api/activity/commits/route.ts
+++ b/app/api/activity/commits/route.ts
@@ -18,4 +18,5 @@
   const limitParam = searchParams.get('limit');
-  const limit = limitParam
-    ? Math.min(Math.max(parseInt(limitParam, 10), API_LIMITS.COMMITS_LIMIT_MIN), API_LIMITS.COMMITS_LIMIT_MAX)
-    : API_LIMITS.COMMITS_LIMIT_DEFAULT;
+  const parsedLimit = limitParam ? parseInt(limitParam, 10) : NaN;
+  const limit = Number.isNaN(parsedLimit)
+    ? API_LIMITS.COMMITS_LIMIT_DEFAULT
+    : Math.min(Math.max(parsedLimit, API_LIMITS.COMMITS_LIMIT_MIN), API_LIMITS.COMMITS_LIMIT_MAX);
```

```diff
--- a/app/api/activity/velocity/route.ts
+++ b/app/api/activity/velocity/route.ts
@@ -18,4 +18,5 @@
   const daysParam = searchParams.get('days');
-  const days = daysParam
-    ? Math.min(Math.max(parseInt(daysParam, 10), API_LIMITS.VELOCITY_DAYS_MIN), API_LIMITS.VELOCITY_DAYS_MAX)
-    : API_LIMITS.VELOCITY_DAYS_DEFAULT;
+  const parsedDays = daysParam ? parseInt(daysParam, 10) : NaN;
+  const days = Number.isNaN(parsedDays)
+    ? API_LIMITS.VELOCITY_DAYS_DEFAULT
+    : Math.min(Math.max(parsedDays, API_LIMITS.VELOCITY_DAYS_MIN), API_LIMITS.VELOCITY_DAYS_MAX);
```

---

### HIGH-5: `search/route.ts` — User Query Treated as Regex by `rg`

**File:** `app/api/search/route.ts:57-64`
**Confidence:** 80%
**Reports:** claude-audit-22:30, claude-audit-21:25
**Verified:** YES — No `--fixed-strings` flag in rg args array

```diff
--- a/app/api/search/route.ts
+++ b/app/api/search/route.ts
@@ -57,6 +57,7 @@
     const args = [
       '--json',
+      '--fixed-strings',
       '--max-count=10',
       '--max-filesize=1M',
```

---

### HIGH-6: `[slug]/route.ts` — PATCH Handler Doesn't Validate Slug or Verify Project Exists

**File:** `app/api/projects/[slug]/route.ts:48-60`
**Confidence:** 95%
**Reports:** claude-audit-21:25
**Verified:** YES — `slug` from URL passed directly to `setProjectMetadata` with no regex validation or existence check

```diff
--- a/app/api/projects/[slug]/route.ts
+++ b/app/api/projects/[slug]/route.ts
@@ -8,6 +8,9 @@ import { errorResponse, handleRouteError } from '@/lib/api/errors';
+import { validationError } from '@/lib/chassis/errors';
+
+const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$|^[a-z0-9]$/;

 export async function PATCH(
@@ -53,6 +56,14 @@
   const { slug } = await params;

+  if (!SLUG_RE.test(slug)) {
+    return errorResponse(validationError('Invalid project slug'));
+  }
+
   try {
+    const projects = await getCachedProjects();
+    if (!projects.find((p) => p.slug === slug)) {
+      return errorResponse(notFoundError('Project not found'));
+    }
+
     const rawBody = await request.text();
```

---

### HIGH-7: Schema String Fields Have No Max Length

**File:** `lib/schemas.ts:9-16,49-52`
**Confidence:** 90%
**Reports:** claude-audit-21:25
**Verified:** YES — `customName`, `customDescription`, `notes` are unbounded. `SearchQuerySchema.q` has no `.max()`.

```diff
--- a/lib/schemas.ts
+++ b/lib/schemas.ts
@@ -9,10 +9,10 @@
 export const UpdateProjectSchema = z.object({
   status: ProjectStatusSchema.optional(),
-  customName: z.string().optional(),
-  customDescription: z.string().optional(),
-  tags: z.array(z.string()).optional(),
-  notes: z.string().optional(),
+  customName: z.string().max(200).optional(),
+  customDescription: z.string().max(1000).optional(),
+  tags: z.array(z.string().max(50)).max(20).optional(),
+  notes: z.string().max(10000).optional(),
   starred: z.boolean().optional(),
 });

@@ -49,3 +49,3 @@
 export const SearchQuerySchema = z.object({
-  q: z.string().min(1, { error: 'Search query is required' }),
-  limit: z.coerce.number().int().positive().optional(),
+  q: z.string().min(1, { error: 'Search query is required' }).max(200, { error: 'Search query too long' }),
+  limit: z.coerce.number().int().positive().max(500).optional(),
 });
```

---

### HIGH-8: Search Param Length Uncapped in Projects Route

**File:** `app/api/projects/route.ts:16`
**Confidence:** 85%
**Reports:** claude-audit-21:25
**Verified:** YES — `searchParams.get('search')` has no length limit

```diff
--- a/app/api/projects/route.ts
+++ b/app/api/projects/route.ts
@@ -16 +16,2 @@
-  const search = searchParams.get('search')?.toLowerCase();
+  const rawSearch = searchParams.get('search');
+  const search = rawSearch ? rawSearch.slice(0, 200).toLowerCase() : undefined;
```

---

### HIGH-9: `process.exit(1)` in `mustLoad` Kills Next.js Server

**File:** `lib/chassis/config.ts:39-40`
**Confidence:** 92%
**Reports:** claude-audit-21:25
**Verified:** YES — `process.exit(1)` on config validation failure hard-kills the Next.js process during HMR, SSR, and API route loading

```diff
--- a/lib/chassis/config.ts
+++ b/lib/chassis/config.ts
@@ -39,2 +39,1 @@
-    console.error(`config: validation failed\n${lines.join('\n')}`);
-    process.exit(1);
+    throw new Error(`config: validation failed\n${lines.join('\n')}`);
   }
-
-  return result.data;
+  return result.data;
```

---

### MEDIUM-1: Missing CSP Header; Deprecated X-XSS-Protection

**File:** `next.config.mjs:16-19`
**Confidence:** 90%
**Reports:** claude-audit-21:25, codex-audit
**Verified:** YES — `X-XSS-Protection: 1; mode=block` still set (deprecated, removed by Chrome 2019), no CSP header

```diff
--- a/next.config.mjs
+++ b/next.config.mjs
@@ -16,4 +16,8 @@
-          {
-            key: 'X-XSS-Protection',
-            value: '1; mode=block',
-          },
+          {
+            key: 'Content-Security-Policy',
+            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none';",
+          },
+          {
+            key: 'Permissions-Policy',
+            value: 'camera=(), microphone=(), geolocation=()',
+          },
```

---

### MEDIUM-2: `formatRelativeDate` — Invalid Dates, Future Dates, Singular Units

**File:** `lib/utils/dates.ts`
**Confidence:** 95%
**Reports:** codex-fix, claude-audit-22:30
**Verified:** YES — No `isNaN` guard, negative `diffMs` not clamped, `"1 weeks ago"` grammar error

```diff
--- a/lib/utils/dates.ts
+++ b/lib/utils/dates.ts
@@ -1,13 +1,24 @@
 export function formatRelativeDate(dateString: string): string {
   const date = new Date(dateString);
+  if (Number.isNaN(date.getTime())) return 'Unknown';
   const now = new Date();
-  const diffMs = now.getTime() - date.getTime();
+  let diffMs = now.getTime() - date.getTime();
+  if (diffMs < 0) diffMs = 0;
   const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

   if (diffDays === 0) return 'Today';
   if (diffDays === 1) return 'Yesterday';
   if (diffDays < 7) return `${diffDays} days ago`;
-  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
-  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
-  return `${Math.floor(diffDays / 365)} years ago`;
+  if (diffDays < 30) {
+    const weeks = Math.floor(diffDays / 7);
+    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
+  }
+  if (diffDays < 365) {
+    const months = Math.floor(diffDays / 30);
+    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
+  }
+  const years = Math.floor(diffDays / 365);
+  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
 }

 export function formatShortDate(dateString: string): string {
   const date = new Date(dateString);
+  if (Number.isNaN(date.getTime())) return 'Unknown';
   return date.toLocaleDateString('en-US', {
```

---

### MEDIUM-3: Velocity Cache Never Evicts Stale Entries

**File:** `app/api/activity/velocity/route.ts:107-108`
**Confidence:** 80%
**Reports:** claude-audit-22:30, claude-audit-21:25
**Verified:** YES — `velocityCache.set()` only adds, never removes old entries

```diff
--- a/app/api/activity/velocity/route.ts
+++ b/app/api/activity/velocity/route.ts
@@ -107,1 +107,5 @@
     // Cache result
+    // Evict stale cache entries
+    for (const [key, entry] of velocityCache) {
+      if (Date.now() - entry.ts >= VELOCITY_CACHE_TTL) velocityCache.delete(key);
+    }
     velocityCache.set(days, { data, ts: Date.now() });
```

---

### MEDIUM-4: Terminal `exitCode` Always Returns 1 on Error

**File:** `app/api/terminal/route.ts:166`
**Confidence:** 82%
**Reports:** claude-audit-22:30
**Verified:** YES — `exitCode: error ? 1 : 0` discards actual exit code (e.g., grep returns 1 for no matches)

```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -166 +166,4 @@
-            exitCode: error ? 1 : 0,
+            exitCode: error
+              ? (typeof (error as NodeJS.ErrnoException).code === 'number'
+                ? (error as NodeJS.ErrnoException).code as number
+                : 1)
+              : 0,
```

---

## Issues Reported But NOT Confirmed (Already Fixed or Invalid)

| Issue | Status | Notes |
|-------|--------|-------|
| Command injection via `exec()` | FIXED | Terminal route now uses `execFile` with args array |
| Missing `CODE_BASE_PATH` centralization | FIXED | Centralized in `lib/constants.ts` |
| `useClickOutside` hook missing | FIXED | Exists at `lib/hooks/useClickOutside.ts` |
| `useProjectActions` hook missing | FIXED | Exists at `lib/hooks/useProjectActions.ts` |
| `createOpenActionRoute` missing | FIXED | Exists at `lib/api/createOpenActionRoute.ts` |
| SidebarProjectList double-click bug | NOT CONFIRMED | Reviewed — event handling is correct |
| `ReadmePreview` javascript: URI XSS | NOT CONFIRMED | React's JSX escaping handles this |
| `ProjectTable` stale useMemo | LOW RISK | `handleToggleStar` is stable in practice |
| Missing path validation in move API | FIXED | Move route uses `validatePath` |
| README path traversal | FIXED | README route uses `validatePath` |
| Symlink bypass in file API | FIXED | File route uses `validatePath` with realpath |

---

## Summary

| Severity | Count | Key Areas |
|----------|-------|-----------|
| CRITICAL | 4 | Terminal route (find -exec, file reads, git), docs route path bypass |
| HIGH | 9 | pathSecurity symlink, null byte, config write, NaN propagation, search regex, slug validation, schema lengths, search cap, process.exit |
| MEDIUM | 4 | CSP header, date formatting, velocity cache, terminal exitCode |
| **Total** | **17** | **15 files affected** |

## Implementation Plan

A detailed fix plan with exact code changes organized into 5 independent waves (terminal security, docs/path security, input validation, search/config, date/cache/CSP) has been saved to `docs/plans/2026-02-17-rcodegen-fixes.md`.

---

*End of cross-report fix analysis.*
