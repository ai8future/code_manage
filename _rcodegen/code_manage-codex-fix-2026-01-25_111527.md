Date Created: 2026-01-25 11:15:30 +0100
Date Updated: 2026-01-28
TOTAL_SCORE: 78/100

---

## FIXED ITEMS (Removed from Report)

The following issues have been fixed:
- High: Path traversal in README API (added path validation)
- High: Move API path/status validation (added source path + status validation)
- Medium: Terminal API cwd validation (added cwd validation within CODE_BASE_PATH)

# Code Manage Fix Report (Codex)

## Overview
Quick pass on API routes and core scanning logic with a focus on safety and data correctness. The main risks are unvalidated file paths and overly-permissive command/move operations. No code was modified per instruction; patch-ready diffs are provided below.

## Findings

### 1) High: Path traversal in README API
`GET /api/projects/readme` accepts a `path` query and reads README files without enforcing a base directory. This enables arbitrary file reads if the endpoint is reachable outside a trusted local environment.

Proposed fix: resolve and validate the project path against the code base root before reading README files.

Patch-ready diff:
```diff
diff --git a/app/api/projects/readme/route.ts b/app/api/projects/readme/route.ts
--- a/app/api/projects/readme/route.ts
+++ b/app/api/projects/readme/route.ts
@@
-import { NextResponse } from 'next/server';
-import { promises as fs } from 'fs';
-import path from 'path';
+import { NextResponse } from 'next/server';
+import { promises as fs } from 'fs';
+import path from 'path';
+import { getCodeBasePath } from '@/lib/scanner';
@@
-const README_FILES = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];
+const README_FILES = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];
+const CODE_BASE_PATH = path.resolve(getCodeBasePath());
@@
-  if (!projectPath) {
+  if (!projectPath) {
     return NextResponse.json(
       { error: 'Path is required' },
       { status: 400 }
     );
   }
 
+  const resolvedProjectPath = path.resolve(projectPath);
+  if (!resolvedProjectPath.startsWith(CODE_BASE_PATH + path.sep) && resolvedProjectPath !== CODE_BASE_PATH) {
+    return NextResponse.json(
+      { error: 'Invalid path' },
+      { status: 403 }
+    );
+  }
+
   try {
     for (const filename of README_FILES) {
-      const filePath = path.join(projectPath, filename);
+      const filePath = path.join(resolvedProjectPath, filename);
       try {
         const content = await fs.readFile(filePath, 'utf-8');
         return NextResponse.json({ content, filename });
```

### 2) High: Move API accepts arbitrary paths and invalid statuses
`POST /api/actions/move` trusts `projectPath` and `newStatus` without validation. This allows moving arbitrary directories and persisting invalid status values in metadata.

Proposed fix: validate input types, ensure `newStatus` is a known enum key, and enforce the code base boundary for `projectPath` before moving.

Patch-ready diff:
```diff
diff --git a/app/api/actions/move/route.ts b/app/api/actions/move/route.ts
--- a/app/api/actions/move/route.ts
+++ b/app/api/actions/move/route.ts
@@
-import { ProjectStatus } from '@/lib/types';
-import { setProjectMetadata } from '@/lib/config';
+import { ProjectStatus } from '@/lib/types';
+import { setProjectMetadata } from '@/lib/config';
+import { getCodeBasePath } from '@/lib/scanner';
 
-const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
+const CODE_BASE_PATH = path.resolve(getCodeBasePath());
@@
-    const { slug, projectPath, newStatus } = await request.json();
-
-    if (!slug || !projectPath || !newStatus) {
+    const { slug, projectPath, newStatus } = await request.json();
+
+    if (
+      !slug ||
+      typeof slug !== 'string' ||
+      !projectPath ||
+      typeof projectPath !== 'string' ||
+      !newStatus ||
+      typeof newStatus !== 'string'
+    ) {
       return NextResponse.json(
         { error: 'Missing required fields' },
         { status: 400 }
       );
     }
 
-    const projectName = path.basename(projectPath);
+    if (!Object.prototype.hasOwnProperty.call(STATUS_FOLDERS, newStatus)) {
+      return NextResponse.json(
+        { error: 'Invalid status' },
+        { status: 400 }
+      );
+    }
+
+    const resolvedProjectPath = path.resolve(projectPath);
+    if (!resolvedProjectPath.startsWith(CODE_BASE_PATH + path.sep) && resolvedProjectPath !== CODE_BASE_PATH) {
+      return NextResponse.json(
+        { error: 'Invalid path' },
+        { status: 403 }
+      );
+    }
+
+    const projectName = path.basename(resolvedProjectPath);
@@
-    const statusFolder = STATUS_FOLDERS[newStatus as ProjectStatus];
+    const statusFolder = STATUS_FOLDERS[newStatus as ProjectStatus];
     const targetDir = statusFolder
       ? path.join(CODE_BASE_PATH, statusFolder)
       : CODE_BASE_PATH;
@@
-    await fs.rename(projectPath, targetPath);
+    await fs.rename(resolvedProjectPath, targetPath);
```

