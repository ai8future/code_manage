# Security and Bug Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix security vulnerabilities in API routes and resolve React hook dependency issues

**Architecture:** Add path validation to all API endpoints accepting file paths, implement command whitelisting for terminal API, and fix React hook dependency arrays to prevent stale closures.

**Tech Stack:** Next.js 16, TypeScript, Node.js child_process

---

## Task 1: Fix Terminal API Command Injection (CRITICAL)

**Files:**
- Modify: `app/api/terminal/route.ts:1-54`

**Step 1: Add imports and constants**

Add path import, CODE_BASE_PATH constant, and ALLOWED_COMMANDS whitelist at the top of the file.

```typescript
import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import { CODE_BASE_PATH } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const ALLOWED_COMMANDS = ['ls', 'git', 'npm', 'yarn', 'pnpm', 'cat', 'head', 'tail', 'pwd', 'echo', 'node', 'python3', 'pip', 'which', 'env'];
```

**Step 2: Add cwd validation**

After the command check, add working directory validation:

```typescript
// Validate cwd is within allowed directory
const resolvedCwd = path.resolve(cwd || CODE_BASE_PATH);
if (!resolvedCwd.startsWith(CODE_BASE_PATH + '/') && resolvedCwd !== CODE_BASE_PATH) {
  return NextResponse.json(
    { error: 'Invalid working directory' },
    { status: 403 }
  );
}
```

**Step 3: Add command whitelist validation**

Parse the command and validate against whitelist:

```typescript
// Parse command and validate base command
const parts = command.trim().split(/\s+/);
const baseCommand = parts[0];

if (!ALLOWED_COMMANDS.includes(baseCommand)) {
  return NextResponse.json(
    { error: `Command '${baseCommand}' is not allowed` },
    { status: 403 }
  );
}
```

**Step 4: Switch from exec to execFile**

Replace exec() with execFile() for safer command execution:

```typescript
const result = await new Promise<CommandResult>((resolve) => {
  execFile(
    baseCommand,
    parts.slice(1),
    {
      cwd: resolvedCwd,
      maxBuffer: 1024 * 1024 * 10,
      timeout: 60000,
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
        exitCode: error?.code || 0,
      });
    }
  );
});
```

**Step 5: Verify**

Run: `npm run build`

---

## Task 2: Fix Move API Path Validation (HIGH)

**Files:**
- Modify: `app/api/actions/move/route.ts:8-20`

**Step 1: Add path validation after field check**

Insert path validation code after the missing fields check:

```typescript
// Security: Validate source path is within allowed directory
const resolvedSourcePath = path.resolve(projectPath);
if (!resolvedSourcePath.startsWith(CODE_BASE_PATH + '/') && resolvedSourcePath !== CODE_BASE_PATH) {
  return NextResponse.json(
    { error: 'Invalid source path' },
    { status: 403 }
  );
}

// Validate newStatus is a known status
if (!Object.prototype.hasOwnProperty.call(STATUS_FOLDERS, newStatus)) {
  return NextResponse.json(
    { error: 'Invalid status' },
    { status: 400 }
  );
}
```

**Step 2: Update projectName to use resolved path**

Change:
```typescript
const projectName = path.basename(projectPath);
```
To:
```typescript
const projectName = path.basename(resolvedSourcePath);
```

**Step 3: Update rename call to use resolved path**

Change:
```typescript
await fs.rename(projectPath, targetPath);
```
To:
```typescript
await fs.rename(resolvedSourcePath, targetPath);
```

**Step 4: Verify**

Run: `npm run build`

---

## Task 3: Fix README API Path Traversal (HIGH)

**Files:**
- Modify: `app/api/projects/readme/route.ts:1-42`

**Step 1: Add imports and constants**

Update imports to include CODE_BASE_PATH:

```typescript
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CODE_BASE_PATH } from '@/lib/constants';
```

**Step 2: Add path validation after the path check**

After the `if (!projectPath)` block, add:

```typescript
// Security: Validate path is within allowed directory
const resolvedProjectPath = path.resolve(projectPath);
if (!resolvedProjectPath.startsWith(CODE_BASE_PATH + '/') && resolvedProjectPath !== CODE_BASE_PATH) {
  return NextResponse.json(
    { error: 'Invalid path' },
    { status: 403 }
  );
}
```

**Step 3: Update file path construction**

Change:
```typescript
const filePath = path.join(projectPath, filename);
```
To:
```typescript
const filePath = path.join(resolvedProjectPath, filename);
```

**Step 4: Verify**

Run: `npm run build`

---

## Task 4: Fix React Hook Dependencies in Project Page (MEDIUM)

**Files:**
- Modify: `app/project/[slug]/page.tsx:1-45`

**Step 1: Add useCallback import**

Change:
```typescript
import { useEffect, useState } from 'react';
```
To:
```typescript
import { useEffect, useState, useCallback } from 'react';
```

**Step 2: Wrap fetchProject with useCallback**

Change:
```typescript
const fetchProject = async () => {
```
To:
```typescript
const fetchProject = useCallback(async () => {
```

And close with:
```typescript
}, [slug]);
```

**Step 3: Update useEffect dependency array**

Change:
```typescript
useEffect(() => {
  fetchProject();
}, [slug]);
```
To:
```typescript
useEffect(() => {
  fetchProject();
}, [fetchProject]);
```

**Step 4: Verify**

Run: `npm run build`

---

## Task 5: Add Invalid Date Handling to Date Utilities (LOW)

**Files:**
- Modify: `lib/utils/dates.ts:1-22`

**Step 1: Add date validation to formatRelativeDate**

Update the function:

```typescript
export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return 'Unknown';
  }
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}
```

**Step 2: Add date validation to formatShortDate**

Update the function:

```typescript
export function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return 'Unknown';
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
```

**Step 3: Verify**

Run: `npm run build`

---

## Verification

Run full build to ensure all changes compile:
```bash
npm run build
```

---

## Post-Implementation: Update Fix Reports

After completing all tasks, update the fix report file `_rcodegen/code_manage-claude-fix-2026-01-28_142001.md`:
1. Add `Date Updated: 2026-01-28` below `Date Created`
2. Mark fixed issues as resolved or remove them from the report
