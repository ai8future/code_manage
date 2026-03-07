Date Created: 2026-02-17T23:55:00-05:00
TOTAL_SCORE: 62/100

---

# code_manage — Combined Quick Analysis Report

**Agent:** Claude:Opus 4.6
**Project:** code_manage v1.4.3
**Framework:** Next.js 16 / React 18 / TypeScript 5
**Files analyzed:** ~85 source files (app/, components/, lib/, tests/)

## Scoring Breakdown

| Category | Weight | Score | Notes |
|----------|--------|-------|-------|
| Security | 30% | 16/30 | Terminal endpoint has multiple escape vectors, docs route bypasses validatePath, no file extension enforcement on docs read/write |
| Code Quality | 25% | 18/25 | Good patterns overall but config locking has gaps, unsafe `as` casts, race conditions in multiple locations |
| Test Coverage | 25% | 10/25 | Only 9 test files, zero component tests, no mocking anywhere, missing happy-path tests for 3 API routes |
| Architecture | 20% | 18/20 | Clean structure, chassis patterns, good separation of concerns, bounded concurrency |
| **TOTAL** | | **62/100** | |

---

## 1. AUDIT — Security and Code Quality Issues

### A1. [CRITICAL] Terminal: `find -exec`, `grep`, `cat`, `head`, `tail` accept paths outside CODE_BASE_PATH

**File:** `app/api/terminal/route.ts:14-17, 59-96`

`grep`, `find`, `cat`, `head`, `tail` are whitelisted but their arguments are never validated. The `cwd` is validated but command arguments accept absolute paths, allowing file reads and command execution outside the code base:

```
find / -name '*.pem'
cat /etc/passwd
grep -r password /etc/
find . -exec rm -rf {} \;
```

**Severity:** Critical

```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -20,6 +20,9 @@
 const BLOCKED_NODE_ARGS = new Set(['-e', '--eval', '-p', '--print', '--input-type', '-r', '--require']);
 const BLOCKED_NPM_SUBCOMMANDS = new Set(['exec', 'x', 'init', 'create', 'pkg']);
 const BLOCKED_NPX_ARGS = new Set(['--yes', '-y', '--package', '-p']);
+const BLOCKED_FIND_ARGS = new Set(['-exec', '-execdir', '-ok', '-okdir', '-delete']);
+// Commands that accept file path arguments which must be validated
+const PATH_ARG_COMMANDS = new Set(['cat', 'head', 'tail', 'grep', 'find', 'wc']);

 // Parse command string respecting quotes (handles "hello world" and 'hello world')
 function parseCommand(command: string): string[] {
@@ -94,6 +97,14 @@
     return `pnpm 'dlx' is not allowed for security reasons`;
   }

+  // Block find -exec and similar dangerous flags
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
@@ -145,6 +156,16 @@
     if (argError) {
       return errorResponse(forbiddenError(argError));
     }
+
+    // Block absolute paths in arguments for file-reading commands
+    if (PATH_ARG_COMMANDS.has(baseCommand)) {
+      for (const arg of args) {
+        if (arg.startsWith('/') && !arg.startsWith(CODE_BASE_PATH)) {
+          return errorResponse(
+            forbiddenError('Absolute paths outside the code base are not allowed')
+          );
+        }
+      }
+    }

     const result = await new Promise<CommandResult>((resolve) => {
```

---

### A2. [CRITICAL] Terminal: `node` can execute arbitrary files; `npm run` can run arbitrary package.json scripts

**File:** `app/api/terminal/route.ts:14-17, 61-75`

`node /path/to/any/file.js` is allowed because only eval-style flags are blocked, not positional file arguments. `npm run <script>` is allowed because `run` is not in `BLOCKED_NPM_SUBCOMMANDS`, and npm scripts can execute arbitrary shell commands.

**Severity:** Critical

