Date Created: 2026-01-28 18:59:55 +0100
TOTAL_SCORE: 76/100

## AUDIT

- Terminal command endpoint allows access outside the code base via absolute paths and `git -C`/`--work-tree`/`--git-dir`, plus a `startsWith` check that treats `/Users/cliff/Desktop/_code_evil` as in-bounds. This is an arbitrary read/exec risk. Patch adds boundary-safe path checks and validates path arguments for file-oriented commands.

```diff
diff --git a/app/api/terminal/route.ts b/app/api/terminal/route.ts
index 6c704d8..0b3392c 100644
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -17,6 +17,8 @@ const ALLOWED_COMMANDS = new Set([
 const BLOCKED_NODE_ARGS = new Set(['-e', '--eval', '-p', '--print', '--input-type', '-r', '--require']);
 const BLOCKED_NPM_SUBCOMMANDS = new Set(['exec', 'x', 'init', 'create', 'pkg']);
 const BLOCKED_NPX_ARGS = new Set(['--yes', '-y', '--package', '-p']);
+const PATH_ARG_COMMANDS = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'grep', 'find']);
+const BLOCKED_GIT_ARGS = new Set(['-C', '--work-tree', '--git-dir']);
@@
 function validateCommandArgs(baseCommand: string, args: string[]): string | null {
@@
   // Block pnpm dlx (similar to npx)
   if (baseCommand === 'pnpm' && args.length > 0 && args[0] === 'dlx') {
     return `pnpm 'dlx' is not allowed for security reasons`;
   }
+
+  // Block git path overrides that escape cwd
+  if (baseCommand === 'git') {
+    for (const arg of args) {
+      if (
+        BLOCKED_GIT_ARGS.has(arg) ||
+        arg.startsWith('--work-tree=') ||
+        arg.startsWith('--git-dir=')
+      ) {
+        return `git argument '${arg}' is not allowed for security reasons`;
+      }
+    }
+  }
@@
   return null; // No issues found
 }
+
+function isWithinBasePath(targetPath: string): boolean {
+  const relative = path.relative(CODE_BASE_PATH, targetPath);
+  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
+}
+
+function validatePathArgs(baseCommand: string, args: string[], cwd: string): string | null {
+  if (!PATH_ARG_COMMANDS.has(baseCommand)) return null;
+
+  if (baseCommand === 'grep') {
+    let patternConsumed = false;
+    let afterDoubleDash = false;
+    for (const arg of args) {
+      if (arg === '--') {
+        afterDoubleDash = true;
+        continue;
+      }
+      if (!afterDoubleDash && arg.startsWith('-')) continue;
+      if (!patternConsumed) {
+        patternConsumed = true;
+        continue;
+      }
+      const resolved = path.resolve(cwd, arg);
+      if (!isWithinBasePath(resolved)) {
+        return `Path '${arg}' is outside the code base`;
+      }
+    }
+    return null;
+  }
+
+  if (baseCommand === 'find') {
+    let parsingPaths = true;
+    for (const arg of args) {
+      if (arg === '--') {
+        parsingPaths = false;
+        continue;
+      }
+      if (parsingPaths && arg.startsWith('-')) {
+        parsingPaths = false;
+        continue;
+      }
+      if (!parsingPaths) continue;
+      const resolved = path.resolve(cwd, arg);
+      if (!isWithinBasePath(resolved)) {
+        return `Path '${arg}' is outside the code base`;
+      }
+    }
+    return null;
+  }
+
+  for (const arg of args) {
+    if (arg.startsWith('-')) continue;
+    const resolved = path.resolve(cwd, arg);
+    if (!isWithinBasePath(resolved)) {
+      return `Path '${arg}' is outside the code base`;
+    }
+  }
+
+  return null;
+}
@@
     // Validate cwd is within CODE_BASE_PATH to prevent path traversal
     const resolvedCwd = path.resolve(cwd || CODE_BASE_PATH);
-    if (!resolvedCwd.startsWith(CODE_BASE_PATH)) {
+    if (!isWithinBasePath(resolvedCwd)) {
       return NextResponse.json(
         { error: 'Working directory must be within the code base path' },
         { status: 403 }
@@
     const argError = validateCommandArgs(baseCommand, args);
     if (argError) {
       return NextResponse.json(
         { error: argError },
         { status: 403 }
       );
     }
+
+    const pathArgError = validatePathArgs(baseCommand, args, resolvedCwd);
+    if (pathArgError) {
+      return NextResponse.json(
+        { error: pathArgError },
+        { status: 403 }
+      );
+    }
*** End Patch
```

