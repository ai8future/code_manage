Date Created: 2026-01-25 00:04:48 +0100
TOTAL_SCORE: 66/100

**Findings**
- Critical: `app/api/terminal/route.ts` executes arbitrary shell commands with no feature gate or cwd validation, making RCE possible if the app is exposed.
- High: `app/api/actions/move/route.ts` trusts `projectPath` and `newStatus`, allowing arbitrary filesystem moves and invalid status writes.
- High: `app/api/projects/readme/route.ts` accepts any path without base-dir validation, enabling unintended README reads outside the code base.
- Medium: `lib/scanner.ts` fails to read git info in worktrees/submodules because it assumes `.git` is a directory.
- Medium: `components/dashboard/CodeHealthSection.tsx` double-counts projects with grade 0 as “without grades.”
- Low: Crawlers status is inconsistently supported in the UI (settings count, default status, move menu, header badge).

**Fixes Applied (Patch-Ready Diffs Only)**
- Terminal hardening: add opt-in env guard, restrict cwd to the code base, and return non-zero exit codes on errors.
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
 
 export const dynamic = 'force-dynamic';
+const CODE_BASE_PATH = getCodeBasePath();
+const TERMINAL_ENABLED = process.env.CODE_MANAGE_ALLOW_TERMINAL === '1';
@@
 export async function POST(request: Request) {
   try {
     const { command, cwd } = await request.json();
 
-    if (!command) {
+    if (!TERMINAL_ENABLED) {
+      return NextResponse.json(
+        { error: 'Terminal is disabled' },
+        { status: 403 }
+      );
+    }
+
+    if (typeof command !== 'string' || !command.trim()) {
       return NextResponse.json(
         { error: 'Command is required' },
         { status: 400 }
       );
     }
+
+    const cwdInput = typeof cwd === 'string' && cwd.trim() ? cwd : CODE_BASE_PATH;
+    const resolvedCwd = path.resolve(cwdInput);
+    if (!resolvedCwd.startsWith(CODE_BASE_PATH + path.sep) && resolvedCwd !== CODE_BASE_PATH) {
+      return NextResponse.json(
+        { error: 'Invalid working directory' },
+        { status: 403 }
+      );
+    }
 
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
             FORCE_COLOR: '1',
           },
         },
         (error, stdout, stderr) => {
+          const exitCode = typeof error?.code === 'number'
+            ? error.code
+            : error
+            ? 1
+            : 0;
           resolve({
             stdout: stdout || '',
             stderr: stderr || '',
-            exitCode: error?.code || 0,
+            exitCode,
           });
         }
       );
     });
```

- README path validation: constrain reads to the code base.
```diff
diff --git a/app/api/projects/readme/route.ts b/app/api/projects/readme/route.ts
--- a/app/api/projects/readme/route.ts
+++ b/app/api/projects/readme/route.ts
@@
 import { NextResponse } from 'next/server';
 import { promises as fs } from 'fs';
 import path from 'path';
+import { getCodeBasePath } from '@/lib/scanner';
 
 export const dynamic = 'force-dynamic';
 
 const README_FILES = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];