```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -60,6 +60,11 @@
   if (baseCommand === 'node') {
     for (const arg of args) {
       if (BLOCKED_NODE_ARGS.has(arg) || arg.startsWith('--eval=') || arg.startsWith('--require=')) {
         return `Argument '${arg}' is not allowed for security reasons`;
       }
     }
+    // Block positional file arguments (anything not starting with -)
+    const fileArgs = args.filter(a => !a.startsWith('-'));
+    if (fileArgs.length > 0) {
+      return `Direct file execution via 'node' is not allowed for security reasons`;
+    }
   }

   // Block dangerous npm subcommands
@@ -69,6 +74,10 @@
   if (baseCommand === 'npm' && args.length > 0) {
     const subcommand = args[0];
     if (BLOCKED_NPM_SUBCOMMANDS.has(subcommand)) {
       return `npm '${subcommand}' is not allowed for security reasons`;
     }
+    // Block 'run' and 'run-script' which execute arbitrary package.json scripts
+    if (subcommand === 'run' || subcommand === 'run-script' || subcommand === 'start' || subcommand === 'test') {
+      return `npm '${subcommand}' is not allowed for security reasons`;
+    }
   }
```

---

### A3. [HIGH] Docs listing route bypasses `validatePath` with flawed manual reimplementation

**File:** `app/api/projects/docs/route.ts:57-62`

This is the only route that manually reimplements path validation instead of using `validatePath()`. The `.catch(() => resolvedPath)` fallback on `fs.realpath` means a non-existent symlink pointing outside `CODE_BASE_PATH` bypasses the realpath check entirely.

**Severity:** High

```diff
--- a/app/api/projects/docs/route.ts
+++ b/app/api/projects/docs/route.ts
@@ -1,8 +1,9 @@
 import { NextResponse } from 'next/server';
 import { promises as fs } from 'fs';
 import path from 'path';
 import matter from 'gray-matter';
 import { CODE_BASE_PATH } from '@/lib/constants';
 import { validationError, forbiddenError } from '@/lib/chassis/errors';
-import { errorResponse } from '@/lib/api/errors';
+import { errorResponse, pathErrorResponse } from '@/lib/api/errors';
+import { validatePath } from '@/lib/api/pathSecurity';

 export const dynamic = 'force-dynamic';
@@ -55,9 +56,10 @@

-  // Validate path is within CODE_BASE_PATH
-  const resolvedPath = path.resolve(projectPath);
-  const realPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);
-  if (!realPath.startsWith(CODE_BASE_PATH + '/') && realPath !== CODE_BASE_PATH) {
-    return errorResponse(forbiddenError('Invalid path'));
+  // Validate path using the shared validatePath utility (fixes symlink bypass)
+  const pathResult = await validatePath(projectPath, { requireExists: false });
+  if (!pathResult.valid) {
+    return pathErrorResponse(pathResult.error, pathResult.status);
   }
+  const resolvedPath = pathResult.resolvedPath;
```

---

### A4. [HIGH] Docs filename route allows reading/writing ANY file type in project directory

**File:** `app/api/projects/docs/[filename]/route.ts:33-35, 84-86`

The filename validation checks only for `/`, `\`, and `..` but does not enforce `.md` extension. An attacker can read `.env`, `secrets.json`, private keys, or overwrite `package.json` within any project directory.

**Severity:** High

```diff
--- a/app/api/projects/docs/[filename]/route.ts
+++ b/app/api/projects/docs/[filename]/route.ts
@@ -32,6 +32,10 @@
   // Validate filename (prevent directory traversal)
   if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
     return errorResponse(validationError('Invalid filename'));
   }
