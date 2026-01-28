# Security & Bug Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical security vulnerabilities and bugs identified across multiple code audits (Claude, Codex, Gemini)

**Architecture:** Add path validation to API routes, secure terminal with command whitelist, fix React hook dependencies

**Tech Stack:** Next.js 16, TypeScript, Node.js child_process

---

## Summary of Fixes

| # | Fix | Priority | Reports |
|---|-----|----------|---------|
| 1 | Terminal API: command injection | CRITICAL | All 6 |
| 2 | README API: path traversal | HIGH | Claude, Codex, Gemini |
| 3 | Move API: path validation | HIGH | Claude, Codex |
| 4 | File API: symlink bypass | MEDIUM | Claude-quick, Codex |
| 5 | Scanner: slug trailing dashes | LOW | Codex-quick |
| 6 | Scanner: worktree .git handling | LOW | Codex-quick |

---

## Task 1: Secure Terminal API (CRITICAL)

**Files:**
- Modify: `app/api/terminal/route.ts`

**Step 1: Add imports and constants**

Add path import and security constants at the top of the file:

```typescript
import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import { CODE_BASE_PATH } from '@/lib/constants';

export const dynamic = 'force-dynamic';

// Whitelist of allowed commands
const ALLOWED_COMMANDS = new Set([
  'ls', 'pwd', 'cat', 'head', 'tail', 'wc',
  'git', 'npm', 'npx', 'yarn', 'pnpm', 'node',
  'grep', 'find', 'echo', 'date', 'which'
]);
```

**Step 2: Replace the POST handler**

Replace the entire POST function with secure version:

```typescript
interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function POST(request: Request) {
  try {
    const { command, cwd } = await request.json();

    if (!command || typeof command !== 'string' || !command.trim()) {
      return NextResponse.json(
        { error: 'Command is required' },
        { status: 400 }
      );
    }

    // Validate cwd is within allowed directory
    const resolvedCwd = path.resolve(cwd || CODE_BASE_PATH);
    if (!resolvedCwd.startsWith(CODE_BASE_PATH + '/') && resolvedCwd !== CODE_BASE_PATH) {
      return NextResponse.json(
        { error: 'Invalid working directory' },
        { status: 403 }
      );
    }

    // Parse command and validate base command against whitelist
    const parts = command.trim().split(/\s+/);
    const baseCommand = parts[0];
    const args = parts.slice(1);

    if (!ALLOWED_COMMANDS.has(baseCommand)) {
      return NextResponse.json(
        { error: `Command '${baseCommand}' is not allowed` },
        { status: 403 }
      );
    }

    const result = await new Promise<CommandResult>((resolve) => {
      execFile(
        baseCommand,
        args,
        {
          cwd: resolvedCwd,
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
            exitCode: typeof error?.code === 'number' ? error.code : (error ? 1 : 0),
          });
        }
      );
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Terminal error:', error);
    return NextResponse.json(
      { error: 'Failed to execute command' },
      { status: 500 }
    );
  }
}
```

**Step 3: Verify build**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add app/api/terminal/route.ts
git commit -m "security: fix command injection in terminal API

