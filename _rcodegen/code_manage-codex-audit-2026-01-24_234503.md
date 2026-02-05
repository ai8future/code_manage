Date Created: 2026-01-24 23:45:01 +0100
TOTAL_SCORE: 62/100

# Code Manage Audit (Codex:gpt-5.1-codex-max-high)

## Scope & Method
- Reviewed Next.js app, API routes, and core lib utilities under `app/`, `lib/`, `components/`, plus config files.
- Static review only; no runtime tests executed.
- Focus on security, data safety, and operational reliability.

## Score Rationale
- Solid UI composition and project scanning logic, but multiple high-impact security issues in API routes (unauthenticated command execution, unsafe file access, unrestricted move).
- Minor data validation and dependency/version hygiene issues reduce maintainability.

## Key Findings (ordered by severity)

### Critical
1) Unauthenticated remote command execution via /api/terminal
- File: `app/api/terminal/route.ts:12`
- Issue: accepts arbitrary `command` and `cwd`, executes via `exec` with no auth, no allowlist, no path validation.
- Impact: RCE if server is exposed beyond localhost, or if local app is reachable by another process.
- Recommendation: disable by default, require an API token, and restrict working directory to code base.

### High
2) Arbitrary file read via README endpoint
- File: `app/api/projects/readme/route.ts:9`
- Issue: `path` query is used directly; no restriction to CODE_BASE_PATH.
- Impact: read README from any directory on disk, or follow symlinks.
- Recommendation: resolve real path and enforce base path boundary.

3) Unrestricted filesystem moves
- File: `app/api/actions/move/route.ts:16`
- Issue: `projectPath` and `newStatus` are untrusted; no validation that source is under base or that status is allowed.
- Impact: move arbitrary directories/files into code base, possibly destructive if exposed.
- Recommendation: validate status allowlist, use `realpath` + boundary check, require directory.

### Medium
4) File read endpoint can be bypassed with symlinks and lacks file-type checks
- File: `app/api/file/route.ts:20`
- Issue: only `path.resolve` + prefix string check; symlink inside base can point outside; directory reads not rejected explicitly.
- Impact: disclosure of files outside base if symlink exists.
- Recommendation: use `fs.realpath`, compare to base realpath, and require `stat.isFile()`.

5) PATCH metadata accepts unvalidated types/values
- File: `app/api/projects/[slug]/route.ts:54`
- Issue: `status`, `tags`, and text fields are not validated.
- Impact: config can be corrupted, UI can break in edge cases.
- Recommendation: validate `status` against allowed set, ensure tags is string[] and fields are strings.

### Low
6) Dependency version mismatch risks
- File: `package.json:16`
- Issue: `next` is 16.x while `eslint-config-next` is 14.x.
- Impact: lint/runtime inconsistency or broken rules.
- Recommendation: align `eslint-config-next` with Next version.

7) Hard-coded CODE_BASE_PATH in multiple files
- Files: `lib/scanner.ts`, `app/api/file/route.ts`, `app/api/actions/open-editor/route.ts`, others
- Impact: brittle path changes; harder to deploy on other machines.
- Recommendation: centralize in config/env.

## Patch-ready diffs
(These are suggested patches only; not applied.)

### 1) Gate terminal usage and restrict cwd
```diff
diff --git a/app/api/terminal/route.ts b/app/api/terminal/route.ts
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@
-import { NextResponse } from 'next/server';
-import { exec } from 'child_process';
+import { NextResponse } from 'next/server';
+import { exec } from 'child_process';
+import { promises as fs } from 'fs';
+import path from 'path';
 
 export const dynamic = 'force-dynamic';
 
+const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
+const TERMINAL_ENABLED = process.env.CODE_MANAGE_ENABLE_TERMINAL === 'true';
+
 interface CommandResult {
   stdout: string;
   stderr: string;
   exitCode: number;
 }
 
 export async function POST(request: Request) {
   try {
+    if (!TERMINAL_ENABLED) {
+      return NextResponse.json(
+        { error: 'Terminal is disabled' },
+        { status: 403 }
+      );
+    }
+
     const { command, cwd } = await request.json();
 
-    if (!command) {
+    if (typeof command !== 'string' || !command.trim()) {
       return NextResponse.json(
         { error: 'Command is required' },
         { status: 400 }
       );
     }
 
+    const desiredCwd = typeof cwd === 'string' ? cwd : CODE_BASE_PATH;
+    let resolvedCwd: string;
+    try {
+      resolvedCwd = await fs.realpath(path.resolve(desiredCwd));
+    } catch {
+      return NextResponse.json(
+        { error: 'Invalid working directory' },
+        { status: 400 }
+      );
+    }
+
+    const baseReal = await fs.realpath(CODE_BASE_PATH);
+    if (resolvedCwd !== baseReal && !resolvedCwd.startsWith(baseReal + path.sep)) {
+      return NextResponse.json(
+        { error: 'Invalid working directory' },
+        { status: 403 }
+      );
+    }
+
     const result = await new Promise<CommandResult>((resolve) => {
       exec(
         command,
         {
-          cwd: cwd || process.cwd(),
+          cwd: resolvedCwd,
           maxBuffer: 1024 * 1024 * 10, // 10MB
           timeout: 60000, // 1 minute timeout
           env: {
             ...process.env,
             TERM: 'xterm-256color',
```

