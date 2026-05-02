Date Created: 2026-02-17T22:30:00-05:00
Date Updated: 2026-02-17T23:30:00-05:00
TOTAL_SCORE: 52/100

# Code Manage — Full Security & Code Quality Audit

**Auditor:** Claude:Opus 4.6
**Project:** code_manage v1.4.3
**Framework:** Next.js 16 (App Router) + React 18 + TypeScript
**Date:** 2026-02-17

---

## Score Breakdown

| Category | Score | Max | Notes |
|----------|-------|-----|-------|
| Security | 13 | 30 | Critical: terminal route allows arbitrary FS reads + `find -exec`; docs route bypasses `validatePath`; symlink escape on non-existent paths |
| Code Quality | 13 | 20 | Good Zod/error patterns but inconsistent error handling, race conditions, double-click bug |
| Architecture | 12 | 15 | Clean separation of concerns; module-level caches lack concurrency guards |
| Test Coverage | 5 | 20 | 3 of 14 API routes tested; 0 of 4 chassis modules tested; security module (secval) has 0 tests; pathSecurity tests are machine-specific |
| Frontend Quality | 9 | 15 | Clean Tailwind; but terminal Ctrl+C doesn't cancel, toast memory leak, missing fetch abort, accessibility gaps |
| **TOTAL** | **52** | **100** | |

---

## Table of Contents

