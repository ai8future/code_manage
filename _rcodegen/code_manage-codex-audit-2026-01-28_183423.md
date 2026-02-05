Date Created: 2026-01-28 18:34:23 +0100
TOTAL_SCORE: 68/100


# Scope (fast pass)
- Target: Next.js app + API routes, lib utilities, tests, and security headers.
- Focus: Security exposure (filesystem + terminal), path validation, and gaps in test coverage.

# Score Breakdown
- Security: 52/100
- Reliability: 72/100
- Performance: 78/100
- Maintainability: 80/100
- Testing: 58/100

# Key Findings

## Critical
1) Terminal API allows command execution that can escape intended boundaries
   - Evidence: `app/api/terminal/route.ts` allows `git`, `npm`, `npx`, `yarn`, `pnpm`, and `node` with broad arguments and no auth.
   - Impact: If exposed beyond localhost, this is effectively remote code execution + filesystem access.
   - Fix: Gate unsafe commands behind an env flag or remove them; add realpath checks; add path-arg validation. (Diff below.)

## High
2) Path prefix bypass in docs + terminal path checks
   - Evidence: `startsWith(CODE_BASE_PATH)` without a path-separator boundary in `app/api/projects/docs/route.ts` and `app/api/terminal/route.ts`.
   - Impact: `/Users/cliff/Desktop/_code2` is treated as inside `/Users/cliff/Desktop/_code`.
   - Fix: Use `path.relative` boundary checks (diff below).

3) Docs endpoint can read symlinked files outside CODE_BASE_PATH
   - Evidence: `app/api/projects/docs/route.ts` reads each file directly without realpath validation.
   - Impact: A symlink inside a project can expose arbitrary files.
   - Fix: Resolve each file’s realpath and enforce base-path containment (diff below).

## Medium
4) File/README/Docs + project listing endpoints expose local filesystem and git remotes without auth
   - Evidence: `/api/file`, `/api/projects/readme`, `/api/projects/docs`, `/api/projects` return file contents, paths, and git remote URLs.
   - Impact: Sensitive data exposure if the app is network-accessible.
   - Fix: Require auth or restrict to localhost / trusted origins; consider disabling in production.

5) Unbounded markdown reads can cause large-memory responses
   - Evidence: `/api/file` and `/api/projects/readme` read entire files; `/api/projects/docs` reads all `.md` files.
   - Impact: Memory/latency spikes on large files.
   - Fix: Enforce file size limits and cap document counts per request.

## Low
6) Security headers are incomplete
   - Evidence: `next.config.mjs` lacks CSP; uses deprecated `X-XSS-Protection`.
   - Impact: Reduced browser hardening.
   - Fix: Add CSP + Permissions-Policy; consider removing X-XSS-Protection.

7) Missing test coverage for docs endpoint and boundary cases
   - Evidence: No `tests/api/docs` coverage; no tests for path prefix or symlink escapes in terminal/docs.
   - Fix: Add tests for boundary and symlink cases.

# Patch-ready diffs