### 2) Validate README path under CODE_BASE_PATH
```diff
diff --git a/app/api/projects/readme/route.ts b/app/api/projects/readme/route.ts
--- a/app/api/projects/readme/route.ts
+++ b/app/api/projects/readme/route.ts
@@
 export const dynamic = 'force-dynamic';
 
 const README_FILES = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];
+const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
+
+async function resolveProjectPath(inputPath: string): Promise<string | null> {
+  try {
+    const baseReal = await fs.realpath(CODE_BASE_PATH);
+    const targetReal = await fs.realpath(path.resolve(inputPath));
+    if (targetReal === baseReal || targetReal.startsWith(baseReal + path.sep)) {
+      return targetReal;
+    }
+  } catch {
+    return null;
+  }
+  return null;
+}
 
 export async function GET(request: Request) {
   const { searchParams } = new URL(request.url);
   const projectPath = searchParams.get('path');
@@
   if (!projectPath) {
     return NextResponse.json(
       { error: 'Path is required' },
       { status: 400 }
     );
   }
 
+  const safeProjectPath = await resolveProjectPath(projectPath);
+  if (!safeProjectPath) {
+    return NextResponse.json(
+      { error: 'Invalid path' },
+      { status: 403 }
+    );
+  }
+
   try {
     for (const filename of README_FILES) {
-      const filePath = path.join(projectPath, filename);
+      const filePath = path.join(safeProjectPath, filename);
```

### 3) Validate move source and status
```diff
diff --git a/app/api/actions/move/route.ts b/app/api/actions/move/route.ts
--- a/app/api/actions/move/route.ts
+++ b/app/api/actions/move/route.ts
@@
 const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
 
 const STATUS_FOLDERS: Record<ProjectStatus, string | null> = {
   active: null, // Root level
   crawlers: '_crawlers',
   icebox: '_icebox',
   archived: '_old',
 };
+
+const VALID_STATUSES: ProjectStatus[] = ['active', 'crawlers', 'icebox', 'archived'];
 
 export async function POST(request: Request) {
   try {
     const { slug, projectPath, newStatus } = await request.json();
 
     if (!slug || !projectPath || !newStatus) {
       return NextResponse.json(
         { error: 'Missing required fields' },
         { status: 400 }
       );
     }
 
-    const projectName = path.basename(projectPath);
+    if (typeof newStatus !== 'string' || !VALID_STATUSES.includes(newStatus as ProjectStatus)) {
+      return NextResponse.json(
+        { error: 'Invalid status' },
+        { status: 400 }
+      );
+    }
+
+    let sourceReal: string;
+    let baseReal: string;
+    try {
+      baseReal = await fs.realpath(CODE_BASE_PATH);
+      sourceReal = await fs.realpath(path.resolve(projectPath));
+      const stats = await fs.stat(sourceReal);
+      if (!stats.isDirectory()) {
+        return NextResponse.json(
+          { error: 'Project path must be a directory' },
+          { status: 400 }
+        );
+      }
+    } catch {
+      return NextResponse.json(
+        { error: 'Invalid project path' },
+        { status: 404 }
+      );
+    }
+
+    if (sourceReal === baseReal || !sourceReal.startsWith(baseReal + path.sep)) {
+      return NextResponse.json(
+        { error: 'Invalid project path' },
+        { status: 403 }
+      );
+    }
+
+    const projectName = path.basename(sourceReal);
+    const typedStatus = newStatus as ProjectStatus;
 
     // Determine target directory
-    const statusFolder = STATUS_FOLDERS[newStatus as ProjectStatus];
+    const statusFolder = STATUS_FOLDERS[typedStatus];
     const targetDir = statusFolder
       ? path.join(CODE_BASE_PATH, statusFolder)
       : CODE_BASE_PATH;
@@
-    await fs.rename(projectPath, targetPath);
+    await fs.rename(sourceReal, targetPath);
 
     // Update metadata
-    await setProjectMetadata(slug, { status: newStatus as ProjectStatus });
+    await setProjectMetadata(slug, { status: typedStatus });
```