- Docs listing endpoint accepts `/Users/cliff/Desktop/_code_evil` because of a prefix check and can read symlinked markdown files outside the allowed directory. Patch uses boundary-safe checks and validates each file’s realpath.

```diff
diff --git a/app/api/projects/docs/route.ts b/app/api/projects/docs/route.ts
index 6d27bb7..6be5a4b 100644
--- a/app/api/projects/docs/route.ts
+++ b/app/api/projects/docs/route.ts
@@ -14,6 +14,11 @@ interface DocFile {
   date?: string;
 }
+
+function isWithinBasePath(targetPath: string): boolean {
+  const relative = path.relative(CODE_BASE_PATH, targetPath);
+  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
+}
@@
   // Validate path is within CODE_BASE_PATH
   const resolvedPath = path.resolve(projectPath);
   const realPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);
-  if (!realPath.startsWith(CODE_BASE_PATH)) {
+  if (!isWithinBasePath(realPath)) {
     return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
   }
 
   try {
-    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
+    const entries = await fs.readdir(realPath, { withFileTypes: true });
     const docs: DocFile[] = [];
@@
-      const filePath = path.join(resolvedPath, entry.name);
+      const filePath = path.join(realPath, entry.name);
 
       try {
-        const rawContent = await fs.readFile(filePath, 'utf-8');
+        const realFilePath = await fs.realpath(filePath).catch(() => null);
+        if (!realFilePath || !isWithinBasePath(realFilePath)) {
+          continue;
+        }
+        const rawContent = await fs.readFile(realFilePath, 'utf-8');
         const { data, content } = matter(rawContent);
*** End Patch
```

## TESTS

- Add coverage for boundary-safe path validation in docs listing and terminal route.

```diff
diff --git a/tests/api/terminal.test.ts b/tests/api/terminal.test.ts
index 2eab6e0..c5777ed 100644
--- a/tests/api/terminal.test.ts
+++ b/tests/api/terminal.test.ts
@@ -36,6 +36,18 @@ describe('POST /api/terminal', () => {
     expect(data.error).toContain('within');
   });
+
+  it('returns 403 for cwd with CODE_BASE_PATH prefix but outside', async () => {
+    const request = new Request('http://localhost/api/terminal', {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({ command: 'ls', cwd: '/Users/cliff/Desktop/_code_evil' }),
+    });
+    const response = await POST(request);
+
+    expect(response.status).toBe(403);
+  });
*** End Patch
```

```diff
diff --git a/tests/api/docs.test.ts b/tests/api/docs.test.ts
new file mode 100644
index 0000000..9ee5e3b
--- /dev/null
+++ b/tests/api/docs.test.ts
@@ -0,0 +1,26 @@
+import { describe, it, expect } from 'vitest';
+import { GET } from '@/app/api/projects/docs/route';
+
+describe('GET /api/projects/docs', () => {
+  it('returns 400 when path is missing', async () => {
+    const request = new Request('http://localhost/api/projects/docs');
+    const response = await GET(request);
+
+    expect(response.status).toBe(400);
+    const data = await response.json();
+    expect(data.error).toBe('Path is required');
+  });
+
+  it('returns 403 for CODE_BASE_PATH prefix but outside', async () => {
+    const request = new Request(
+      'http://localhost/api/projects/docs?path=' +
+        encodeURIComponent('/Users/cliff/Desktop/_code_evil')
+    );
+    const response = await GET(request);
+
+    expect(response.status).toBe(403);
+  });
+});
*** End Patch
```

- Add unit coverage for date formatting edge cases (invalid input, future dates, singular/plural).

