Date Created: 2026-01-25 11:27:05 +0100
Date Updated: 2026-01-28
TOTAL_SCORE: 60/100

---

## FIXED ITEMS (Removed from Report)

The following issues have been fixed:
- Terminal API security (execFile + whitelist + cwd validation)
- README API path traversal (path validation added)
- Move API path/status validation (source path + status validation added)
- Slug trailing dashes (strip leading/trailing dashes)
- Git worktree .git file handling (parse gitdir pointer)

## AUDIT
Issue: /api/terminal allows arbitrary command execution from the client (RCE). Restrict usage to an allowlist, require explicit enablement/token, validate cwd, and avoid shell execution.
```diff
diff --git a/app/api/terminal/route.ts b/app/api/terminal/route.ts
index 7c3a1f2..e1b2c3d 100644
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@
-import { NextResponse } from 'next/server';
-import { exec } from 'child_process';
+import { NextResponse } from 'next/server';
+import { execFile } from 'child_process';
+import path from 'path';
 
 export const dynamic = 'force-dynamic';
 
+const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
+const ALLOWED_COMMANDS = new Set(['ls', 'pwd', 'git', 'rg', 'npm', 'pnpm', 'yarn']);
+const TERMINAL_ENABLED = process.env.TERMINAL_ENABLED === 'true';
+const TERMINAL_TOKEN = process.env.TERMINAL_TOKEN;
+
+function resolveCwd(cwd?: string): string | null {
+  const resolved = path.resolve(cwd || process.cwd());
+  if (resolved === CODE_BASE_PATH || resolved.startsWith(CODE_BASE_PATH + path.sep)) {
+    return resolved;
+  }
+  return null;
+}
+
 interface CommandResult {
   stdout: string;
   stderr: string;
   exitCode: number;
 }
 
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
+    if (TERMINAL_TOKEN) {
+      const token = request.headers.get('x-terminal-token');
+      if (token !== TERMINAL_TOKEN) {
+        return NextResponse.json(
+          { error: 'Unauthorized' },
+          { status: 401 }
+        );
+      }
+    }
+
+    if (!command || typeof command !== 'string') {
       return NextResponse.json(
         { error: 'Command is required' },
         { status: 400 }
       );
     }
+
+    const [bin, ...args] = command.trim().split(/\s+/);
+    if (!bin || !ALLOWED_COMMANDS.has(bin)) {
+      return NextResponse.json(
+        { error: 'Command is not allowed' },
+        { status: 400 }
+      );
+    }
+
+    const resolvedCwd = resolveCwd(cwd);
+    if (!resolvedCwd) {
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
           resolve({
             stdout: stdout || '',
             stderr: stderr || '',
-            exitCode: error?.code || 0,
+            exitCode: typeof error?.code === 'number' ? error.code : 0,
           });
         }
       );
     });
```

Issue: /api/projects/readme accepts arbitrary paths, enabling path traversal and data exposure outside the repo.
```diff
diff --git a/app/api/projects/readme/route.ts b/app/api/projects/readme/route.ts
index 2e0d5e9..b87c2a1 100644
--- a/app/api/projects/readme/route.ts
+++ b/app/api/projects/readme/route.ts
@@
 const README_FILES = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];
+const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
+
+function isAllowedPath(targetPath: string): boolean {
+  return targetPath === CODE_BASE_PATH || targetPath.startsWith(CODE_BASE_PATH + path.sep);
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
+
+  const resolvedProjectPath = path.resolve(projectPath);
+  if (!isAllowedPath(resolvedProjectPath)) {
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

Issue: /api/actions/move trusts user-supplied paths and status without validation, allowing arbitrary filesystem moves.
```diff
diff --git a/app/api/actions/move/route.ts b/app/api/actions/move/route.ts
index 9f9151f..4b8b5b4 100644
--- a/app/api/actions/move/route.ts
+++ b/app/api/actions/move/route.ts
@@
 const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
