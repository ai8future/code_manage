Date Created: 2026-01-28 18:50:30 +0100
TOTAL_SCORE: 84/100

## Summary
- Reviewed core API routes, scanner, and date utilities for security and correctness.
- Found two path-validation weaknesses (prefix-only checks) and a date-formatting edge case (invalid/future inputs and singular grammar).
- Provided patch-ready diffs plus lightweight tests for the regressions.

## Findings

### 1) Path validation allows prefix-bypass (security)
**Severity:** High

Two endpoints validate paths using `startsWith(CODE_BASE_PATH)` which allows paths like `/Users/.../_code_evil` to pass. This is a known prefix-check pitfall. It affects:
- `POST /api/terminal` (cwd validation)
- `GET /api/projects/docs` (project path validation)

**Impact:** A crafted path could escape the intended code base root and access files in sibling directories sharing the prefix. While still constrained by command allowlists, this is a meaningful boundary break.

**Fix:** Use `path.relative()` to ensure the resolved path is inside the base directory. This handles both exact matches and proper subpaths.

### 2) Relative date formatting returns invalid or awkward output
**Severity:** Medium

`formatRelativeDate` returns `NaN days ago` for invalid dates and `1 weeks/months/years ago` for singular values. Future timestamps can also produce negative day counts.

**Impact:** UI can render confusing or broken values. This shows up in project cards and code quality cards.

**Fix:** Guard against invalid dates, clamp future dates to "Today", and add pluralization for week/month/year/day outputs. Add simple tests for these cases.

## Patch-ready diffs

### 1) Harden path validation in terminal route
```diff
diff --git a/app/api/terminal/route.ts b/app/api/terminal/route.ts
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@
 import { NextResponse } from 'next/server';
 import { execFile } from 'child_process';
 import path from 'path';
 import { CODE_BASE_PATH } from '@/lib/constants';
@@
 const BLOCKED_NPM_SUBCOMMANDS = new Set(['exec', 'x', 'init', 'create', 'pkg']);
 const BLOCKED_NPX_ARGS = new Set(['--yes', '-y', '--package', '-p']);
+
+function isPathWithinBase(basePath: string, targetPath: string): boolean {
+  const relative = path.relative(basePath, targetPath);
+  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
+}
@@
     }
 
     // Validate cwd is within CODE_BASE_PATH to prevent path traversal
-    const resolvedCwd = path.resolve(cwd || CODE_BASE_PATH);
-    if (!resolvedCwd.startsWith(CODE_BASE_PATH)) {
+    const basePath = path.resolve(CODE_BASE_PATH);
+    const resolvedCwd = path.resolve(cwd || basePath);
+    if (!isPathWithinBase(basePath, resolvedCwd)) {
       return NextResponse.json(
         { error: 'Working directory must be within the code base path' },
         { status: 403 }
       );
     }
```

### 2) Harden docs path validation in projects docs route
```diff
diff --git a/app/api/projects/docs/route.ts b/app/api/projects/docs/route.ts
--- a/app/api/projects/docs/route.ts
+++ b/app/api/projects/docs/route.ts
@@
 const IGNORED_FILES = new Set(['README.md', 'readme.md', 'Readme.md', 'CHANGELOG.md', 'changelog.md', 'LICENSE.md', 'AGENTS.md']);
+
+function isPathWithinBase(basePath: string, targetPath: string): boolean {
+  const relative = path.relative(basePath, targetPath);
+  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
+}
@@
   // Validate path is within CODE_BASE_PATH
-  const resolvedPath = path.resolve(projectPath);
-  const realPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);
-  if (!realPath.startsWith(CODE_BASE_PATH)) {
+  const basePath = path.resolve(CODE_BASE_PATH);
+  const resolvedPath = path.resolve(projectPath);
+  const realPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);
+  if (!isPathWithinBase(basePath, realPath)) {
     return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
   }
```