```diff
diff --git a/tests/lib/dates.test.ts b/tests/lib/dates.test.ts
new file mode 100644
index 0000000..d5d7f1c
--- /dev/null
+++ b/tests/lib/dates.test.ts
@@ -0,0 +1,59 @@
+import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
+import { formatRelativeDate, formatShortDate } from '@/lib/utils/dates';
+
+describe('date utils', () => {
+  const base = new Date('2026-01-28T00:00:00Z');
+
+  beforeEach(() => {
+    vi.useFakeTimers();
+    vi.setSystemTime(base);
+  });
+
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  describe('formatRelativeDate', () => {
+    it('handles invalid dates', () => {
+      expect(formatRelativeDate('not-a-date')).toBe('Unknown');
+    });
+
+    it('formats recent past dates', () => {
+      expect(formatRelativeDate('2026-01-28T00:00:00Z')).toBe('Today');
+      expect(formatRelativeDate('2026-01-27T00:00:00Z')).toBe('Yesterday');
+      expect(formatRelativeDate('2026-01-23T00:00:00Z')).toBe('5 days ago');
+      expect(formatRelativeDate('2026-01-21T00:00:00Z')).toBe('1 week ago');
+    });
+
+    it('formats longer past ranges with singular units', () => {
+      expect(formatRelativeDate('2025-12-29T00:00:00Z')).toBe('1 month ago');
+      expect(formatRelativeDate('2025-01-28T00:00:00Z')).toBe('1 year ago');
+    });
+
+    it('formats future dates', () => {
+      expect(formatRelativeDate('2026-01-29T00:00:00Z')).toBe('Tomorrow');
+      expect(formatRelativeDate('2026-02-04T00:00:00Z')).toBe('In 1 week');
+    });
+  });
+
+  describe('formatShortDate', () => {
+    it('handles invalid dates', () => {
+      expect(formatShortDate('not-a-date')).toBe('Unknown');
+    });
+
+    it('formats a short US date', () => {
+      expect(formatShortDate('2026-01-28T00:00:00Z')).toBe('Jan 28, 2026');
+    });
+  });
+});
*** End Patch
```

## FIXES

- Date formatting returns negative or awkward strings for future/invalid inputs and uses plural units like “1 weeks ago”. Patch adds validation, future handling, and proper singular/plural units.

```diff
diff --git a/lib/utils/dates.ts b/lib/utils/dates.ts
index 6f3da18..8c3c1c0 100644
--- a/lib/utils/dates.ts
+++ b/lib/utils/dates.ts
@@ -1,17 +1,40 @@
+function pluralize(value: number, unit: string): string {
+  return value === 1 ? unit : `${unit}s`;
+}
+
 export function formatRelativeDate(dateString: string): string {
   const date = new Date(dateString);
+  if (isNaN(date.getTime())) return 'Unknown';
+
   const now = new Date();
-  const diffMs = now.getTime() - date.getTime();
-  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
+  const diffMs = now.getTime() - date.getTime();
+  const dayMs = 1000 * 60 * 60 * 24;
+  const diffDays = Math.floor(Math.abs(diffMs) / dayMs);
+  const inPast = diffMs >= 0;
 
   if (diffDays === 0) return 'Today';
-  if (diffDays === 1) return 'Yesterday';
-  if (diffDays < 7) return `${diffDays} days ago`;
-  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
-  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
-  return `${Math.floor(diffDays / 365)} years ago`;
+  if (diffDays === 1) return inPast ? 'Yesterday' : 'Tomorrow';
+  if (diffDays < 7) return inPast ? `${diffDays} days ago` : `In ${diffDays} days`;
+  if (diffDays < 30) {
+    const weeks = Math.floor(diffDays / 7);
+    return inPast
+      ? `${weeks} ${pluralize(weeks, 'week')} ago`
+      : `In ${weeks} ${pluralize(weeks, 'week')}`;
+  }
+  if (diffDays < 365) {
+    const months = Math.floor(diffDays / 30);
+    return inPast
+      ? `${months} ${pluralize(months, 'month')} ago`
+      : `In ${months} ${pluralize(months, 'month')}`;
+  }
+  const years = Math.floor(diffDays / 365);
+  return inPast
+    ? `${years} ${pluralize(years, 'year')} ago`
+    : `In ${years} ${pluralize(years, 'year')}`;
 }
 
 export function formatShortDate(dateString: string): string {
   const date = new Date(dateString);
+  if (isNaN(date.getTime())) return 'Unknown';
   return date.toLocaleDateString('en-US', {
     month: 'short',
     day: 'numeric',
     year: 'numeric',
*** End Patch
```

## REFACTOR

- Consolidate path validation (resolve, realpath, boundary check) into a shared helper to reduce duplication across API routes and keep the security policy consistent.
- Consider a small schema-validation layer (e.g., zod) for API payloads to reduce hand-rolled validation and unify error responses.
- Extract a shared markdown rendering component or mapping for README/docs to avoid re-creating renderers and inline styles.
- Consider a lightweight concurrency limiter in `scanAllProjects` to avoid slow scans on large directory trees.
