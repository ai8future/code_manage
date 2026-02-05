Date Created: 2026-01-25 11:00:16 +0100
Date Updated: 2026-01-28
TOTAL_SCORE: 60/100

---

## FIXED ITEMS (Removed from Report)

The following issues have been fixed:
- Critical: Remote command execution in terminal API (switched to execFile + whitelist + cwd validation)
- High: Arbitrary file move/rename validation (added path validation + status validation)
- High: Unrestricted file reads via symlinks (added realpath check)
- Low: Hardcoded CODE_BASE_PATH (centralized in lib/constants.ts)

**Scope**
- Quick audit of API routes, filesystem access, config handling, and frontend rendering paths.
- Focused on security and correctness; limited depth per request (time boxed).

**Score Rationale**
- Security: 35/60 (critical RCE + filesystem access gaps + missing auth on sensitive routes).
- Reliability: 15/25 (hardcoded paths, potential path edge cases, no caching).
- Maintainability: 10/15 (config duplication, dependency mismatch).

**Findings (Ordered By Severity)**
- Critical: Remote command execution via `app/api/terminal/route.ts`. Any caller can run arbitrary shell commands. If this app is reachable outside localhost, it is a full host compromise. The command is also executed via shell (`exec`), increasing injection risk.
- High: Arbitrary file move/rename via `app/api/actions/move/route.ts`. `projectPath` and `newStatus` are not validated. A crafted request can move any path the server can access and potentially escape the intended project root.
- High: Unrestricted local file reads via `app/api/file/route.ts` and `app/api/projects/readme/route.ts`. `readme` route lacks base-path checks; `file` route can be bypassed via symlinked paths. Without auth, this is direct data exfiltration.
- Medium: Missing authentication/authorization across mutation endpoints (e.g., `app/api/projects/[slug]/route.ts`, `app/api/actions/*`, `app/api/terminal/route.ts`). Any caller who can reach the app can modify local state or trigger OS-level actions.
- Low: Hardcoded `CODE_BASE_PATH` appears in multiple files. This blocks portability and increases the chance of misconfiguration when deployed elsewhere.
- Low: Dependency mismatch in `package.json` (`next` 16.x with `eslint-config-next` 14.x) risks tooling inconsistencies and runtime mismatches.

**Patch-Ready Diffs**

1) Lock down terminal execution: require explicit enable flag, allowlist commands, and avoid shell.
```diff
diff --git a/app/api/terminal/route.ts b/app/api/terminal/route.ts
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@
-import { NextResponse } from 'next/server';
-import { exec } from 'child_process';
+import { NextResponse } from 'next/server';
+import { execFile } from 'child_process';
+import path from 'path';
@@
 export const dynamic = 'force-dynamic';
+
+const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
+const ALLOWED_COMMANDS = new Set(['git', 'ls', 'rg', 'npm', 'pnpm', 'yarn']);
@@
 export async function POST(request: Request) {
   try {
-    const { command, cwd } = await request.json();
+    const { command, cwd } = await request.json();
+
+    if (process.env.CODE_MANAGE_ENABLE_TERMINAL !== 'true') {
+      return NextResponse.json(
+        { error: 'Terminal access disabled' },
+        { status: 403 }
+      );
+    }
 
-    if (!command) {
+    if (!Array.isArray(command) || command.length === 0) {
       return NextResponse.json(
         { error: 'Command is required' },
         { status: 400 }
       );
     }
+
+    const [bin, ...args] = command;
+    if (!ALLOWED_COMMANDS.has(bin)) {
+      return NextResponse.json(
+        { error: 'Command not allowed' },
+        { status: 403 }
+      );
+    }
+
+    const requestedCwd = cwd ? path.resolve(cwd) : process.cwd();
+    if (!requestedCwd.startsWith(CODE_BASE_PATH + path.sep)) {
+      return NextResponse.json(
+        { error: 'Invalid working directory' },
+        { status: 403 }
+      );
+    }
 
     const result = await new Promise<CommandResult>((resolve) => {
-      exec(
-        command,
+      execFile(
+        bin,
+        args,
         {
-          cwd: cwd || process.cwd(),
+          cwd: requestedCwd,
           maxBuffer: 1024 * 1024 * 10, // 10MB
           timeout: 60000, // 1 minute timeout
           env: {
@@
         (error, stdout, stderr) => {
           resolve({
             stdout: stdout || '',
             stderr: stderr || '',
             exitCode: error?.code || 0,
           });
         }
       );
     });
```