### 3) Make date formatting resilient and grammatically correct
```diff
diff --git a/lib/utils/dates.ts b/lib/utils/dates.ts
--- a/lib/utils/dates.ts
+++ b/lib/utils/dates.ts
@@
 export function formatRelativeDate(dateString: string): string {
   const date = new Date(dateString);
+  if (Number.isNaN(date.getTime())) {
+    return 'Unknown';
+  }
   const now = new Date();
-  const diffMs = now.getTime() - date.getTime();
-  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
+  let diffMs = now.getTime() - date.getTime();
+  if (diffMs < 0) diffMs = 0;
+  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
+
+  const pluralize = (value: number, unit: string) => (value === 1 ? unit : `${unit}s`);
@@
-  if (diffDays < 7) return `${diffDays} days ago`;
-  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
-  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
-  return `${Math.floor(diffDays / 365)} years ago`;
+  if (diffDays < 7) return `${diffDays} ${pluralize(diffDays, 'day')} ago`;
+  if (diffDays < 30) {
+    const weeks = Math.floor(diffDays / 7);
+    return `${weeks} ${pluralize(weeks, 'week')} ago`;
+  }
+  if (diffDays < 365) {
+    const months = Math.floor(diffDays / 30);
+    return `${months} ${pluralize(months, 'month')} ago`;
+  }
+  const years = Math.floor(diffDays / 365);
+  return `${years} ${pluralize(years, 'year')} ago`;
 }
@@
 export function formatShortDate(dateString: string): string {
   const date = new Date(dateString);
+  if (Number.isNaN(date.getTime())) {
+    return 'Unknown';
+  }
   return date.toLocaleDateString('en-US', {
     month: 'short',
     day: 'numeric',
     year: 'numeric',
   });
 }
```

### 4) Add regression test for terminal cwd prefix-bypass
```diff
diff --git a/tests/api/terminal.test.ts b/tests/api/terminal.test.ts
--- a/tests/api/terminal.test.ts
+++ b/tests/api/terminal.test.ts
@@
-import { describe, it, expect } from 'vitest';
+import { describe, it, expect } from 'vitest';
 import { POST } from '@/app/api/terminal/route';
+import { CODE_BASE_PATH } from '@/lib/constants';
@@
   it('returns 403 for invalid cwd outside CODE_BASE_PATH', async () => {
     const request = new Request('http://localhost/api/terminal', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ command: 'ls', cwd: '/etc' }),
     });
     const response = await POST(request);
@@
     expect(data.error).toContain('within');
   });
+
+  it('returns 403 for cwd that only shares prefix with CODE_BASE_PATH', async () => {
+    const request = new Request('http://localhost/api/terminal', {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({ command: 'ls', cwd: `${CODE_BASE_PATH}_evil` }),
+    });
+    const response = await POST(request);
+
+    expect(response.status).toBe(403);
+  });
```

### 5) Add date utility tests
```diff
diff --git a/tests/lib/dates.test.ts b/tests/lib/dates.test.ts
new file mode 100644
--- /dev/null
+++ b/tests/lib/dates.test.ts
@@
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import { formatRelativeDate, formatShortDate } from '@/lib/utils/dates';
+
+describe('formatRelativeDate', () => {
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('returns Unknown for invalid dates', () => {
+    expect(formatRelativeDate('not-a-date')).toBe('Unknown');
+  });
+
+  it('uses singular units when needed', () => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-01-28T00:00:00Z'));
+
+    expect(formatRelativeDate('2026-01-21T00:00:00Z')).toBe('1 week ago');
+    expect(formatRelativeDate('2025-12-29T00:00:00Z')).toBe('1 month ago');
+    expect(formatRelativeDate('2025-01-28T00:00:00Z')).toBe('1 year ago');
+  });
+});
+
+describe('formatShortDate', () => {
+  it('returns Unknown for invalid dates', () => {
+    expect(formatShortDate('not-a-date')).toBe('Unknown');
+  });
+});
```

## Notes / Follow-ups
- Consider centralizing `isPathWithinBase` in a shared utility to avoid drift across API routes.
- If you want to support relative `path` values from the client, consider resolving against `CODE_BASE_PATH` rather than `process.cwd()`.

## What was not changed
- No code was edited in the repository per instruction. All fixes are provided as patch-ready diffs.