+
+const VALID_STATUSES: ProjectStatus[] = ['active', 'crawlers', 'icebox', 'archived'];
+
+function isValidStatus(status: string): status is ProjectStatus {
+  return VALID_STATUSES.includes(status as ProjectStatus);
+}
+
+function isAllowedPath(targetPath: string): boolean {
+  return targetPath === CODE_BASE_PATH || targetPath.startsWith(CODE_BASE_PATH + path.sep);
+}
 
 const STATUS_FOLDERS: Record<ProjectStatus, string | null> = {
   active: null, // Root level
   crawlers: '_crawlers',
@@
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
+    const resolvedPath = path.resolve(projectPath);
+    if (!isAllowedPath(resolvedPath)) {
+      return NextResponse.json(
+        { error: 'Invalid path' },
+        { status: 403 }
+      );
+    }
+
+    const stats = await fs.stat(resolvedPath);
+    if (!stats.isDirectory()) {
+      return NextResponse.json(
+        { error: 'Path must be a directory' },
+        { status: 400 }
+      );
+    }
 
-    const projectName = path.basename(projectPath);
+    const projectName = path.basename(resolvedPath);
@@
-    await fs.rename(projectPath, targetPath);
+    await fs.rename(resolvedPath, targetPath);
```

## TESTS
Proposed unit tests for core scanning helpers using Vitest (adds a minimal test runner + config).
```diff
diff --git a/package.json b/package.json
index f2c7d51..77b8c6b 100644
--- a/package.json
+++ b/package.json
@@
   "scripts": {
     "dev": "next dev",
     "build": "next build",
     "start": "next start",
-    "lint": "next lint"
+    "lint": "next lint",
+    "test": "vitest run"
   },
@@
   "devDependencies": {
     "@types/node": "^20",
     "@types/react": "^18",
     "@types/react-dom": "^18",
     "eslint": "^8",
     "eslint-config-next": "14.2.33",
     "postcss": "^8",
     "tailwindcss": "^3.4.1",
-    "typescript": "^5"
+    "typescript": "^5",
+    "vitest": "^1.6.0"
   }
 }

diff --git a/vitest.config.ts b/vitest.config.ts
new file mode 100644
index 0000000..4f7c9d1
--- /dev/null
+++ b/vitest.config.ts
@@
+import { defineConfig } from 'vitest/config';
+
+export default defineConfig({
+  test: {
+    environment: 'node',
+    include: ['tests/**/*.test.ts'],
+  },
+});

diff --git a/tests/scanner.test.ts b/tests/scanner.test.ts
new file mode 100644
index 0000000..b3d2c86
--- /dev/null
+++ b/tests/scanner.test.ts
@@
+import { describe, it, expect } from 'vitest';
+import { promises as fs } from 'fs';
+import os from 'os';
+import path from 'path';
+import { detectTechStack, extractDescription, getVersion, scanBugs } from '../lib/scanner';
+
+async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
+  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-manage-'));
+  try {
+    return await fn(dir);
+  } finally {
+    await fs.rm(dir, { recursive: true, force: true });
+  }
+}
+
+async function writeJson(filePath: string, data: unknown): Promise<void> {
+  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
+}
+
+describe('scanner', () => {
+  it('detects tech stack from package.json dependencies', async () => {
+    await withTempDir(async (dir) => {
+      await writeJson(path.join(dir, 'package.json'), {
+        dependencies: { next: '1.0.0', react: '1.0.0' },
+        devDependencies: { typescript: '1.0.0', tailwindcss: '1.0.0' },
+      });
+
+      const techs = await detectTechStack(dir);
+      expect(techs[0]).toBe('Next.js');
+      expect(techs).toContain('React');
+      expect(techs).toContain('Tailwind');
+      expect(techs).toContain('TypeScript');
+    });
+  });
+
+  it('prefers package.json description when present', async () => {
+    await withTempDir(async (dir) => {
+      await writeJson(path.join(dir, 'package.json'), {
+        description: 'Fast description.',
+      });
+
+      const description = await extractDescription(dir);
+      expect(description).toBe('Fast description.');
+    });
+  });
+
+  it('falls back to README first paragraph', async () => {
+    await withTempDir(async (dir) => {
+      const readme = [
+        '# Title',
+        '![badge](https://example.com/badge.svg)',
+        '',
+        'This is a test project.',
+        'It has two sentences.',
+        '',
+        '## Usage',
+      ].join('\n');
+      await fs.writeFile(path.join(dir, 'README.md'), readme, 'utf-8');
+
+      const description = await extractDescription(dir);
+      expect(description).toBe('This is a test project. It has two sentences.');
+    });
+  });
+
+  it('reads version from VERSION file', async () => {
+    await withTempDir(async (dir) => {
+      await fs.writeFile(path.join(dir, 'VERSION'), '1.2.3\n', 'utf-8');
+      const version = await getVersion(dir);
+      expect(version).toBe('1.2.3');
+    });
+  });
+
+  it('aggregates open and fixed bugs', async () => {
+    await withTempDir(async (dir) => {
+      const openDir = path.join(dir, '_bugs_open');
+      const fixedDir = path.join(dir, '_bugs_fixed');
+      await fs.mkdir(openDir, { recursive: true });
+      await fs.mkdir(fixedDir, { recursive: true });
+      await fs.writeFile(path.join(openDir, '2026-01-01-first.md'), '# First Bug\n', 'utf-8');
+      await fs.writeFile(path.join(fixedDir, '2026-01-02-second.md'), '# Second Bug\n', 'utf-8');
+
+      const bugs = await scanBugs(dir);
+      expect(bugs?.openCount).toBe(1);
+      expect(bugs?.fixedCount).toBe(1);
+      expect(bugs?.bugs[0].title).toBe('Second Bug');
+    });
+  });
+});
```

## FIXES
Issue: getGitInfo fails for worktrees/submodules where .git is a file pointing at a gitdir; branch/remote become undefined.
```diff
diff --git a/lib/scanner.ts b/lib/scanner.ts
index a11c1b8..b2f8d8d 100644
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
+
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
 
   let branch: string | undefined;
   let remote: string | undefined;
 
   // Read current branch from HEAD