2) Validate move requests to prevent path traversal and invalid status updates.
```diff
diff --git a/app/api/actions/move/route.ts b/app/api/actions/move/route.ts
--- a/app/api/actions/move/route.ts
+++ b/app/api/actions/move/route.ts
@@
 const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
@@
 const STATUS_FOLDERS: Record<ProjectStatus, string | null> = {
   active: null, // Root level
   crawlers: '_crawlers',
   icebox: '_icebox',
   archived: '_old',
 };
+
+const VALID_STATUSES: ProjectStatus[] = ['active', 'crawlers', 'icebox', 'archived'];
+
+function isValidStatus(status: string): status is ProjectStatus {
+  return VALID_STATUSES.includes(status as ProjectStatus);
+}
@@
   try {
     const { slug, projectPath, newStatus } = await request.json();
 
     if (!slug || !projectPath || !newStatus) {
       return NextResponse.json(
         { error: 'Missing required fields' },
         { status: 400 }
       );
     }
+
+    if (!isValidStatus(newStatus)) {
+      return NextResponse.json(
+        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
+        { status: 400 }
+      );
+    }
+
+    const resolvedProjectPath = path.resolve(projectPath);
+    if (!resolvedProjectPath.startsWith(CODE_BASE_PATH + path.sep)) {
+      return NextResponse.json(
+        { error: 'Invalid project path' },
+        { status: 403 }
+      );
+    }
 
-    const projectName = path.basename(projectPath);
+    const projectName = path.basename(resolvedProjectPath);
+    if (!projectName || projectName === '.' || projectName === '..') {
+      return NextResponse.json(
+        { error: 'Invalid project name' },
+        { status: 400 }
+      );
+    }
@@
-    const targetPath = path.join(targetDir, projectName);
+    const targetPath = path.join(targetDir, projectName);
+    const resolvedTargetPath = path.resolve(targetPath);
+    if (!resolvedTargetPath.startsWith(CODE_BASE_PATH + path.sep)) {
+      return NextResponse.json(
+        { error: 'Invalid target path' },
+        { status: 403 }
+      );
+    }
@@
-    await fs.rename(projectPath, targetPath);
+    await fs.rename(resolvedProjectPath, resolvedTargetPath);
@@
     return NextResponse.json({
       success: true,
-      newPath: targetPath,
+      newPath: resolvedTargetPath,
     });
```

3) Restrict README reads to the configured code base directory.
```diff
diff --git a/app/api/projects/readme/route.ts b/app/api/projects/readme/route.ts
--- a/app/api/projects/readme/route.ts
+++ b/app/api/projects/readme/route.ts
@@
 export const dynamic = 'force-dynamic';
 
+const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
 const README_FILES = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];
@@
   if (!projectPath) {
     return NextResponse.json(
       { error: 'Path is required' },
       { status: 400 }
     );
   }
+
+  const resolvedProjectPath = path.resolve(projectPath);
+  if (!resolvedProjectPath.startsWith(CODE_BASE_PATH + path.sep)) {
+    return NextResponse.json(
+      { error: 'Invalid path' },
+      { status: 403 }
+    );
+  }
 
   try {
     for (const filename of README_FILES) {
-      const filePath = path.join(projectPath, filename);
+      const filePath = path.join(resolvedProjectPath, filename);
       try {
         const content = await fs.readFile(filePath, 'utf-8');
         return NextResponse.json({ content, filename });
```

4) Prevent symlink escape when reading files.
```diff
diff --git a/app/api/file/route.ts b/app/api/file/route.ts
--- a/app/api/file/route.ts
+++ b/app/api/file/route.ts
@@
-  const resolvedPath = path.resolve(filePath);
-  if (!resolvedPath.startsWith(CODE_BASE_PATH + '/')) {
+  const resolvedPath = path.resolve(filePath);
+  let realPath: string;
+  try {
+    realPath = await fs.realpath(resolvedPath);
+  } catch {
+    return NextResponse.json(
+      { error: 'File not found' },
+      { status: 404 }
+    );
+  }
+  if (!realPath.startsWith(CODE_BASE_PATH + path.sep)) {
     return NextResponse.json(
       { error: 'Invalid path' },
       { status: 403 }
     );
   }
@@
-    const content = await fs.readFile(resolvedPath, 'utf-8');
+    const content = await fs.readFile(realPath, 'utf-8');
     return NextResponse.json({ content });
```

**Additional Recommendations (No Diff Included)**
- Add authentication/authorization for all mutation routes (e.g., shared secret header, NextAuth, or reverse-proxy auth) and consider CSRF protection if browser sessions are used.
- Consolidate `CODE_BASE_PATH` into a single config source (env var + central getter) to avoid divergent behavior.
- Align Next.js and eslint-config-next versions to avoid tooling mismatches.

**Residual Risks / Testing Gaps**
- No automated tests or route-level security tests observed; add integration tests that assert blocked access outside the code base and disallowed commands.
- Performance under large directories is unmeasured; consider caching `scanAllProjects` results or adding memoization.