+const CODE_BASE_PATH = getCodeBasePath();
@@
   if (!projectPath) {
     return NextResponse.json(
       { error: 'Path is required' },
       { status: 400 }
     );
   }
 
   try {
+    const resolvedPath = path.resolve(projectPath);
+    if (!resolvedPath.startsWith(CODE_BASE_PATH + path.sep) && resolvedPath !== CODE_BASE_PATH) {
+      return NextResponse.json(
+        { error: 'Invalid path' },
+        { status: 403 }
+      );
+    }
+
     for (const filename of README_FILES) {
-      const filePath = path.join(projectPath, filename);
+      const filePath = path.join(resolvedPath, filename);
       try {
         const content = await fs.readFile(filePath, 'utf-8');
         return NextResponse.json({ content, filename });
       } catch {
         // File doesn't exist, try next one
```

- Move validation: validate status, restrict projectPath to the code base, and enforce directories.
```diff
diff --git a/app/api/actions/move/route.ts b/app/api/actions/move/route.ts
--- a/app/api/actions/move/route.ts
+++ b/app/api/actions/move/route.ts
@@
 import { NextResponse } from 'next/server';
 import { promises as fs } from 'fs';
 import path from 'path';
 import { ProjectStatus } from '@/lib/types';
 import { setProjectMetadata } from '@/lib/config';
+import { getCodeBasePath } from '@/lib/scanner';
 
-const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
+const CODE_BASE_PATH = getCodeBasePath();
@@
   try {
     const { slug, projectPath, newStatus } = await request.json();
 
     if (!slug || !projectPath || !newStatus) {
       return NextResponse.json(
         { error: 'Missing required fields' },
         { status: 400 }
       );
     }
 
-    const projectName = path.basename(projectPath);
+    if (typeof newStatus !== 'string' || !(newStatus in STATUS_FOLDERS)) {
+      return NextResponse.json(
+        { error: 'Invalid status' },
+        { status: 400 }
+      );
+    }
+
+    const resolvedProjectPath = path.resolve(projectPath);
+    if (
+      !resolvedProjectPath.startsWith(CODE_BASE_PATH + path.sep) ||
+      resolvedProjectPath === CODE_BASE_PATH
+    ) {
+      return NextResponse.json(
+        { error: 'Invalid project path' },
+        { status: 403 }
+      );
+    }
+
+    let projectStats;
+    try {
+      projectStats = await fs.stat(resolvedProjectPath);
+    } catch {
+      return NextResponse.json(
+        { error: 'Project not found' },
+        { status: 404 }
+      );
+    }
+
+    if (!projectStats.isDirectory()) {
+      return NextResponse.json(
+        { error: 'Project path is not a directory' },
+        { status: 400 }
+      );
+    }
+
+    const projectName = path.basename(resolvedProjectPath);
@@
-    await fs.rename(projectPath, targetPath);
+    await fs.rename(resolvedProjectPath, targetPath);
```

- Git worktree support: resolve `.git` file pointers before reading HEAD/config.
```diff
diff --git a/lib/scanner.ts b/lib/scanner.ts
--- a/lib/scanner.ts
+++ b/lib/scanner.ts
@@
 export async function getGitInfo(projectPath: string): Promise<{
   hasGit: boolean;
   branch?: string;
   remote?: string;
 }> {
   const gitPath = path.join(projectPath, '.git');
   if (!(await fileExists(gitPath))) {
     return { hasGit: false };
   }
 
+  let gitDir = gitPath;
+  try {
+    const gitStat = await fs.stat(gitPath);
+    if (gitStat.isFile()) {
+      const gitFile = await readTextFile(gitPath);
+      const match = gitFile?.match(/^gitdir:\s*(.+)\s*$/m);
+      if (match) {
+        gitDir = path.resolve(projectPath, match[1].trim());
+      }
+    }
+  } catch {
+    return { hasGit: false };
+  }
+
+  if (!(await fileExists(gitDir))) {
+    return { hasGit: false };
+  }
+
   let branch: string | undefined;
   let remote: string | undefined;
 
   // Read current branch from HEAD
-  const headContent = await readTextFile(path.join(gitPath, 'HEAD'));
+  const headContent = await readTextFile(path.join(gitDir, 'HEAD'));
@@
-  const configContent = await readTextFile(path.join(gitPath, 'config'));
+  const configContent = await readTextFile(path.join(gitDir, 'config'));
```

- Grade counting bug: ensure grade 0 is treated as a real grade, not “missing.”
```diff
diff --git a/components/dashboard/CodeHealthSection.tsx b/components/dashboard/CodeHealthSection.tsx
--- a/components/dashboard/CodeHealthSection.tsx
+++ b/components/dashboard/CodeHealthSection.tsx
@@
-  const projectsWithoutGrades = projects.filter(p => !p.rcodegen?.latestGrade);
+  const projectsWithoutGrades = projects.filter(p => p.rcodegen?.latestGrade == null);
```

- Crawlers support in settings and counts.
```diff
diff --git a/components/settings/SettingsPanel.tsx b/components/settings/SettingsPanel.tsx
--- a/components/settings/SettingsPanel.tsx
+++ b/components/settings/SettingsPanel.tsx
@@
 interface Settings {
   sidebarCollapsed: boolean;
-  defaultStatus: 'active' | 'icebox' | 'archived';
+  defaultStatus: 'active' | 'crawlers' | 'icebox' | 'archived';
   terminalHeight: number;
 }
@@
         setProjectCount(
           (data.counts?.active || 0) +
+          (data.counts?.crawlers || 0) +
           (data.counts?.icebox || 0) +
           (data.counts?.archived || 0)
         );
@@
       setProjectCount(
         (data.counts?.active || 0) +
+        (data.counts?.crawlers || 0) +
         (data.counts?.icebox || 0) +
         (data.counts?.archived || 0)
       );
@@
             >
               <option value="active">Active</option>
+              <option value="crawlers">Crawlers</option>
               <option value="icebox">Icebox</option>
               <option value="archived">Archived</option>
             </select>
```

- Crawlers move option in ActionsMenu.
```diff
diff --git a/components/actions/ActionsMenu.tsx b/components/actions/ActionsMenu.tsx
--- a/components/actions/ActionsMenu.tsx
+++ b/components/actions/ActionsMenu.tsx
@@
   MoreVertical,
   ExternalLink,
   FolderOpen,
   Copy,
   Snowflake,
   Archive,
   FolderInput,
+  Bug,
 } from 'lucide-react';
@@
   const statusOptions: { status: ProjectStatus; label: string; icon: typeof FolderOpen }[] = [
     { status: 'active', label: 'Active', icon: FolderInput },
+    { status: 'crawlers', label: 'Crawlers', icon: Bug },
     { status: 'icebox', label: 'Icebox', icon: Snowflake },
     { status: 'archived', label: 'Archive', icon: Archive },
   ];
```

- Crawlers badge styling in the project header.
```diff
diff --git a/components/project/ProjectHeader.tsx b/components/project/ProjectHeader.tsx
--- a/components/project/ProjectHeader.tsx
+++ b/components/project/ProjectHeader.tsx
@@
           px-2 py-1 rounded text-xs font-medium capitalize
           ${project.status === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : ''}
+          ${project.status === 'crawlers' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' : ''}
           ${project.status === 'icebox' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : ''}
           ${project.status === 'archived' ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' : ''}
         `}>
```

**Notes**
- No code changes were applied; diffs are ready to patch.
- Terminal access is now opt-in via `CODE_MANAGE_ALLOW_TERMINAL=1` in the patch.