-  const headContent = await readTextFile(path.join(gitPath, 'HEAD'));
+  const headContent = await readTextFile(path.join(gitDir, 'HEAD'));
@@
-  const configContent = await readTextFile(path.join(gitPath, 'config'));
+  const configContent = await readTextFile(path.join(gitDir, 'config'));
```

Issue: slug generation can leave leading/trailing dashes, producing unstable URLs for names with punctuation.
```diff
diff --git a/lib/scanner.ts b/lib/scanner.ts
index a11c1b8..c53b29f 100644
--- a/lib/scanner.ts
+++ b/lib/scanner.ts
@@
-  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
+  const slug = name
+    .toLowerCase()
+    .replace(/[^a-z0-9]+/g, '-')
+    .replace(/^-+|-+$/g, '');
```

Issue: project metadata PATCH accepts invalid status values without validation.
```diff
diff --git a/app/api/projects/[slug]/route.ts b/app/api/projects/[slug]/route.ts
index 3f8a1f0..c9bfc4a 100644
--- a/app/api/projects/[slug]/route.ts
+++ b/app/api/projects/[slug]/route.ts
@@
-import { ProjectMetadata } from '@/lib/types';
+import { ProjectMetadata, ProjectStatus } from '@/lib/types';
@@
 export const dynamic = 'force-dynamic';
+
+const VALID_STATUSES: ProjectStatus[] = ['active', 'crawlers', 'icebox', 'archived'];
+
+function isValidStatus(status: string): status is ProjectStatus {
+  return VALID_STATUSES.includes(status as ProjectStatus);
+}
@@
-    if (body.status) metadata.status = body.status;
+    if (body.status) {
+      if (!isValidStatus(body.status)) {
+        return NextResponse.json(
+          { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
+          { status: 400 }
+        );
+      }
+      metadata.status = body.status;
+    }
```

## REFACTOR
- Centralize CODE_BASE_PATH and path-allow checks in a shared utility (and read from env) to remove duplicated path logic in API routes.
- Add schema validation (zod or valibot) for request bodies and config file contents to prevent silent bad data.
- Cache scanAllProjects results with a short TTL to avoid repeated disk scans per request; consider background refresh.
- Move scanner-related constants (ignored folders, status folders) into a single config module for easier tuning/testing.
