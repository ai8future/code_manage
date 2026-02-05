Date Created: 2026-01-28T12:34:00-08:00
TOTAL_SCORE: 72/100

# Code Manager - Security & Code Quality Audit

## Executive Summary

Code Manager is a Next.js 16 web application for managing local codebases. The codebase demonstrates solid architectural patterns and some good security practices, but contains **one critical security vulnerability** and several areas for improvement.

### Overall Grade Breakdown

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Security | 55/100 | 35% | 19.25 |
| Code Quality | 78/100 | 25% | 19.50 |
| Architecture | 82/100 | 20% | 16.40 |
| Type Safety | 85/100 | 10% | 8.50 |
| Error Handling | 75/100 | 10% | 7.50 |
| **TOTAL** | | | **71.15 → 72** |

---

## Critical Security Issues

### 1. CRITICAL: Command Injection in Terminal API (Severity: HIGH)

**File:** `app/api/terminal/route.ts:24`

**Issue:** The terminal API uses `exec()` instead of `execFile()`, allowing arbitrary shell command execution without any sanitization or validation.

```typescript
// VULNERABLE CODE (lines 23-44)
const result = await new Promise<CommandResult>((resolve) => {
  exec(
    command,  // <-- User input passed directly to shell
    {
      cwd: cwd || process.cwd(),
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

**Impact:**
- Remote code execution if the web server is exposed
- Full system access with server process privileges
- Data exfiltration, malware installation, lateral movement

**Mitigation:** While the other action routes (`open-editor`, `open-finder`) were fixed to use `execFile()`, the terminal endpoint was intentionally left as a shell emulator. However, there is NO path validation on `cwd`, and NO authentication/authorization.

**Patch-Ready Diff:**
```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -1,5 +1,7 @@
 import { NextResponse } from 'next/server';
 import { exec } from 'child_process';
+import path from 'path';
+
+const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';

 export const dynamic = 'force-dynamic';

@@ -18,6 +20,15 @@ export async function POST(request: Request) {
       );
     }