### 4) Harden file reads with realpath + file type check
```diff
diff --git a/app/api/file/route.ts b/app/api/file/route.ts
--- a/app/api/file/route.ts
+++ b/app/api/file/route.ts
@@
   if (!filePath || typeof filePath !== 'string') {
     return NextResponse.json(
       { error: 'Path is required' },
       { status: 400 }
     );
   }
 
-  // Security: Resolve path to prevent traversal attacks (e.g., ../../etc/passwd)
-  const resolvedPath = path.resolve(filePath);
-  if (!resolvedPath.startsWith(CODE_BASE_PATH + '/')) {
+  let resolvedPath: string;
+  let baseReal: string;
+  try {
+    baseReal = await fs.realpath(CODE_BASE_PATH);
+    resolvedPath = await fs.realpath(path.resolve(filePath));
+  } catch {
     return NextResponse.json(
       { error: 'Invalid path' },
-      { status: 403 }
+      { status: 404 }
     );
   }
 
+  if (resolvedPath !== baseReal && !resolvedPath.startsWith(baseReal + path.sep)) {
+    return NextResponse.json(
+      { error: 'Invalid path' },
+      { status: 403 }
+    );
+  }
+
   try {
+    const stats = await fs.stat(resolvedPath);
+    if (!stats.isFile()) {
+      return NextResponse.json(
+        { error: 'Invalid path' },
+        { status: 400 }
+      );
+    }
     const content = await fs.readFile(resolvedPath, 'utf-8');
     return NextResponse.json({ content });
```

### 5) Validate PATCH metadata inputs
```diff
diff --git a/app/api/projects/[slug]/route.ts b/app/api/projects/[slug]/route.ts
--- a/app/api/projects/[slug]/route.ts
+++ b/app/api/projects/[slug]/route.ts
@@
-import { getProjectMetadata, setProjectMetadata } from '@/lib/config';
-import { ProjectMetadata } from '@/lib/types';
+import { getProjectMetadata, setProjectMetadata } from '@/lib/config';
+import { ProjectMetadata, ProjectStatus } from '@/lib/types';
 
 export const dynamic = 'force-dynamic';
 
+const VALID_STATUSES: ProjectStatus[] = ['active', 'crawlers', 'icebox', 'archived'];
+
@@
   try {
     const body = await request.json();
     const metadata: Partial<ProjectMetadata> = {};
 
-    if (body.status) metadata.status = body.status;
-    if (body.customName !== undefined) metadata.customName = body.customName;
-    if (body.customDescription !== undefined) metadata.customDescription = body.customDescription;
-    if (body.tags !== undefined) metadata.tags = body.tags;
-    if (body.notes !== undefined) metadata.notes = body.notes;
+    if (body.status !== undefined) {
+      if (!VALID_STATUSES.includes(body.status)) {
+        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
+      }
+      metadata.status = body.status;
+    }
+    if (body.customName !== undefined) {
+      if (typeof body.customName !== 'string') {
+        return NextResponse.json({ error: 'Invalid customName' }, { status: 400 });
+      }
+      metadata.customName = body.customName;
+    }
+    if (body.customDescription !== undefined) {
+      if (typeof body.customDescription !== 'string') {
+        return NextResponse.json({ error: 'Invalid customDescription' }, { status: 400 });
+      }
+      metadata.customDescription = body.customDescription;
+    }
+    if (body.tags !== undefined) {
+      if (!Array.isArray(body.tags) || !body.tags.every((tag: unknown) => typeof tag === 'string')) {
+        return NextResponse.json({ error: 'Invalid tags' }, { status: 400 });
+      }
+      metadata.tags = body.tags;
+    }
+    if (body.notes !== undefined) {
+      if (typeof body.notes !== 'string') {
+        return NextResponse.json({ error: 'Invalid notes' }, { status: 400 });
+      }
+      metadata.notes = body.notes;
+    }
```

## Additional Recommendations (non-diff)
- Add an auth/CSRF strategy for sensitive routes (`/api/terminal`, `/api/actions/*`, `/api/file`, `/api/projects/readme`) if the app can be accessed by anything other than localhost.
- Consider moving `CODE_BASE_PATH` to an environment variable and reusing it via a shared module.
- Align `eslint-config-next` with the installed Next.js major version.

## Tests
- Not run (static review only).
