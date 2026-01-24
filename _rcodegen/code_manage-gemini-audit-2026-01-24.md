Date Created: Saturday, January 24, 2026
TOTAL_SCORE: 68/100

# Codebase Audit Report: code_manage

## Executive Summary
The `code_manage` application is a Next.js-based local dashboard for managing coding projects. It effectively scans a specific directory structure to provide metadata, status tracking, and quick actions (VS Code, Finder, Terminal). While functionally competent and well-structured using the App Router, it suffers from **critical security vulnerabilities** related to arbitrary command execution and input sanitization. These are mitigated only by the assumption that the tool runs locally in a trusted environment, but they remain best-practice violations that could lead to accidental damage or exploitation if exposed.

## Detailed Findings

### 1. Security (Critical)
*   **Remote Code Execution (RCE) Risk**: `app/api/terminal/route.ts` executes commands sent via JSON body directly using `exec`. There is no validation of the command or the `cwd` (current working directory), allowing potential execution of destructive commands outside the project scope.
*   **Command Injection**: `app/api/actions/open-editor` and `open-finder` use `child_process.exec` with string interpolation (`code "${path}"`). Malicious filenames or manipulated API requests could inject shell commands.
*   **Path Traversal**: File reading endpoints (e.g., `app/api/projects/readme`) accept absolute paths without validating they are within the allowed `CODE_BASE_PATH`.

### 2. Code Quality & Architecture
*   **Hardcoded Paths**: `lib/scanner.ts` hardcodes the user's home directory (`/Users/cliff/Desktop/_code`). This makes the application non-portable to other users or machines without code changes.
*   **Structure**: The project uses a clean Next.js App Router structure with clear separation of concerns (UI components vs. API logic).
*   **Typing**: TypeScript is used effectively with shared definitions in `lib/types.ts`.

## Recommended Patches

### Patch 1: Fix Hardcoded Base Path
Make the base path dynamic based on environment or home directory.

**File:** `lib/scanner.ts`

```typescript
<<<<
import { promises as fs } from 'fs';
import path from 'path';
import { Project, ProjectStatus, BugInfo, BugReport, RcodegenInfo, RcodegenGrade, RcodegenTaskGrade } from './types';

const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';

// Folders to completely ignore
====
import { promises as fs } from 'fs';
import path from 'path';
import { Project, ProjectStatus, BugInfo, BugReport, RcodegenInfo, RcodegenGrade, RcodegenTaskGrade } from './types';

const CODE_BASE_PATH = process.env.CODE_BASE_PATH || path.join(process.env.HOME || '', 'Desktop/_code');

// Folders to completely ignore
>>>>
```

### Patch 2: Mitigate Command Injection in Open Editor
Switch from `exec` to `spawn` to avoid shell interpretation of arguments.

**File:** `app/api/actions/open-editor/route.ts`

```typescript
<<<<
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { path } = await request.json();

    if (!path) {
      return NextResponse.json(
        { error: 'Path is required' },
        { status: 400 }
      );
    }

    // Open in VS Code
    await execAsync(`code "${path}"`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to open in editor:', error);
====
import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

export async function POST(request: Request) {
  try {
    const { path: filePath } = await request.json();

    if (!filePath) {
      return NextResponse.json(
        { error: 'Path is required' },
        { status: 400 }
      );
    }

    // Open in VS Code using spawn to prevent command injection
    await new Promise((resolve, reject) => {
      const child = spawn('code', [filePath], { stdio: 'ignore' });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(null);
        else reject(new Error(`VS Code exited with code ${code}`));
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to open in editor:', error);
>>>>
```

### Patch 3: Validate Paths in Readme Endpoint
Ensure requests only access files within the authorized code base path.

**File:** `app/api/projects/readme/route.ts`

```typescript
<<<<
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

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

  try {
    for (const filename of README_FILES) {
====
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getCodeBasePath } from '@/lib/scanner';

export const dynamic = 'force-dynamic';

const README_FILES = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get('path');

  // Security: Ensure path is within the allowed codebase directory
  const allowedBase = getCodeBasePath();
  if (!projectPath || !path.resolve(projectPath).startsWith(path.resolve(allowedBase))) {
    return NextResponse.json(
      { error: 'Invalid or missing path' },
      { status: 400 }
    );
  }

  try {
    for (const filename of README_FILES) {
>>>>
```