+    // Security: Validate cwd is within allowed directory
+    if (cwd) {
+      const resolvedCwd = path.resolve(cwd);
+      if (!resolvedCwd.startsWith(CODE_BASE_PATH + '/') && resolvedCwd !== CODE_BASE_PATH) {
+        return NextResponse.json(
+          { error: 'Invalid working directory' },
+          { status: 403 }
+        );
+      }
+    }
+
     const result = await new Promise<CommandResult>((resolve) => {
       exec(
         command,
```

---

### 2. MEDIUM: Missing Path Validation in Move API

**File:** `app/api/actions/move/route.ts:26-35`

**Issue:** The `projectPath` from the request body is not validated before being used with `path.basename()` and `fs.rename()`.

```typescript
// VULNERABLE CODE
const projectName = path.basename(projectPath);  // No validation of projectPath!

const statusFolder = STATUS_FOLDERS[newStatus as ProjectStatus];
const targetDir = statusFolder
  ? path.join(CODE_BASE_PATH, statusFolder)
  : CODE_BASE_PATH;

const targetPath = path.join(targetDir, projectName);
// ...
await fs.rename(projectPath, targetPath);  // Could move files from anywhere
```

**Impact:**
- Attacker could move files from outside `_code` directory
- Potential data loss or system disruption

**Patch-Ready Diff:**
```diff
--- a/app/api/actions/move/route.ts
+++ b/app/api/actions/move/route.ts
@@ -22,6 +22,14 @@ export async function POST(request: Request) {
       );
     }

+    // Security: Validate projectPath is within allowed directory
+    const resolvedProjectPath = path.resolve(projectPath);
+    if (!resolvedProjectPath.startsWith(CODE_BASE_PATH + '/')) {
+      return NextResponse.json(
+        { error: 'Invalid project path' },
+        { status: 403 }
+      );
+    }
+
     const projectName = path.basename(projectPath);
```

---

### 3. MEDIUM: Missing Status Validation in Move API

**File:** `app/api/actions/move/route.ts:30`

**Issue:** `newStatus` is cast to `ProjectStatus` without validation, potentially allowing undefined folder paths.

```typescript
const statusFolder = STATUS_FOLDERS[newStatus as ProjectStatus];  // No validation
```

**Patch-Ready Diff:**
```diff
--- a/app/api/actions/move/route.ts
+++ b/app/api/actions/move/route.ts
@@ -4,6 +4,10 @@ import { ProjectStatus } from '@/lib/types';

 const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';

+const VALID_STATUSES: ProjectStatus[] = ['active', 'crawlers', 'icebox', 'archived'];
+
+function isValidStatus(status: string): status is ProjectStatus {
+  return VALID_STATUSES.includes(status as ProjectStatus);
+}
+
 const STATUS_FOLDERS: Record<ProjectStatus, string | null> = {
   active: null,
   crawlers: '_crawlers',
@@ -19,6 +23,13 @@ export async function POST(request: Request) {
       );
     }

+    if (!isValidStatus(newStatus)) {
+      return NextResponse.json(
+        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
+        { status: 400 }
+      );
+    }
+
     // ... rest of function
```

---

### 4. LOW: Terminal Ctrl+C Doesn't Kill Server Process

**File:** `components/terminal/TerminalPanel.tsx:108-122`

**Issue:** The client-side Ctrl+C only provides visual feedback but doesn't actually terminate the running server-side process.

```typescript
} else if (e.key === 'c' && e.ctrlKey) {
  if (isRunning) {
    // Note: This won't actually kill the process on the server
    // but it provides visual feedback
    setIsRunning(false);
    // ...
  }
}
```

**Impact:** Long-running or stuck processes will continue consuming server resources.

**Recommendation:** Implement a server-side endpoint to track and kill spawned processes using process IDs.

---

## Code Quality Issues

### 5. Code Duplication: Hardcoded Path Constant

**Files:**
- `lib/scanner.ts:5`
- `app/api/file/route.ts:7`
- `app/api/actions/open-editor/route.ts:8`
- `app/api/actions/open-finder/route.ts:8`
- `app/api/actions/move/route.ts:7`

**Issue:** `CODE_BASE_PATH` is defined in 5 different files.

**Patch-Ready Diff:**
```diff
--- a/lib/scanner.ts
+++ b/lib/scanner.ts
@@ -2,7 +2,7 @@ import { promises as fs } from 'fs';
 import path from 'path';
 import { Project, ProjectStatus, BugInfo, BugReport, RcodegenInfo, RcodegenGrade, RcodegenTaskGrade } from './types';

-const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
+export const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';

 // ... rest of file
```

Then import from scanner.ts in all other files:
```diff
--- a/app/api/file/route.ts
+++ b/app/api/file/route.ts
@@ -1,9 +1,8 @@
 import { NextResponse } from 'next/server';
 import { promises as fs } from 'fs';
 import path from 'path';
+import { CODE_BASE_PATH } from '@/lib/scanner';

 export const dynamic = 'force-dynamic';
-
-const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
```

---

### 6. Duplicated Markdown Code Component

**Files:**
- `components/project/BugsCard.tsx:92-119`
- `components/project/ReadmePreview.tsx:79-106`

**Issue:** Nearly identical `code` component rendering logic for ReactMarkdown.

**Recommendation:** Extract to a shared component:

```typescript
// lib/markdown-components.tsx
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

export const markdownComponents = {
  code: ({ className, children }: { className?: string; children: React.ReactNode }) => {
    const match = /language-(\w+)/.exec(className || '');
    const isInline = !match && !className;

    if (isInline) {
      return (
        <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono text-pink-600 dark:text-pink-400">
          {children}
        </code>
      );
    }

    return (
      <SyntaxHighlighter
        style={oneDark}
        language={match ? match[1] : 'text'}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: '0.5rem', fontSize: '0.875rem' }}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    );
  },
  pre: ({ children }: { children: React.ReactNode }) => (
    <div className="mb-4 overflow-hidden rounded-lg">{children}</div>
  ),
};
```

---

### 7. Missing Error Boundaries

**Issue:** No React error boundaries are implemented. Component errors will crash the entire application.

**Recommendation:** Add error boundary at layout level:

```typescript
// components/ErrorBoundary.tsx
'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-6 text-center">
          <h2 className="text-xl font-bold text-red-600">Something went wrong</h2>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

---

### 8. Unused xterm Dependencies

**File:** `package.json:14-15`

**Issue:** `@xterm/xterm` and `@xterm/addon-fit` are listed as dependencies but the terminal implementation uses a custom HTML-based terminal, not xterm.

```json
"@xterm/addon-fit": "^0.11.0",
"@xterm/xterm": "^6.0.0",
```

**Patch-Ready Diff:**
```diff
--- a/package.json
+++ b/package.json
@@ -11,8 +11,6 @@
   "dependencies": {
     "@tailwindcss/typography": "^0.5.19",
     "@types/react-syntax-highlighter": "^15.5.13",
-    "@xterm/addon-fit": "^0.11.0",
-    "@xterm/xterm": "^6.0.0",
     "lucide-react": "^0.563.0",
     "next": "^16.1.4",
     "react": "^18",
```

---

### 9. Missing Loading State in useEffect Dependency

**File:** `components/dashboard/ProjectGrid.tsx:53-55`

**Issue:** `fetchProjects` is defined inside the component but not memoized, and `status` in dependency array will re-create closure on every render.

```typescript
useEffect(() => {
  fetchProjects();
}, [status]);  // eslint warning likely suppressed
```