## 1) Harden terminal route: realpath boundary checks + unsafe-command gating + path-arg checks
```diff
diff --git a/app/api/terminal/route.ts b/app/api/terminal/route.ts
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@
-import { NextResponse } from 'next/server';
-import { execFile } from 'child_process';
-import path from 'path';
-import { CODE_BASE_PATH } from '@/lib/constants';
+import { NextResponse } from 'next/server';
+import { execFile } from 'child_process';
+import { promises as fs } from 'fs';
+import path from 'path';
+import { CODE_BASE_PATH } from '@/lib/constants';
@@
-const ALLOWED_COMMANDS = new Set([
+const SAFE_COMMANDS = new Set([
   'ls', 'pwd', 'cat', 'head', 'tail', 'wc',
   'git', 'npm', 'npx', 'yarn', 'pnpm', 'node',
   'grep', 'find', 'echo', 'date', 'which'
 ]);
+
+const UNSAFE_COMMANDS = new Set(['git', 'npm', 'npx', 'yarn', 'pnpm', 'node']);
+const ALLOW_UNSAFE_COMMANDS = process.env.CODE_MANAGE_ALLOW_UNSAFE_TERMINAL === 'true';
+const PATH_ARG_COMMANDS = new Set(['cat', 'head', 'tail', 'wc', 'grep', 'find']);
+
+function isWithinBasePath(basePath: string, targetPath: string): boolean {
+  const relative = path.relative(basePath, targetPath);
+  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
+}
+
+function isPathLike(arg: string): boolean {
+  return arg.startsWith('/') || arg.startsWith('./') || arg.startsWith('../');
+}
@@
-    const resolvedCwd = path.resolve(cwd || CODE_BASE_PATH);
-    if (!resolvedCwd.startsWith(CODE_BASE_PATH)) {
+    const resolvedCwd = path.resolve(cwd || CODE_BASE_PATH);
+    const realCwd = await fs.realpath(resolvedCwd).catch(() => resolvedCwd);
+    if (!isWithinBasePath(CODE_BASE_PATH, realCwd)) {
       return NextResponse.json(
         { error: 'Working directory must be within the code base path' },
         { status: 403 }
       );
     }
@@
-    if (!ALLOWED_COMMANDS.has(baseCommand)) {
+    if (!SAFE_COMMANDS.has(baseCommand)) {
       return NextResponse.json(
         { error: `Command '${baseCommand}' is not allowed` },
         { status: 403 }
       );
     }
+
+    if (UNSAFE_COMMANDS.has(baseCommand) && !ALLOW_UNSAFE_COMMANDS) {
+      return NextResponse.json(
+        { error: `Command '${baseCommand}' is disabled unless CODE_MANAGE_ALLOW_UNSAFE_TERMINAL=true` },
+        { status: 403 }
+      );
+    }
@@
     const argError = validateCommandArgs(baseCommand, args);
     if (argError) {
       return NextResponse.json(
         { error: argError },
         { status: 403 }
       );
     }
+
+    if (PATH_ARG_COMMANDS.has(baseCommand)) {
+      for (const arg of args) {
+        if (!isPathLike(arg)) continue;
+        const resolvedArg = path.resolve(realCwd, arg);
+        const realArg = await fs.realpath(resolvedArg).catch(() => resolvedArg);
+        if (!isWithinBasePath(CODE_BASE_PATH, realArg)) {
+          return NextResponse.json(
+            { error: `Path '${arg}' must stay within the code base path` },
+            { status: 403 }
+          );
+        }
+      }
+    }
```

## 2) Fix docs route path boundary + per-file realpath checks
```diff
diff --git a/app/api/projects/docs/route.ts b/app/api/projects/docs/route.ts
--- a/app/api/projects/docs/route.ts
+++ b/app/api/projects/docs/route.ts
@@
 const IGNORED_FILES = new Set(['README.md', 'readme.md', 'Readme.md', 'CHANGELOG.md', 'changelog.md', 'LICENSE.md']);
+
+function isWithinBasePath(basePath: string, targetPath: string): boolean {
+  const relative = path.relative(basePath, targetPath);
+  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
+}
@@
   const resolvedPath = path.resolve(projectPath);
   const realPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);
-  if (!realPath.startsWith(CODE_BASE_PATH)) {
+  if (!isWithinBasePath(CODE_BASE_PATH, realPath)) {
     return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
   }
@@
       const filePath = path.join(resolvedPath, entry.name);
 
       try {
-        const rawContent = await fs.readFile(filePath, 'utf-8');
+        const realFilePath = await fs.realpath(filePath);
+        if (!isWithinBasePath(CODE_BASE_PATH, realFilePath)) {
+          continue;
+        }
+        const rawContent = await fs.readFile(realFilePath, 'utf-8');
         const { data, content } = matter(rawContent);
```

# Additional Recommendations (no diffs provided)
- Add auth or localhost-only guard for `/api/file`, `/api/projects/*`, and `/api/terminal` (e.g., require a token in headers).
- Add response size caps (e.g., 256 KB) for markdown reads and doc listings.
- Add tests for path-prefix bypass and symlink escapes, especially for `/api/projects/docs` and `/api/terminal`.
- Consider adding a CSP + Permissions-Policy in `next.config.mjs`.

# Quick Positives
- Good defensive checks in `/api/file`, `/api/projects/readme`, and `/api/actions/move` (path resolution + realpath).
- Proper file locking around config updates to avoid race conditions.
- Existing API tests cover several boundary cases.