+  // Only allow markdown files
+  if (!filename.endsWith('.md')) {
+    return errorResponse(validationError('Only .md files are allowed'));
+  }
```

Apply the same 4-line addition after line 86 in the PUT handler.

---

### A5. [MEDIUM] Prototype pollution via URL slug used as object key

**File:** `lib/config.ts:84`, `app/api/projects/[slug]/route.ts:60`

The `slug` from URL parameters is used directly as a property key in `config.projects[slug]`. The `parseSecureBody` dangerous-key check doesn't apply to URL params, so `__proto__` or `constructor` slugs could pollute the prototype chain.

**Severity:** Medium

```diff
--- a/lib/config.ts
+++ b/lib/config.ts
@@ -76,6 +76,10 @@
 export async function setProjectMetadata(
   slug: string,
   metadata: Partial<ProjectMetadata>
 ): Promise<void> {
+  // Sanitize slug to prevent prototype pollution
+  if (slug === '__proto__' || slug === 'constructor' || slug === 'prototype') {
+    throw new Error(`Invalid slug: '${slug}'`);
+  }
   await withConfigLock(async () => {
     const config = await readConfig();
     config.projects[slug] = {
```

---

### A6. [MEDIUM] `writeConfig` is publicly exported without locking

**File:** `lib/config.ts:68-71`

Any caller can bypass `withConfigLock` by calling `writeConfig` directly, leading to data corruption during concurrent writes.

**Severity:** Medium

```diff
--- a/lib/config.ts
+++ b/lib/config.ts
@@ -67,7 +67,7 @@

-export async function writeConfig(config: CodeManageConfig): Promise<void> {
+async function writeConfig(config: CodeManageConfig): Promise<void> {
   const configPath = getConfigPath();
   await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
 }
```

---

### A7. [MEDIUM] Terminal exit code always 0 or 1, masking real exit codes

**File:** `app/api/terminal/route.ts:166`

The actual process exit code from `execFile` is discarded. Callers can't distinguish "not found" (127), "permission denied" (126), or application-specific codes.

```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -162,7 +162,10 @@
         (error, stdout, stderr) => {
+          let exitCode = 0;
+          if (error) {
+            exitCode = typeof (error as any).code === 'number' ? (error as any).code : 1;
+          }
           resolve({
             stdout: stdout || '',
             stderr: stderr || '',
-            exitCode: error ? 1 : 0,
+            exitCode,
           });
         }
```

---

### A8. [MEDIUM] Docs listing route swallows errors silently

**File:** `app/api/projects/docs/route.ts:157-159`

The catch block discards the error without logging, unlike every other route that uses `handleRouteError`.

```diff
--- a/app/api/projects/docs/route.ts
+++ b/app/api/projects/docs/route.ts
@@ -155,5 +155,6 @@
     return NextResponse.json({ docs });
   } catch (error) {
-    return NextResponse.json({ docs: [], detail: 'Failed to scan docs' }, { status: 500 });
+    console.error('Failed to scan docs:', error);
+    return NextResponse.json({ docs: [], detail: 'Failed to scan docs' }, { status: 500 });
   }
```

---

### A9. [LOW] `process.exit(1)` in library code prevents unit testing

**File:** `lib/chassis/config.ts:39-40`

`mustLoad` calls `process.exit(1)` on validation failure, making unit testing impossible without mocking. Library code should throw, not exit.

```diff
--- a/lib/chassis/config.ts
+++ b/lib/chassis/config.ts
@@ -37,8 +37,7 @@
     });

-    console.error(`config: validation failed\n${lines.join('\n')}`);
-    process.exit(1);
+    throw new Error(`config: validation failed\n${lines.join('\n')}`);
   }

   return result.data;
```

---

### A10. [LOW] Hardcoded developer-machine default path in env schema

**File:** `lib/env.ts:8`

The default value `/Users/cliff/Desktop/_code` is machine-specific. In any other environment, this will silently produce an empty project list instead of failing with a clear error.

```diff
--- a/lib/env.ts
+++ b/lib/env.ts
@@ -5,7 +5,7 @@
 const EnvSchema = z.object({
   codeBasePath: z
     .string()
     .min(1, { error: 'CODE_BASE_PATH must not be empty' })
-    .default('/Users/cliff/Desktop/_code'),
+    .default(process.env.HOME ? `${process.env.HOME}/code` : '/tmp/code'),
   logLevel: z
```

---

## 2. TESTS — Proposed Unit Tests for Untested Code

### T1. `formatRelativeDate` — handles invalid dates and edge cases

**File to create:** `tests/lib/dates.test.ts`

```diff
--- /dev/null
+++ b/tests/lib/dates.test.ts
@@ -0,0 +1,43 @@
+import { describe, it, expect } from 'vitest';
+import { formatRelativeDate, formatShortDate } from '@/lib/utils/dates';
+
+describe('formatRelativeDate', () => {
+  it('returns "Today" for current date', () => {
+    expect(formatRelativeDate(new Date().toISOString())).toBe('Today');
+  });
+
+  it('returns "Yesterday" for one day ago', () => {
+    const yesterday = new Date(Date.now() - 86400000).toISOString();
+    expect(formatRelativeDate(yesterday)).toBe('Yesterday');
+  });
+
+  it('returns "X days ago" for 2-6 days', () => {
+    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
+    expect(formatRelativeDate(threeDaysAgo)).toBe('3 days ago');
+  });
+
+  it('returns weeks for 7-29 days', () => {
+    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
+    expect(formatRelativeDate(twoWeeksAgo)).toBe('2 weeks ago');
+  });
+
+  it('returns months for 30-364 days', () => {
+    const threeMonthsAgo = new Date(Date.now() - 90 * 86400000).toISOString();
+    expect(formatRelativeDate(threeMonthsAgo)).toBe('3 months ago');
+  });
+
+  it('returns years for 365+ days', () => {
+    const twoYearsAgo = new Date(Date.now() - 730 * 86400000).toISOString();
+    expect(formatRelativeDate(twoYearsAgo)).toBe('2 years ago');
+  });
+
+  it('handles invalid date string gracefully', () => {
+    // BUG: Currently returns "NaN years ago" — see FIX F1
+    const result = formatRelativeDate('not-a-date');
+    expect(result).toContain('NaN');
+  });
+});
+
+describe('formatShortDate', () => {
+  it('formats date correctly', () => {
+    expect(formatShortDate('2026-01-15')).toMatch(/Jan 15, 2026/);
+  });
+});
```

---

### T2. `config.ts` — locking behavior and slug safety

**File to create:** `tests/lib/config.test.ts`

```diff
--- /dev/null
+++ b/tests/lib/config.test.ts
@@ -0,0 +1,46 @@
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { readConfig, setProjectMetadata, getProjectMetadata } from '@/lib/config';
+import { promises as fs } from 'fs';
+import path from 'path';
+import { CODE_BASE_PATH } from '@/lib/constants';
+import { DEFAULT_CONFIG } from '@/lib/types';
+
+const CONFIG_PATH = path.join(CODE_BASE_PATH, '.code-manage.json');
+let originalContent: string | null = null;
+
+describe('config', () => {
+  beforeEach(async () => {
+    try {
+      originalContent = await fs.readFile(CONFIG_PATH, 'utf-8');
+    } catch {
+      originalContent = null;
+    }
+  });
+
+  afterEach(async () => {
+    if (originalContent !== null) {
+      await fs.writeFile(CONFIG_PATH, originalContent, 'utf-8');
+    }
+  });
+
+  it('readConfig returns defaults when config file is missing', async () => {
+    try { await fs.rename(CONFIG_PATH, CONFIG_PATH + '.bak'); } catch {}
+    try {
+      const config = await readConfig();
+      expect(config.settings).toEqual(DEFAULT_CONFIG.settings);
+    } finally {
+      try { await fs.rename(CONFIG_PATH + '.bak', CONFIG_PATH); } catch {}
+    }
+  });
+
+  it('rejects __proto__ as slug (after A5 fix)', async () => {
+    await expect(
+      setProjectMetadata('__proto__', { starred: true })
+    ).rejects.toThrow('Invalid slug');
+  });
+
+  it('returns undefined for non-existent slug', async () => {
+    const result = await getProjectMetadata('definitely-does-not-exist-xyz');
+    expect(result).toBeUndefined();
+  });
+});
```

---

### T3. Terminal command parsing and validation

**File to create:** `tests/lib/terminal-parsing.test.ts`

```diff
--- /dev/null
+++ b/tests/lib/terminal-parsing.test.ts
@@ -0,0 +1,50 @@
+import { describe, it, expect } from 'vitest';
+
+// Extracted from terminal route for testability — should be in lib/terminal.ts
+function parseCommand(command: string): string[] {
+  const parts: string[] = [];
+  let current = '';
+  let inQuote: string | null = null;
+  for (let i = 0; i < command.length; i++) {
+    const char = command[i];
+    if (inQuote) {
+      if (char === inQuote) { inQuote = null; } else { current += char; }
+    } else if (char === '"' || char === "'") {
+      inQuote = char;
+    } else if (char === ' ' || char === '\t') {
+      if (current) { parts.push(current); current = ''; }
+    } else {
+      current += char;
+    }
+  }
+  if (current) parts.push(current);
+  return parts;
+}
+
+describe('parseCommand', () => {
+  it('splits simple commands', () => {
+    expect(parseCommand('ls -la')).toEqual(['ls', '-la']);
+  });
+
+  it('handles double quotes', () => {
+    expect(parseCommand('echo "hello world"')).toEqual(['echo', 'hello world']);
+  });
+
+  it('handles single quotes', () => {
+    expect(parseCommand("echo 'hello world'")).toEqual(['echo', 'hello world']);
+  });
+
+  it('handles multiple spaces', () => {
+    expect(parseCommand('ls   -la    /tmp')).toEqual(['ls', '-la', '/tmp']);
+  });
+
+  it('returns empty array for empty string', () => {
+    expect(parseCommand('')).toEqual([]);
+  });
+
+  it('handles mixed quotes', () => {
+    expect(parseCommand('git log --format="%H %s"')).toEqual(['git', 'log', '--format=%H %s']);
+  });
+
+  it('handles unclosed quotes', () => {
+    expect(parseCommand('echo "hello')).toEqual(['echo', 'hello']);
+  });
+});
```

---

### T4. `workMap` and `workRace` concurrency utilities

**File to create:** `tests/lib/work.test.ts`

```diff
--- /dev/null
+++ b/tests/lib/work.test.ts
@@ -0,0 +1,55 @@
+import { describe, it, expect } from 'vitest';
+import { workMap, workRace, workAll } from '@/lib/chassis/work';
+
+describe('workMap', () => {
+  it('processes all items and preserves order', async () => {
+    const items = [1, 2, 3, 4, 5];
+    const results = await workMap(items, async (n) => n * 2, { workers: 2 });
+    expect(results.map((r) => r.value)).toEqual([2, 4, 6, 8, 10]);
+    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4]);
+  });
+
+  it('captures errors per-item without failing the batch', async () => {
+    const items = [1, 2, 3];
+    const results = await workMap(items, async (n) => {
+      if (n === 2) throw new Error('boom');
+      return n;
+    }, { workers: 2 });
+    expect(results[0].value).toBe(1);
+    expect(results[1].error?.message).toBe('boom');
+    expect(results[2].value).toBe(3);
+  });
+
+  it('respects bounded concurrency', async () => {
+    let maxConcurrent = 0;
+    let current = 0;
+    await workMap([1, 2, 3, 4, 5, 6], async () => {
+      current++;
+      maxConcurrent = Math.max(maxConcurrent, current);
+      await new Promise((r) => setTimeout(r, 50));
+      current--;
+    }, { workers: 2 });
+    expect(maxConcurrent).toBeLessThanOrEqual(2);
+  });
+});
+
+describe('workRace', () => {
+  it('returns the first successful result', async () => {
+    const result = await workRace(
+      async () => { await new Promise((r) => setTimeout(r, 100)); return 'slow'; },
+      async () => 'fast',
+    );
+    expect(result).toBe('fast');
+  });
+
+  it('rejects when all tasks fail', async () => {
+    await expect(
+      workRace(
+        async () => { throw new Error('a'); },
+        async () => { throw new Error('b'); },
+      ),
+    ).rejects.toThrow('all 2 tasks failed');
+  });
+
+  it('throws when given zero tasks', async () => {
+    await expect(workRace()).rejects.toThrow('at least one task');
+  });
+});
```

---

### T5. `validatePath` — additional edge cases

**File to create:** `tests/lib/pathSecurity-extended.test.ts`

```diff
--- /dev/null
+++ b/tests/lib/pathSecurity-extended.test.ts
@@ -0,0 +1,22 @@
+import { describe, it, expect } from 'vitest';
+import { validatePath } from '@/lib/api/pathSecurity';
+
+describe('validatePath - extended', () => {
+  it('rejects paths with encoded traversal', async () => {
+    const result = await validatePath('/Users/cliff/Desktop/_code/../../../etc/passwd');
+    expect(result.valid).toBe(false);
+  });
+
+  it('handles paths with trailing slashes', async () => {
+    const result = await validatePath('/Users/cliff/Desktop/_code/', { requireExists: false });
+    expect(result.valid).toBeDefined();
+  });
+
+  it('allows requireExists: false for non-existent paths within base', async () => {
+    const result = await validatePath(
+      '/Users/cliff/Desktop/_code/nonexistent-project-xyz',
+      { requireExists: false }
+    );
+    expect(result.valid).toBe(true);
+  });
+});
```

---

## 3. FIXES — Bugs, Issues, and Code Smells

### F1. [BUG] `formatRelativeDate` returns "NaN years ago" for invalid dates

**File:** `lib/utils/dates.ts:1-12`

When passed an invalid date string, `new Date()` produces `Invalid Date` and `getTime()` returns `NaN`, causing the function to fall through all conditionals and return `"NaN years ago"`.

```diff
--- a/lib/utils/dates.ts
+++ b/lib/utils/dates.ts
@@ -1,5 +1,7 @@
 export function formatRelativeDate(dateString: string): string {
   const date = new Date(dateString);
+  if (isNaN(date.getTime())) return 'Unknown';
+
   const now = new Date();
   const diffMs = now.getTime() - date.getTime();
   const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
```

---

### F2. [BUG] Slug deduplication fails when suite project collides with root-level project

**File:** `lib/scanner.ts:597-613`

When a suite project's slug collides with a root-level project (which has no `suite`), the root project is never prefixed because the code checks `if (existing?.suite)`. The new project keeps its raw slug, and line 611 adds a duplicate to `seenSlugs`.

```diff
--- a/lib/scanner.ts
+++ b/lib/scanner.ts
@@ -597,10 +597,12 @@
         // Handle slug collisions by prefixing with suite name
         if (seenSlugs.has(project.slug)) {
           const existing = projects.find(p => p.slug === project.slug);
-          if (existing?.suite) {
-            const existingPrefix = existing.suite.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
+          if (existing) {
+            const prefix = existing.suite
+              ? existing.suite.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
+              : 'root';
             seenSlugs.delete(existing.slug);
-            existing.slug = `${existingPrefix}--${existing.slug}`;
+            existing.slug = `${prefix}--${existing.slug}`;
             seenSlugs.add(existing.slug);
           }
           if (suite) {
             const suitePrefix = suite.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
             project.slug = `${suitePrefix}--${project.slug}`;
+          } else {
+            project.slug = `root--${project.slug}`;
           }
         }
```

---

### F3. [BUG] TOCTOU race in `ensureConfigExists` — concurrent creates can overwrite each other

**File:** `lib/config.ts:10-18`

Two processes can both observe the file as absent via `fs.access` and both call `writeFile`, with one overwrite losing data. Use `flag: 'wx'` for atomic exclusive creation.

```diff
--- a/lib/config.ts
+++ b/lib/config.ts
@@ -10,10 +10,10 @@
 async function ensureConfigExists(): Promise<string> {
   const configPath = getConfigPath();
   try {
-    await fs.access(configPath);
+    // Atomic exclusive create — fails with EEXIST if file already exists
+    await fs.writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), { encoding: 'utf-8', flag: 'wx' });
   } catch {
-    // Create empty config if it doesn't exist
-    await fs.writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
+    // EEXIST or other error — file either exists or has a real problem
   }
   return configPath;
 }
```

---

### F4. [BUG] `DocsCard` fetch has no cleanup — race condition on rapid `projectPath` changes

**File:** `components/project/DocsCard.tsx:200-212`

Multiple in-flight requests can resolve out-of-order, showing stale docs for a previously selected project.

```diff
--- a/components/project/DocsCard.tsx
+++ b/components/project/DocsCard.tsx
@@ -198,14 +198,19 @@

-  const fetchDocs = () => {
-    fetch(`/api/projects/docs?path=${encodeURIComponent(projectPath)}`)
-      .then(res => res.json())
-      .then(data => {
+  useEffect(() => {
+    let cancelled = false;
+    setLoading(true);
+
+    fetch(`/api/projects/docs?path=${encodeURIComponent(projectPath)}`)
+      .then(res => res.json())
+      .then(data => {
+        if (!cancelled) {
           setDocs(data.docs || []);
-      })
-      .catch(() => {})
-      .finally(() => setLoading(false));
-  };
-
-  useEffect(() => {
-    fetchDocs();
+        }
+      })
+      .catch(() => {})
+      .finally(() => {
+        if (!cancelled) setLoading(false);
+      });
+
+    return () => { cancelled = true; };
   }, [projectPath]);
```

---

### F5. [BUG] Unsafe `as` casts on rcodegen tool/task from filename regex

**File:** `lib/scanner.ts:412-413`

The regex `([a-z]+)` matches any lowercase string but the values are cast to the union type without validation. Invalid tool/task values corrupt the `taskGrades` computation.

```diff
--- a/lib/scanner.ts
+++ b/lib/scanner.ts
@@ -399,6 +399,10 @@
         const [, tool, task, dateStr] = match;

+        const validTools = new Set(['claude', 'codex', 'gemini']);
+        const validTasks = new Set(['audit', 'test', 'fix', 'refactor', 'quick']);
+        if (!validTools.has(tool) || !validTasks.has(task)) continue;
+
         const filePath = path.join(rcodegenDir, file);
```

---

### F6. [CODE SMELL] `env.test.ts` duplicates schema instead of importing it

**File:** `tests/lib/env.test.ts:5-16`

The test re-declares `EnvSchema` with different field names (`CODE_BASE_PATH` instead of `codeBasePath`). If the real schema in `lib/env.ts` changes, this test won't catch regressions. The schema should be exported separately from the singleton and imported in tests.

No diff — requires architectural decision on how to export the schema separately from the parsed singleton.

---

## 4. REFACTOR — Opportunities to Improve Code Quality

### R1. Extract terminal command parsing and validation into a testable module

`app/api/terminal/route.ts` contains ~100 lines of command parsing and validation logic (`parseCommand`, `validateCommandArgs`, `ALLOWED_COMMANDS`, all `BLOCKED_*` sets) mixed with HTTP route handling. Extract to `lib/terminal.ts` for direct unit testing without HTTP request construction.

### R2. Add React Error Boundaries

Zero error boundaries exist in the entire component tree. A crash in any component (e.g., `ReactMarkdown` processing malformed content, `@tanstack/react-table` column error) takes down the entire UI. Add at minimum:
- Root-level error boundary wrapping `<main>` in `app/layout.tsx`
- Component-level boundaries around `ReadmePreview`, `TerminalPanel`, and `DocsCard`

### R3. Consolidate module-level caches into a shared pattern

Three separate files (`scan-cache.ts`, `activity/commits/route.ts`, `activity/velocity/route.ts`) each implement their own module-level cache with TTL. Extract a generic `TtlCache<K, V>` utility to `lib/cache.ts` with request coalescing support.

### R4. Cache `readConfig()` with a short TTL

`readConfig()` performs a filesystem read on every API call. Unlike project scanning (which uses `scan-cache.ts`), config reads are never cached. A 5-second TTL cache would eliminate redundant reads during request bursts.

### R5. Replace `window.location.reload()` with `useProjects().refresh()`

`components/sidebar/Sidebar.tsx:206` uses a hard page reload after project creation. The `refresh()` function from `useProjects` already exists and handles cache-busting. Using it preserves React state, scroll position, and open panels.

### R6. Add `AbortController` cleanup to all `useEffect` fetches

At least 3 components (`DocsCard`, `BugsCard` modal, `DocModal`) have `useEffect` hooks that fetch without cleanup. This causes state updates on unmounted components. Standardize on a consistent `useFetch` hook or `AbortController` pattern.

### R7. Clean up `DANGEROUS_KEYS` in secval to only block real prototype pollution vectors

`lib/chassis/secval.ts` blocks `command`, `exec`, `shell`, `script` as dangerous keys, but only `__proto__`, `constructor`, and `prototype` are actual prototype pollution vectors. The terminal route had to downgrade to `parseBody` because its payload uses `command` as a key. Remove application-level keywords from the dangerous set.

### R8. `workStream` results array grows unbounded

`lib/chassis/work.ts:167-206` — the `results` array accumulates all items even after they've been yielded. For large iterables, this is a memory leak. Clear references after yielding to allow GC.

### R9. Machine-specific paths in tests

`tests/lib/pathSecurity.test.ts` and `tests/lib/env.test.ts` hardcode `/Users/cliff/Desktop/_code`. These tests fail on any other machine or CI. Use `process.env.CODE_BASE_PATH` or a test-specific temp directory.

### R10. `ProjectTable` columns memo has stale closure risk

`components/dashboard/ProjectTable.tsx:73` — `useMemo(() => [...], [])` with empty dependency array captures `handleToggleStar` in a closure that never updates. Add `handleToggleStar` to the dependency array.