**Patch-Ready Diff:**
```diff
--- a/components/dashboard/ProjectGrid.tsx
+++ b/components/dashboard/ProjectGrid.tsx
@@ -1,5 +1,5 @@
 'use client';

-import { useState, useEffect } from 'react';
+import { useState, useEffect, useCallback } from 'react';
 import { Project, ProjectStatus } from '@/lib/types';
 import { ProjectCard } from './ProjectCard';
 import { SearchBar } from './SearchBar';
@@ -29,7 +29,7 @@ export function ProjectGrid({ status, title, showSearch = true }: ProjectGridPro
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [search, setSearch] = useState('');

-  const fetchProjects = async () => {
+  const fetchProjects = useCallback(async () => {
     setLoading(true);
     setError(null);

@@ -46,7 +46,7 @@ export function ProjectGrid({ status, title, showSearch = true }: ProjectGridPro
     } finally {
       setLoading(false);
     }
-  };
+  }, [status]);

   useEffect(() => {
     fetchProjects();
```

---

### 10. Type Assertion Instead of Validation

**File:** `app/api/projects/[slug]/route.ts:58-62`

**Issue:** Request body fields are assigned directly without type validation.

```typescript
if (body.status) metadata.status = body.status;
if (body.customName !== undefined) metadata.customName = body.customName;
```

**Recommendation:** Use a validation library like Zod:

```typescript
import { z } from 'zod';

const updateProjectSchema = z.object({
  status: z.enum(['active', 'crawlers', 'icebox', 'archived']).optional(),
  customName: z.string().max(100).optional(),
  customDescription: z.string().max(500).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  notes: z.string().max(2000).optional(),
});
```

---

## Architecture Observations

### Strengths

1. **Clean separation of concerns**: Scanner logic is well-isolated in `lib/scanner.ts`
2. **Type safety**: Comprehensive TypeScript interfaces in `lib/types.ts`
3. **Modern patterns**: Uses Next.js App Router with Server Components
4. **Good file organization**: Components organized by feature domain
5. **Defensive coding**: Path traversal protection in file/editor APIs

### Areas for Improvement

1. **No authentication**: Any network request can execute commands
2. **No rate limiting**: API endpoints vulnerable to abuse
3. **No CSRF protection**: Missing token validation on POST endpoints
4. **No input sanitization library**: Manual validation is error-prone
5. **Missing README API route**: `ReadmePreview.tsx` calls `/api/projects/readme` but this route doesn't exist

---

## Missing API Route

**File:** `components/project/ReadmePreview.tsx:20`

**Issue:** Component calls `/api/projects/readme?path=...` but this route was not found in the codebase.

```typescript
const response = await fetch(`/api/projects/readme?path=${encodeURIComponent(projectPath)}`);
```

**Required Fix:** Create the missing route:

```typescript
// app/api/projects/readme/route.ts
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CODE_BASE_PATH } from '@/lib/scanner';

export const dynamic = 'force-dynamic';

const README_NAMES = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get('path');

  if (!projectPath) {
    return NextResponse.json({ error: 'Path is required' }, { status: 400 });
  }

  const resolvedPath = path.resolve(projectPath);
  if (!resolvedPath.startsWith(CODE_BASE_PATH + '/') && resolvedPath !== CODE_BASE_PATH) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
  }

  for (const name of README_NAMES) {
    try {
      const readmePath = path.join(resolvedPath, name);
      const content = await fs.readFile(readmePath, 'utf-8');
      return NextResponse.json({ content });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ error: 'README not found' }, { status: 404 });
}
```

---

## Version Mismatch

**Files:**
- `package.json:3`: `"version": "0.1.0"`
- `CHANGELOG.md`: Documents versions up to 1.0.5

**Recommendation:** Sync VERSION file with package.json or update package.json to match.

---

## Summary of Required Changes

| Priority | Issue | File(s) | Effort |
|----------|-------|---------|--------|
| CRITICAL | Command injection via cwd | terminal/route.ts | Low |
| HIGH | Missing path validation | move/route.ts | Low |
| HIGH | Missing status validation | move/route.ts | Low |
| HIGH | Missing README API route | New file | Medium |
| MEDIUM | Duplicated CODE_BASE_PATH | 5 files | Low |
| MEDIUM | Duplicated markdown components | 2 files | Low |
| LOW | Unused xterm dependencies | package.json | Low |
| LOW | Missing error boundaries | New file | Medium |
| LOW | useCallback for fetchProjects | ProjectGrid.tsx | Low |
| LOW | Version mismatch | package.json | Low |

---

## Testing Recommendations

1. Add unit tests for `lib/scanner.ts` functions
2. Add API route tests with mocked filesystem
3. Add integration tests for security validations
4. Add E2E tests for terminal workflow

---

## Conclusion

Code Manager is a well-structured application with good TypeScript practices and modern React patterns. The most critical issue is the lack of `cwd` validation in the terminal API, which combined with the lack of authentication creates significant risk if the application is exposed beyond localhost.

The other API endpoints demonstrate good security awareness with path traversal protection via `path.resolve()` checks. Addressing the critical security issues and implementing the missing README route should be prioritized.

**Final Score: 72/100**