- Switch from exec() to execFile() to prevent shell injection
- Add command whitelist (ls, git, npm, etc.)
- Validate cwd is within CODE_BASE_PATH
- Fix exit code extraction (was using error.code incorrectly)"
```

---

## Task 2: Add Path Validation to README API (HIGH)

**Files:**
- Modify: `app/api/projects/readme/route.ts`

**Step 1: Add imports and path validation**

```typescript
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CODE_BASE_PATH } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const README_FILES = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get('path');

  if (!projectPath) {
    return NextResponse.json(
      { error: 'Path is required' },
      { status: 400 }
    );
  }

  // Security: Validate path is within allowed directory
  const resolvedPath = path.resolve(projectPath);
  if (!resolvedPath.startsWith(CODE_BASE_PATH + '/') && resolvedPath !== CODE_BASE_PATH) {
    return NextResponse.json(
      { error: 'Invalid path' },
      { status: 403 }
    );
  }

  try {
    for (const filename of README_FILES) {
      const filePath = path.join(resolvedPath, filename);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        return NextResponse.json({ content, filename });
      } catch {
        // File doesn't exist, try next one
      }
    }

    return NextResponse.json(
      { error: 'README not found' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error reading README:', error);
    return NextResponse.json(
      { error: 'Failed to read README' },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add app/api/projects/readme/route.ts
git commit -m "security: add path validation to README API

- Import CODE_BASE_PATH from constants
- Validate resolved path is within allowed directory
- Prevents path traversal attacks"
```

---

## Task 3: Add Source Path Validation to Move API (HIGH)

**Files:**
- Modify: `app/api/actions/move/route.ts`

**Step 1: Add path validation after input check**

After the "Missing required fields" check, add source path validation:

```typescript
    // Security: Validate source path is within allowed directory
    const resolvedSourcePath = path.resolve(projectPath);
    if (!resolvedSourcePath.startsWith(CODE_BASE_PATH + '/')) {
      return NextResponse.json(
        { error: 'Invalid source path' },
        { status: 403 }
      );
    }

    // Validate newStatus is a valid status
    if (!STATUS_FOLDERS.hasOwnProperty(newStatus)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    const projectName = path.basename(resolvedSourcePath);
```

And update the rename call to use resolvedSourcePath:

```typescript
    // Move the project
    await fs.rename(resolvedSourcePath, targetPath);
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add app/api/actions/move/route.ts
git commit -m "security: add path validation to move API

- Validate source path is within CODE_BASE_PATH
- Validate newStatus is a valid ProjectStatus
- Use resolved path for rename operation"
```

---

## Task 4: Fix Symlink Bypass in File API (MEDIUM)

**Files:**
- Modify: `app/api/file/route.ts`

**Step 1: Add realpath check after path validation**

```typescript
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CODE_BASE_PATH } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');

  if (!filePath || typeof filePath !== 'string') {
    return NextResponse.json(
      { error: 'Path is required' },
      { status: 400 }
    );
  }

  // Security: Resolve path to prevent traversal attacks (e.g., ../../etc/passwd)
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(CODE_BASE_PATH + '/')) {
    return NextResponse.json(
      { error: 'Invalid path' },
      { status: 403 }
    );
  }

  // Security: Check real path to prevent symlink attacks
  try {
    const realPath = await fs.realpath(resolvedPath);
    if (!realPath.startsWith(CODE_BASE_PATH + '/') && realPath !== CODE_BASE_PATH) {
      return NextResponse.json(
        { error: 'Invalid path: symlink outside allowed directory' },
        { status: 403 }
      );
    }
  } catch {
    // File doesn't exist - will fail on read anyway
  }

  try {
    const content = await fs.readFile(resolvedPath, 'utf-8');
    return NextResponse.json({ content });
  } catch (error) {
    console.error('Error reading file:', error);
    return NextResponse.json(
      { error: 'Failed to read file' },
      { status: 404 }
    );
  }
}
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add app/api/file/route.ts
git commit -m "security: prevent symlink bypass in file API

- Add realpath check after path validation
- Rejects symlinks that point outside CODE_BASE_PATH"
```

---

## Task 5: Fix Slug Trailing Dashes (LOW)

**Files:**
- Modify: `lib/scanner.ts:500` (approximate line in scanProject)

**Step 1: Find and update slug generation**

Find:
```typescript
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
```

Replace with:
```typescript
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add lib/scanner.ts
git commit -m "fix: remove trailing dashes from project slugs

- Prevents unstable URLs for projects with punctuation in names"
```

---

## Task 6: Fix Worktree .git File Handling (LOW)

**Files:**
- Modify: `lib/scanner.ts` (getGitInfo function)

**Step 1: Update getGitInfo to handle .git files (worktrees)**

Find the getGitInfo function and update it:

```typescript
export async function getGitInfo(projectPath: string): Promise<{
  hasGit: boolean;
  branch?: string;
  remote?: string;
}> {
  const gitPath = path.join(projectPath, '.git');
  if (!(await fileExists(gitPath))) {
    return { hasGit: false };
  }

  // Handle worktrees/submodules where .git is a file pointing to gitdir
  let gitDir = gitPath;
  try {
    const gitStat = await fs.stat(gitPath);
    if (gitStat.isFile()) {
      const gitFile = await readTextFile(gitPath);
      const match = gitFile?.match(/^gitdir:\s*(.+)\s*$/m);
      if (match) {
        gitDir = path.resolve(projectPath, match[1].trim());
      }
    }
  } catch {
    return { hasGit: false };
  }

  let branch: string | undefined;
  let remote: string | undefined;

  // Read current branch from HEAD
  const headContent = await readTextFile(path.join(gitDir, 'HEAD'));
  if (headContent) {
    const match = headContent.match(/ref: refs\/heads\/(.+)/);
    if (match) {
      branch = match[1].trim();
    }
  }

  // Read remote URL
  const configContent = await readTextFile(path.join(gitDir, 'config'));
  if (configContent) {
    const remoteMatch = configContent.match(/\[remote "origin"\][^\[]*url\s*=\s*(.+)/);
    if (remoteMatch) {
      remote = remoteMatch[1].trim();
    }
  }

  return { hasGit: true, branch, remote };
}
```

**Step 2: Verify build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add lib/scanner.ts
git commit -m "fix: handle git worktrees where .git is a file

- Parse gitdir pointer from .git file
- Resolve actual git directory for worktrees/submodules"
```

---

## Verification

After all tasks:

1. Run `npm run build` - ensure no TypeScript errors
2. Run `npm run dev` - verify app starts
3. Test terminal with allowed command: `ls -la`
4. Test terminal with blocked command: `rm -rf /` (should fail)
5. Verify README loads for valid project
6. Verify move works for valid source paths

---

## Updating Reports

After completing fixes, update the rcodegen reports by:

1. Removing fixed items from each report
2. Adding "Date Updated: 2026-01-28" below "Date Created"
3. Reports to update:
   - `code_manage-claude-audit-2026-01-28_141316.md`
   - `code_manage-claude-fix-2026-01-28_142001.md`
   - `code_manage-claude-quick-2026-01-28_165430.md`
   - `code_manage-codex-audit-20260125-110019.md`
   - `code_manage-codex-fix-2026-01-25_111527.md`
   - `code_manage-codex-quick-2026-01-25_112333.md`