### 3) Medium: Terminal API allows arbitrary cwd outside code base
`POST /api/terminal` runs commands with any `cwd`, so a malicious caller can operate outside the code base directory. Even if intended for local use, this is risky if the service is exposed.

Proposed fix: resolve and validate `cwd` against the code base root; default to the base path when unset.

Patch-ready diff:
```diff
diff --git a/app/api/terminal/route.ts b/app/api/terminal/route.ts
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@
-import { NextResponse } from 'next/server';
-import { exec } from 'child_process';
+import { NextResponse } from 'next/server';
+import { exec } from 'child_process';
+import path from 'path';
+import { getCodeBasePath } from '@/lib/scanner';
@@
 export const dynamic = 'force-dynamic';
 
+const CODE_BASE_PATH = path.resolve(getCodeBasePath());
+
 interface CommandResult {
   stdout: string;
   stderr: string;
   exitCode: number;
 }
@@
-    const { command, cwd } = await request.json();
-
-    if (!command) {
+    const { command, cwd } = await request.json();
+
+    if (!command || typeof command !== 'string' || !command.trim()) {
       return NextResponse.json(
         { error: 'Command is required' },
         { status: 400 }
       );
     }
+
+    const resolvedCwd = path.resolve(
+      typeof cwd === 'string' && cwd ? cwd : CODE_BASE_PATH
+    );
+    if (!resolvedCwd.startsWith(CODE_BASE_PATH + path.sep) && resolvedCwd !== CODE_BASE_PATH) {
+      return NextResponse.json(
+        { error: 'Invalid working directory' },
+        { status: 403 }
+      );
+    }
@@
-          cwd: cwd || process.cwd(),
+          cwd: resolvedCwd,
```

### 4) Low: Rcodegen fallback parser ignores YYYYMMDD filenames
`scanRcodegen` only parses report filenames with `YYYY-MM-DD`. Existing files using `YYYYMMDD` are skipped, reducing historical grading accuracy.

Proposed fix: accept 8-digit dates and normalize them to `YYYY-MM-DD` before parsing.

Patch-ready diff:
```diff
diff --git a/lib/scanner.ts b/lib/scanner.ts
--- a/lib/scanner.ts
+++ b/lib/scanner.ts
@@
-        const match = file.match(/^.+-([a-z]+)-([a-z]+)-(\d{4}-\d{2}-\d{2})/);
+        const match = file.match(/^.+-([a-z]+)-([a-z]+)-(\d{4}-\d{2}-\d{2}|\d{8})/);
         if (!match) continue;
 
-        const [, tool, task, dateStr] = match;
+        const [, tool, task, dateToken] = match;
+        const normalizedDate = dateToken.includes('-')
+          ? dateToken
+          : `${dateToken.slice(0, 4)}-${dateToken.slice(4, 6)}-${dateToken.slice(6, 8)}`;
         const filePath = path.join(rcodegenDir, file);
@@
-            grades.push({
-              date: new Date(dateStr).toISOString(),
+            grades.push({
+              date: new Date(normalizedDate).toISOString(),
               tool: tool as RcodegenGrade['tool'],
               task: task as RcodegenGrade['task'],
               grade: parseFloat(gradeMatch[1]),
```

## Notes
- No code was changed or committed per instruction.
- Version and CHANGELOG were not touched because no code edits were applied.