1. [CRITICAL Findings](#1-critical-findings)
2. [HIGH Findings](#2-high-findings)
3. [MEDIUM Findings](#3-medium-findings)
4. [LOW Findings](#4-low-findings)
5. [Test Coverage Gaps](#5-test-coverage-gaps)
6. [Positive Observations](#6-positive-observations)

---

## 1. CRITICAL Findings

### CRITICAL-1: Terminal Route — `find -exec` Enables Arbitrary Command Execution

**File:** `app/api/terminal/route.ts:14-17`
**Severity:** CRITICAL
**Confidence:** 92%

`find` is in `ALLOWED_COMMANDS` with zero argument validation in `validateCommandArgs`. The `find` command supports `-exec` and `-execdir` which execute arbitrary shell commands. The `cwd` is validated to be within `CODE_BASE_PATH`, but `find` can traverse any path passed as an argument:

```
find / -name "*.pem" -exec cat {} \;
find /etc -name passwd -exec cat {} \;
```

This is a full arbitrary command execution vulnerability.

**Patch:**

```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -22,6 +22,9 @@ const BLOCKED_NODE_ARGS = new Set(['-e', '--eval', '-p', '--print', '--input-typ
 const BLOCKED_NPM_SUBCOMMANDS = new Set(['exec', 'x', 'init', 'create', 'pkg']);
 const BLOCKED_NPX_ARGS = new Set(['--yes', '-y', '--package', '-p']);

+// Dangerous find arguments that enable code execution or destructive operations
+const BLOCKED_FIND_ARGS = new Set(['-exec', '-execdir', '-delete', '-ok', '-okdir']);
+
 // Parse command string respecting quotes (handles "hello world" and 'hello world')
 function parseCommand(command: string): string[] {
   const parts: string[] = [];
@@ -93,6 +96,16 @@ function validateCommandArgs(baseCommand: string, args: string[]): string | null
     return `pnpm 'dlx' is not allowed for security reasons`;
   }

+  // Block dangerous find arguments
+  if (baseCommand === 'find') {
+    for (const arg of args) {
+      if (BLOCKED_FIND_ARGS.has(arg)) {
+        return `find argument '${arg}' is not allowed for security reasons`;
+      }
+    }
+  }
+
   return null; // No issues found
 }
```

---

### CRITICAL-2: Terminal Route — `cat`, `head`, `tail`, `grep` Allow Reading Any File on the Filesystem

**File:** `app/api/terminal/route.ts:14-17`
**Severity:** CRITICAL
**Confidence:** 90%

These file-reading commands are whitelisted with no path restriction on their arguments. The `cwd` validation only constrains the working directory, not file path arguments:

```
cat /etc/passwd
cat ~/.ssh/id_rsa
grep -r "password" /etc/
head -100 /var/log/auth.log
```

The dedicated `/api/file` endpoint already provides file reading with proper `validatePath()` protection — these terminal commands bypass that entirely.

**Patch:**

```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -22,6 +22,9 @@ const BLOCKED_NODE_ARGS = new Set(['-e', '--eval', '-p', '--print', '--input-typ
 const BLOCKED_NPM_SUBCOMMANDS = new Set(['exec', 'x', 'init', 'create', 'pkg']);
 const BLOCKED_NPX_ARGS = new Set(['--yes', '-y', '--package', '-p']);

+// Commands that accept file/directory path arguments which must be restricted
+const PATH_SENSITIVE_COMMANDS = new Set(['cat', 'head', 'tail', 'grep', 'find', 'node']);
+
 // ...

 function validateCommandArgs(baseCommand: string, args: string[]): string | null {
+  // For path-sensitive commands, block absolute paths outside CODE_BASE_PATH
+  if (PATH_SENSITIVE_COMMANDS.has(baseCommand)) {
+    for (const arg of args) {
+      if (arg.startsWith('-')) continue; // Skip flags
+      if (arg.startsWith('/') && !arg.startsWith(CODE_BASE_PATH)) {
+        return `Absolute paths outside the code base are not allowed`;
+      }
+      if (arg.includes('..')) {
+        return `Path traversal sequences are not allowed`;
+      }
+    }
+  }
+
   // Block dangerous node arguments
   if (baseCommand === 'node') {
```

---

### CRITICAL-3: Terminal Route — `git` Has No Subcommand Restrictions

**File:** `app/api/terminal/route.ts:14-17`
**Severity:** CRITICAL
**Confidence:** 85%

`git` is whitelisted with no subcommand filtering. Dangerous operations include:

- `git config --global core.hooksPath /tmp/evil` — modifies global git config
- `git clone file:///etc/passwd` — reads arbitrary files via git protocol
- `git archive --remote=...` — SSRF via git remote
- `git config --global core.sshCommand "malicious_cmd"` — arbitrary command via SSH

There is a `BLOCKED_NPM_SUBCOMMANDS` pattern for npm but nothing equivalent for git.

**Patch:**

```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -22,6 +22,11 @@ const BLOCKED_NODE_ARGS = new Set(['-e', '--eval', '-p', '--print', '--input-typ
 const BLOCKED_NPM_SUBCOMMANDS = new Set(['exec', 'x', 'init', 'create', 'pkg']);
 const BLOCKED_NPX_ARGS = new Set(['--yes', '-y', '--package', '-p']);

+// Git subcommands allowed — read-only operations only
+const ALLOWED_GIT_SUBCOMMANDS = new Set([
+  'status', 'log', 'diff', 'show', 'branch', 'tag', 'stash', 'blame',
+  'rev-parse', 'shortlog', 'describe', 'ls-files', 'ls-tree',
+]);

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
   if (baseCommand === 'node') {
```

---

### CRITICAL-4: `docs/route.ts` Bypasses `validatePath()` — Uses Unsafe Inline Path Check

**File:** `app/api/projects/docs/route.ts:57-62`
**Severity:** CRITICAL
**Confidence:** 100%

This is the **only** API route that does not use the shared `validatePath()` helper. It rolls its own inline check with a dangerous fallback:

```typescript
const resolvedPath = path.resolve(projectPath);
const realPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);  // <-- DANGEROUS
if (!realPath.startsWith(CODE_BASE_PATH + '/') && realPath !== CODE_BASE_PATH) {
```

When `realpath()` fails (path does not exist), the `.catch(() => resolvedPath)` silently falls back to the non-symlink-verified `resolvedPath`. Then at line 129, `scanDirectory(resolvedPath, 'project')` uses the unverified path, not `realPath`. If a symlink exists within `CODE_BASE_PATH` pointing outside, the resolved (but not real) path passes the prefix check while the actual filesystem traversal follows the symlink.

Additionally, this route never logs errors (line 157-158), creating a blind spot in security monitoring.

**Patch:**

```diff
--- a/app/api/projects/docs/route.ts
+++ b/app/api/projects/docs/route.ts
@@ -2,8 +2,10 @@ import { NextResponse } from 'next/server';
 import { promises as fs } from 'fs';
 import path from 'path';
 import matter from 'gray-matter';
 import { CODE_BASE_PATH } from '@/lib/constants';
 import { validationError, forbiddenError } from '@/lib/chassis/errors';
-import { errorResponse } from '@/lib/api/errors';
+import { errorResponse, handleRouteError, pathErrorResponse } from '@/lib/api/errors';
+import { validatePath } from '@/lib/api/pathSecurity';
+import { createRequestLogger } from '@/lib/logger';

 export const dynamic = 'force-dynamic';

@@ -47,13 +49,14 @@ function extractPreview(content: string, maxLength: number = 150): string {
 }

 export async function GET(request: Request) {
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
+  const validation = await validatePath(projectPath, { requireExists: false });
+  if (!validation.valid) {
+    return pathErrorResponse(validation.error, validation.status);
   }
+  const resolvedPath = validation.resolvedPath;

   // Helper function to scan a directory for markdown files
@@ -154,7 +157,8 @@ export async function GET(request: Request) {

     return NextResponse.json({ docs });
   } catch (error) {
-    return NextResponse.json({ docs: [], detail: 'Failed to scan docs' }, { status: 500 });
+    log.error({ err: error }, 'Error scanning docs');
+    return handleRouteError(error);
   }
 }
```

---

### CRITICAL-5: `pathSecurity.ts` — Symlink Escape via Non-Existent Parent Directory

**File:** `lib/api/pathSecurity.ts:36-42`
**Severity:** CRITICAL
**Confidence:** 88%

When `requireExists: false` and the target path doesn't exist, `realpath()` throws and the catch block returns `resolvedPath` from `path.resolve()`. This path has `..` segments normalized but symlinks are NOT resolved. Attack scenario:

1. Attacker creates symlink: `CODE_BASE_PATH/evil-link -> /etc/`
2. Request: `path=CODE_BASE_PATH/evil-link/newfile` with `requireExists: false`
3. `path.resolve()` produces `CODE_BASE_PATH/evil-link/newfile` — passes prefix check
4. `realpath()` fails because `newfile` doesn't exist
5. Catch returns `resolvedPath` = `CODE_BASE_PATH/evil-link/newfile` (unverified)
6. `fs.writeFile(resolvedPath)` follows the symlink and writes to `/etc/newfile`

**Patch:**

```diff
--- a/lib/api/pathSecurity.ts
+++ b/lib/api/pathSecurity.ts
@@ -33,8 +33,17 @@ export async function validatePath(
     return { valid: true, resolvedPath: realPath };
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
   }
 }
```

---

## 2. HIGH Findings

### HIGH-1: `docs/[filename]/route.ts` — Missing Null-Byte Check in Filename Validation

**File:** `app/api/projects/docs/[filename]/route.ts:33`
**Severity:** HIGH
**Confidence:** 85%

The filename check blocks `/`, `\`, and `..` but does not block null bytes (`\0`). On some platforms, null bytes in filenames can truncate the path, enabling traversal. Additionally, filenames with only dots (`.`, `...`) are not blocked.

```typescript
if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
```

**Patch:**

```diff
--- a/app/api/projects/docs/[filename]/route.ts
+++ b/app/api/projects/docs/[filename]/route.ts
@@ -30,7 +30,7 @@ export async function GET(request: Request, { params }: RouteParams) {
   }

   // Validate filename (prevent directory traversal)
-  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
+  if (filename.includes('/') || filename.includes('\\') || filename.includes('..') || filename.includes('\0') || /^\.+$/.test(filename)) {
     return errorResponse(validationError('Invalid filename'));
   }
```

Apply the same fix at line 85 (PUT handler).

---

### HIGH-2: `config.ts` — `writeConfig()` Is Public and Bypasses File Lock

**File:** `lib/config.ts:68-71`
**Severity:** HIGH
**Confidence:** 85%

`writeConfig` is exported publicly and writes directly without acquiring the file lock. While `setProjectMetadata` and `updateSettings` correctly use `withConfigLock`, any caller using `writeConfig` directly will cause data races. Two concurrent API requests both modifying config will silently clobber each other.

Additionally, the write is not atomic — a crash mid-write leaves a corrupted JSON file.

**Patch:**

```diff
--- a/lib/config.ts
+++ b/lib/config.ts
@@ -65,8 +65,10 @@ export async function readConfig(): Promise<CodeManageConfig> {
   }
 }

-export async function writeConfig(config: CodeManageConfig): Promise<void> {
+async function writeConfig(config: CodeManageConfig): Promise<void> {
   const configPath = getConfigPath();
-  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
+  const tmpPath = `${configPath}.tmp.${process.pid}`;
+  await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
+  await fs.rename(tmpPath, configPath);
 }
```

This makes `writeConfig` private (no longer exported) and makes writes atomic via temp-file + rename.

---

### HIGH-3: `commits/route.ts` — Module-Level Cache Has No Concurrency Protection

**File:** `app/api/activity/commits/route.ts:12-13`
**Severity:** HIGH
**Confidence:** 85%

The `commitsCache` is shared across all concurrent requests with no coalescing. If two requests arrive when the cache is stale, both spawn git processes across all projects simultaneously. This is the same class of bug that caused the dev server crash fixed in v1.4.3 (via `scan-cache.ts` coalescing), but the commits cache was not given the same treatment.

```typescript
let commitsCache: { data: CommitInfo[]; ts: number } | null = null;
const COMMITS_CACHE_TTL = 30_000;
```

**Patch:**

```diff
--- a/app/api/activity/commits/route.ts
+++ b/app/api/activity/commits/route.ts
@@ -10,6 +10,7 @@ export const dynamic = 'force-dynamic';

 // Simple cache: commits don't change that fast
 let commitsCache: { data: CommitInfo[]; ts: number } | null = null;
+let inflightCommits: Promise<CommitInfo[]> | null = null;
 const COMMITS_CACHE_TTL = 30_000; // 30s

 export async function GET(request: Request) {
@@ -23,7 +24,19 @@ export async function GET(request: Request) {
     if (commitsCache && Date.now() - commitsCache.ts < COMMITS_CACHE_TTL) {
       return NextResponse.json({ commits: commitsCache.data.slice(0, limit) });
     }

-    const projects = await getCachedProjects();
-    const allCommits: CommitInfo[] = [];
+    // Coalesce concurrent requests — only one git scan at a time
+    if (!inflightCommits) {
+      inflightCommits = fetchAllCommits().finally(() => { inflightCommits = null; });
+    }
+    const sortedCommits = await inflightCommits;
+
+    return NextResponse.json({ commits: sortedCommits.slice(0, limit) });
+  } catch (error) {
+    log.error({ err: error }, 'Error fetching commits');
+    return handleRouteError(error);
+  }
+}

+async function fetchAllCommits(): Promise<CommitInfo[]> {
+    const projects = await getCachedProjects();
+    const allCommits: CommitInfo[] = [];
     // Collect commits from each project with bounded concurrency (3 workers, not 8)
     // ... (existing workMap logic) ...
+    const sortedCommits = allCommits
+      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
+    commitsCache = { data: sortedCommits, ts: Date.now() };
+    return sortedCommits;
+}
```

---

### ~~HIGH-4: `SidebarProjectList.tsx` — Double Event Handler~~ REMOVED

*Removed 2026-02-17: Verified against current code — event handling structure is correct. Not a bug.*

---

### HIGH-5: `TerminalPanel.tsx` — Ctrl+C Does Not Cancel Server-Side Process

**File:** `components/terminal/TerminalPanel.tsx:108-123`
**Severity:** HIGH
**Confidence:** 95%

When the user presses Ctrl+C, the component sets `isRunning = false` and shows `^C`, but the actual server-side `execFile` process continues running for up to 60 seconds. The user believes they cancelled, the UI accepts new commands, and a second command fires concurrently on the server. Long-running commands can stack up silently, exhausting server resources.

```typescript
} else if (e.key === 'c' && e.ctrlKey) {
  if (isRunning) {
    // Note: This won't actually kill the process on the server
    setIsRunning(false);  // <-- only visual, server still running
```

**Patch:**

```diff
--- a/components/terminal/TerminalPanel.tsx
+++ b/components/terminal/TerminalPanel.tsx
@@ -26,6 +26,7 @@ export function TerminalPanel({ projectPath, onClose }: TerminalPanelProps) {
   const terminalRef = useRef<HTMLDivElement>(null);
   const inputRef = useRef<HTMLInputElement>(null);
   const resizeRef = useRef<HTMLDivElement>(null);
+  const abortControllerRef = useRef<AbortController | null>(null);

   // ... (existing useEffect hooks) ...

@@ -47,9 +48,12 @@ export function TerminalPanel({ projectPath, onClose }: TerminalPanelProps) {
     setHistoryIndex(-1);

     try {
+      const controller = new AbortController();
+      abortControllerRef.current = controller;
       const response = await fetch('/api/terminal', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ command, cwd: projectPath }),
+        signal: controller.signal,
       });

@@ -106,7 +110,7 @@ export function TerminalPanel({ projectPath, onClose }: TerminalPanelProps) {
     } else if (e.key === 'c' && e.ctrlKey) {
       if (isRunning) {
-        // Note: This won't actually kill the process on the server
-        // but it provides visual feedback
+        abortControllerRef.current?.abort();
         setIsRunning(false);
         setHistory((prev) => [
```

---

### HIGH-6: `search/route.ts` — User Query Treated as Regex by `rg`, Enabling ReDoS

**File:** `app/api/search/route.ts:57-64`
**Severity:** HIGH
**Confidence:** 80%

`rg` (ripgrep) interprets the user's query as a regex by default. A crafted query like `(a+)+b` causes catastrophic backtracking against large files, consuming CPU for the full 30-second timeout before being killed.

**Patch:**

```diff
--- a/app/api/search/route.ts
+++ b/app/api/search/route.ts
@@ -56,6 +56,7 @@ export async function GET(request: Request) {
     const args = [
       '--json',
+      '--fixed-strings',
       '--max-count=10',
       '--max-filesize=1M',
       ...excludePatterns,
```

---

## 3. MEDIUM Findings

### MEDIUM-1: `project/[slug]/page.tsx` — Fetch Race Condition on Fast Navigation

**File:** `app/project/[slug]/page.tsx:25-45`
**Severity:** MEDIUM
**Confidence:** 88%

`fetchProject` is defined outside `useEffect` with no abort controller. If `slug` changes rapidly (user navigates between projects), an old fetch can resolve after a new one and overwrite the newer state.

**Patch:**

```diff
--- a/app/project/[slug]/page.tsx
+++ b/app/project/[slug]/page.tsx
-  const fetchProject = async () => {
-    try {
-      const response = await fetch(`/api/projects/${slug}`);
-      ...
-    } finally {
-      setLoading(false);
-    }
-  };
-
-  useEffect(() => {
-    fetchProject();
-  }, [slug]);
+  useEffect(() => {
+    let cancelled = false;
+    const fetchProject = async () => {
+      try {
+        const response = await fetch(`/api/projects/${slug}`);
+        if (cancelled) return;
+        const data = await response.json();
+        if (cancelled) return;
+        setProject(data);
+      } catch (err) {
+        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
+      } finally {
+        if (!cancelled) setLoading(false);
+      }
+    };
+    fetchProject();
+    return () => { cancelled = true; };
+  }, [slug]);
```

---

### MEDIUM-2: `ToastContext.tsx` — `setTimeout` Never Cancelled, Memory Leak on Unmount

**File:** `components/toast/ToastContext.tsx:38-43`
**Severity:** MEDIUM
**Confidence:** 90%

`setTimeout(() => removeToast(id), 3000)` is never tracked or cleared. If the `ToastProvider` unmounts before 3 seconds, the timeout fires on an unmounted component and calls `setToasts` on dead state.

**Patch:**

```diff
--- a/components/toast/ToastContext.tsx
+++ b/components/toast/ToastContext.tsx
+  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
+
   const addToast = useCallback((message: string, variant: ToastVariant = 'info') => {
     const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
     setToasts(prev => [...prev, { id, message, variant }]);
-    setTimeout(() => removeToast(id), 3000);
+    const timer = setTimeout(() => {
+      timers.current.delete(id);
+      removeToast(id);
+    }, 3000);
+    timers.current.set(id, timer);
   }, [removeToast]);
+
+  useEffect(() => {
+    return () => { timers.current.forEach(clearTimeout); };
+  }, []);
```

---

### MEDIUM-3: `ReadmePreview.tsx` / `BugsCard.tsx` / `DocsCard.tsx` — `javascript:` URIs in Markdown Links

**File:** `components/project/ReadmePreview.tsx:134-143`
**Severity:** MEDIUM
**Confidence:** 83%

`react-markdown` does not sanitize `href` attributes. A malicious README with `[click](javascript:alert(1))` would render a clickable link that executes JavaScript in the browser context.

**Patch:**

```diff
--- a/components/project/ReadmePreview.tsx
+++ b/components/project/ReadmePreview.tsx
   a: ({ href, children }) => (
-    <a
-      href={href}
+    <a
+      href={href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#') || href.startsWith('/')) ? href : undefined}
       target="_blank"
       rel="noopener noreferrer"
```

---

### MEDIUM-4: `docs/route.ts` — Error Handler Bypasses Shared Error Infrastructure

**File:** `app/api/projects/docs/route.ts:157-159`
**Severity:** MEDIUM
**Confidence:** 88%

This route catches errors and returns a hand-crafted 500 response that:
1. Does not use `handleRouteError()` (bypasses 5xx detail scrubbing)
2. Does not log the error (silent failure, invisible in production)
3. Does not set `content-type: application/problem+json` (inconsistent API)

```typescript
} catch (error) {
  return NextResponse.json({ docs: [], detail: 'Failed to scan docs' }, { status: 500 });
}
```

**Fix:** Already addressed in CRITICAL-4 patch above.

---

### MEDIUM-5: `terminal/route.ts` — `exitCode` Always Returns 1 on Error

**File:** `app/api/terminal/route.ts:162-167`
**Severity:** MEDIUM
**Confidence:** 82%

When `execFile` fails, the actual exit code is discarded and replaced with `1`. Tools like `grep` return exit code 1 for "no matches" (not an error), and `git` returns 128 for "not a repo". Clients cannot distinguish these from actual failures.

**Patch:**

```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -160,7 +160,9 @@ export async function POST(request: Request) {
         (error, stdout, stderr) => {
           resolve({
             stdout: stdout || '',
             stderr: stderr || '',
-            exitCode: error ? 1 : 0,
+            exitCode: error
+              ? (typeof (error as any).code === 'number' ? (error as any).code : 1)
+              : 0,
           });
         }
       );
```

---

### MEDIUM-6: `activity/page.tsx` — Single `loading` State for Two Independent Fetches

**File:** `app/activity/page.tsx`
**Severity:** MEDIUM
**Confidence:** 85%

A single `loading` state controls both the velocity chart and the commits table. When the user switches time range, the velocity fetch sets `loading = true`, which hides the already-loaded commits data — misleading UX.

**Fix:** Split into `loadingVelocity` and `loadingCommits` states, each controlled by their respective fetch effects.

---

### MEDIUM-7: `ProjectTable.tsx` — Empty `useMemo` Dep Array Creates Stale Closure

**File:** `components/dashboard/ProjectTable.tsx:73-271`
**Severity:** MEDIUM
**Confidence:** 82%

The `columns` memoization has an empty dependency array `[]` but closes over `handleToggleStar`. If `handleToggleStar` ever changes reference, the columns will use a stale version.

**Patch:**

```diff
--- a/components/dashboard/ProjectTable.tsx
+++ b/components/dashboard/ProjectTable.tsx
@@ -268,7 +268,7 @@ export function ProjectTable(...) {
       }),
     ],
-    []
+    [handleToggleStar]
   );
```

---

### MEDIUM-8: Modals Lack Focus Trap and Escape Key Handler (Accessibility)

**Files:** `BugsCard.tsx`, `DocsCard.tsx`, `NewProjectModal.tsx`, `MarkdownEditor.tsx`
**Severity:** MEDIUM
**Confidence:** 88%

All four modal components lack:
1. `role="dialog"` and `aria-modal="true"`
2. Focus trap (keyboard users can Tab behind the overlay)
3. Escape key handler to close

**Patch (minimal, apply to each modal container):**

```diff
+  useEffect(() => {
+    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
+    document.addEventListener('keydown', onKey);
+    return () => document.removeEventListener('keydown', onKey);
+  }, [onClose]);

-  <div className="fixed inset-0 ...">
+  <div className="fixed inset-0 ..." role="dialog" aria-modal="true">
```

---

### MEDIUM-9: `Sidebar.tsx` — `window.location.reload()` on Project Creation

**File:** `components/sidebar/Sidebar.tsx:204-207`
**Severity:** MEDIUM
**Confidence:** 90%

Using `window.location.reload()` is a React anti-pattern that tears down the entire component tree, discarding all state. The `useProjects` hook already provides a `refresh()` function.

**Patch:**

```diff
--- a/components/sidebar/Sidebar.tsx
+++ b/components/sidebar/Sidebar.tsx
   onSuccess={() => {
-    window.location.reload();
+    refresh();
   }}
```

---

## 4. LOW Findings

### LOW-1: `parseCommand` Does Not Handle Backslash Escapes

**File:** `app/api/terminal/route.ts:26-57`
**Severity:** LOW

Shell-style `\"` inside double-quoted strings is not handled. Since `execFile` doesn't interpret shell metacharacters, this is a minor parsing fidelity issue rather than a security vulnerability.

---

### LOW-2: `TerminalPanel.tsx` — ANSI Escape Codes Rendered as Raw Text

**File:** `components/terminal/TerminalPanel.tsx:241-248`
**Severity:** LOW

Commands like `npm run build` and `git log --color` emit ANSI escape sequences that appear as garbage characters in the `<pre>` output. Strip them or convert to styled spans.

---

### LOW-3: `dates.ts` — `formatRelativeDate` Returns Negative Values for Future Dates

**File:** `lib/utils/dates.ts:1-13`
**Severity:** LOW

If `dateString` is a future date, `diffDays` is negative, producing output like `-3 days ago`.

**Patch:**

```diff
+  if (diffMs < 0) return 'Just now';
```

---

### LOW-4: `SettingsPanel.tsx` — Terminal Height Setting Is Saved But Never Applied

**File:** `components/settings/SettingsPanel.tsx` vs `components/terminal/TerminalPanel.tsx:24`
**Severity:** LOW

The settings UI lets users configure terminal height, but `TerminalPanel` hardcodes `useState(300)`. The setting is dead UI.

---

### LOW-5: `useClickOutside.ts` — Unstable Callback Reference Causes Effect Re-runs

**File:** `lib/hooks/useClickOutside.ts:4-16`
**Severity:** LOW

The `useEffect` depends on `callback`, which causes the event listener to be re-registered on every render if the caller doesn't wrap it in `useCallback`. Use a ref pattern instead.

---

### LOW-6: `velocity/route.ts` — Cache Map Grows Unboundedly

**File:** `app/api/activity/velocity/route.ts:12-13`
**Severity:** LOW

`velocityCache` is a `Map<number, ...>` keyed by `days` (clamped to 1-365). Entries are never evicted. Max 365 entries × a few KB each is not a real problem, but the cache is monotonically growing.

---

## 5. Test Coverage Gaps

### 5.1 Modules With Zero Tests

| Module | Risk Level | Notes |
|--------|-----------|-------|
| `lib/chassis/secval.ts` | **CRITICAL** | Security firewall for all mutating endpoints — 0 tests |
| `lib/api/validate.ts` | HIGH | `parseBody`/`parseSecureBody` called by every POST route — 0 tests |
| `lib/api/errors.ts` | HIGH | 5xx detail-scrubbing logic untested |
| `lib/api/createOpenActionRoute.ts` | HIGH | Shared factory for open-editor/open-finder — 0 tests |
| `lib/config.ts` | HIGH | File-locking config reads/writes — 0 tests |
| `lib/git.ts` | HIGH | `spawnGit` timeout/output-cap logic — 0 tests |
| `lib/scan-cache.ts` | HIGH | Coalescing cache (inflight sharing) — 0 tests |
| `lib/ports.ts` | LOW | Pure function, trivially testable |

### 5.2 API Routes With No Tests (11 of 14)

| Route | Risk |
|-------|------|
| `POST /api/actions/open-editor` | HIGH — spawns system process |
| `POST /api/actions/open-finder` | HIGH — spawns system process |
| `POST /api/projects/create` | HIGH — spawns `ralph`, FS mutations |
| `GET /api/projects` | MEDIUM |
| `GET/PATCH /api/projects/[slug]` | MEDIUM |
| `GET /api/search` | MEDIUM — shell spawning |
| `GET /api/activity/commits` | MEDIUM |
| `GET /api/activity/velocity` | MEDIUM |
| `GET /api/projects/docs` | HIGH — bypasses shared path validation |
| `GET/PUT /api/projects/docs/[filename]` | HIGH — file writes |

### 5.3 Test Quality Issues

1. **`pathSecurity.test.ts` is machine-specific** — All 7 tests hardcode `/Users/cliff/Desktop/_code`. They will fail on any CI system or other developer's machine.

2. **`env.test.ts` tests a copy-pasted schema** — Declares its own Zod schema rather than testing the actual `lib/env.ts` module. Schema drift will not be caught.

3. **`scanner.test.ts` covers only `determineStatus`** — 1 of 16+ exported functions tested. Complex logic like `scanRcodegen`, `getGitInfo`, and slug collision resolution in `scanAllProjects` is completely untested.

4. **`schemas.test.ts` mostly tests Zod itself** — Most tests verify that Zod throws on wrong types (guaranteed by Zod). Only the regex-based name validation tests verify actual business logic.

---

## 6. Positive Observations

Despite the issues above, the codebase shows many signs of thoughtful engineering:

1. **Security headers in `next.config.mjs`** — `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy` are all configured correctly.

2. **Shared `validatePath()` helper** — Used by most routes (except `docs/route.ts`). The function checks both `path.resolve` prefix and `fs.realpath` symlink verification. The architecture is right, just needs the parent-directory fix.

3. **`execFile` over `exec`** — The terminal route uses `execFile` with argument arrays, which prevents shell injection by design. This is a significant security positive.

4. **Zod schemas for all API inputs** — Every route uses Zod for request validation with `parseBody`/`parseSecureBody`.

5. **`secval.ts` prototype pollution guard** — The concept of scanning JSON for `__proto__`, `constructor`, etc. is good security practice. It just needs tests.

6. **Bounded concurrency via `workMap`** — `lib/chassis/work.ts` provides a Semaphore-based worker pool. The commit/velocity fetches correctly limit to 3 workers.

7. **`proper-lockfile` for config** — File-level locking prevents most concurrent write corruption (when used via `withConfigLock`).

8. **Request logging infrastructure** — `createRequestLogger` provides structured logging for most routes.

9. **TypeScript strict mode** — `tsconfig.json` has `"strict": true`.

10. **Clean architecture** — Good separation: `lib/chassis/` for reusable patterns, `lib/api/` for route utilities, `lib/hooks/` for client state.

---

## Priority Fix Order

1. **CRITICAL-1 through CRITICAL-3** (terminal route): Remove `find` from whitelist or block `-exec`; add path validation for `cat`/`head`/`tail`/`grep`; add git subcommand allowlist. These are the highest-impact, easiest-to-exploit issues.

2. **CRITICAL-4** (docs/route.ts): Replace inline path check with `validatePath()`. One-line conceptual change.

3. **CRITICAL-5** (pathSecurity.ts): Add parent-directory verification for non-existent paths. This hardens all routes that use `requireExists: false`.

4. **HIGH-1** (null-byte in filename): Quick regex fix.

5. **HIGH-2** (writeConfig public): Make private, add atomic write.

6. **HIGH-3** (commits cache coalescing): Apply the same pattern from scan-cache.ts.

7. **HIGH-4** (double-click bug): `stopPropagation()` fix.

8. **HIGH-5** (terminal abort): AbortController in TerminalPanel.

9. **HIGH-6** (ReDoS via search): Add `--fixed-strings` to rg.

10. Then tackle MEDIUM/LOW findings and test coverage gaps.

---

*End of audit report.*
