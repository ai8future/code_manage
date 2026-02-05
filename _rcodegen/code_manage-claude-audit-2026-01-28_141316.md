Date Created: 2026-01-28 14:13:16
TOTAL_SCORE: 68/100

# Code Manager - Security & Code Quality Audit

## Executive Summary

Code Manager is a Next.js 16 full-stack application for managing codebases in `~/Desktop/_code/`. The application has **significant security improvements since v1.0.4** but retains one **critical vulnerability** in the terminal API. Code quality is generally good with TypeScript strict mode, but there are architectural concerns around code duplication and missing input validation.

---

## Security Audit

### CRITICAL VULNERABILITY - Command Injection in Terminal API

**File:** `app/api/terminal/route.ts:24`
**Severity:** CRITICAL
**CVSS Score:** 9.8

The terminal API uses `exec()` instead of `execFile()`, allowing arbitrary command execution:

```typescript
// VULNERABLE CODE at line 24
exec(
  command,  // User-controlled input passed directly to shell
  { cwd: cwd || process.cwd(), ... },
  ...
);
```

**Attack Vector:** Any user can execute arbitrary shell commands via POST to `/api/terminal`:
```bash
curl -X POST http://localhost:3000/api/terminal \
  -H "Content-Type: application/json" \
  -d '{"command": "rm -rf / --no-preserve-root"}'
```

**Impact:** Complete system compromise, data exfiltration, malware installation.

**Recommended Fix:**
```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -1,5 +1,6 @@
 import { NextResponse } from 'next/server';
-import { exec } from 'child_process';
+import { execFile } from 'child_process';
+import path from 'path';

 export const dynamic = 'force-dynamic';

+const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
+const ALLOWED_COMMANDS = new Set(['git', 'npm', 'npx', 'yarn', 'pnpm', 'node', 'ls', 'cat', 'head', 'tail', 'pwd', 'echo']);
+
 export async function POST(request: Request) {
   try {
     const { command, cwd } = await request.json();

     if (!command) {
       return NextResponse.json(
         { error: 'Command is required' },
         { status: 400 }
       );
     }

+    // Validate cwd is within allowed directory
+    const resolvedCwd = path.resolve(cwd || process.cwd());
+    if (!resolvedCwd.startsWith(CODE_BASE_PATH)) {
+      return NextResponse.json(
+        { error: 'Invalid working directory' },
+        { status: 403 }
+      );
+    }
+
+    // Parse command safely - only allow whitelisted commands
+    const parts = command.trim().split(/\s+/);
+    const executable = parts[0];
+    const args = parts.slice(1);
+
+    if (!ALLOWED_COMMANDS.has(executable)) {
+      return NextResponse.json(
+        { error: `Command '${executable}' is not allowed` },
+        { status: 403 }
+      );
+    }
+
     const result = await new Promise<CommandResult>((resolve) => {
-      exec(
-        command,
+      execFile(
+        executable,
+        args,
         {
-          cwd: cwd || process.cwd(),
+          cwd: resolvedCwd,
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

---

### HIGH - Path Traversal in README API

**File:** `app/api/projects/readme/route.ts:22`
**Severity:** HIGH

The README endpoint does not validate that `projectPath` is within the allowed directory:

```typescript
// VULNERABLE: No path validation
const filePath = path.join(projectPath, filename);
const content = await fs.readFile(filePath, 'utf-8');
```

**Attack Vector:**
```bash
curl "http://localhost:3000/api/projects/readme?path=/etc"
# Could read /etc/passwd, /etc/shadow with correct README filename
```

**Recommended Fix:**
```diff
--- a/app/api/projects/readme/route.ts
+++ b/app/api/projects/readme/route.ts
@@ -5,6 +5,8 @@ import path from 'path';
 export const dynamic = 'force-dynamic';

 const README_FILES = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];
+const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';

 export async function GET(request: Request) {
   const { searchParams } = new URL(request.url);
@@ -17,6 +19,13 @@ export async function GET(request: Request) {
     );
   }

+  // Security: Validate path is within allowed directory
+  const resolvedPath = path.resolve(projectPath);
+  if (!resolvedPath.startsWith(CODE_BASE_PATH + '/') && resolvedPath !== CODE_BASE_PATH) {
+    return NextResponse.json(
+      { error: 'Invalid path' },
+      { status: 403 }
+    );
+  }
+
   try {
     for (const filename of README_FILES) {
```

---

### HIGH - Missing Path Validation in Move API

**File:** `app/api/actions/move/route.ts:27`
**Severity:** HIGH

The move endpoint does not validate that `projectPath` is within the allowed directory before moving:

```typescript
// No validation that projectPath is within CODE_BASE_PATH
const projectName = path.basename(projectPath);
// ...
await fs.rename(projectPath, targetPath);
```

**Attack Vector:** Could move arbitrary directories into or out of the code base path.

**Recommended Fix:**
```diff
--- a/app/api/actions/move/route.ts
+++ b/app/api/actions/move/route.ts
@@ -23,6 +23,13 @@ export async function POST(request: Request) {
       );
     }

+    // Security: Validate source path is within allowed directory
+    const resolvedSourcePath = path.resolve(projectPath);
+    if (!resolvedSourcePath.startsWith(CODE_BASE_PATH + '/')) {
+      return NextResponse.json(
+        { error: 'Invalid source path' },
+        { status: 403 }
+      );
+    }
+
     const projectName = path.basename(projectPath);
```

---

### MEDIUM - Hardcoded User Path

**Files:** Multiple (`lib/scanner.ts:5`, `app/api/file/route.ts:7`, etc.)
**Severity:** MEDIUM

The path `/Users/cliff/Desktop/_code` is hardcoded in multiple files:

```typescript
const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
```

**Impact:** Application is not portable and tied to a specific user account.

**Recommended Fix:** Create a centralized configuration with environment variable fallback:

```diff
+++ b/lib/constants.ts
@@ -0,0 +1,5 @@
+import path from 'path';
+import os from 'os';
+
+export const CODE_BASE_PATH = process.env.CODE_BASE_PATH
+  || path.join(os.homedir(), 'Desktop', '_code');
```

Then import from `@/lib/constants` in all files.

---

### LOW - Missing Rate Limiting

**Severity:** LOW

No rate limiting on API endpoints. In production, this could lead to DoS attacks.

**Recommendation:** Add rate limiting middleware using `next-rate-limit` or similar.

---

### LOW - No Authentication

**Severity:** LOW (for local-only use)

The application has no authentication mechanism. This is acceptable for local development tools but would be critical if exposed to a network.

---

## Security Positives

1. **`execFile()` used in action APIs** (`open-editor`, `open-finder`) - prevents shell injection
2. **Path traversal protection** in `/api/file` and action routes using `path.resolve()` validation
3. **Status parameter whitelisting** in `/api/projects` route
4. **`rel="noopener noreferrer"`** on external links in ReadmePreview
5. **TypeScript strict mode** enabled, reducing type-related bugs
6. **Dynamic rendering** forced on API routes to prevent stale data

---

## Code Quality Analysis

### Architecture Issues

#### HIGH - Code Duplication of `CODE_BASE_PATH`

The constant `CODE_BASE_PATH` is defined in 6+ files:
- `lib/scanner.ts:5`
- `app/api/file/route.ts:7`
- `app/api/actions/open-editor/route.ts:8`
- `app/api/actions/open-finder/route.ts:8`
- `app/api/actions/move/route.ts:7`

**Recommendation:** Centralize in `lib/constants.ts` and import everywhere.

#### MEDIUM - Inefficient Project Scanning

**File:** `app/api/projects/[slug]/route.ts:15`

```typescript
const projects = await scanAllProjects();
const project = projects.find((p) => p.slug === slug);
```

This scans ALL projects just to find one by slug. Should scan only the requested project.

**Recommended Fix:**
```diff
--- a/app/api/projects/[slug]/route.ts
+++ b/app/api/projects/[slug]/route.ts
@@ -1,5 +1,6 @@
 import { NextResponse } from 'next/server';
-import { scanAllProjects, scanProject } from '@/lib/scanner';
+import { scanAllProjects, scanProject, getCodeBasePath } from '@/lib/scanner';
+import path from 'path';

 export async function GET(
   request: Request,
@@ -9,8 +10,20 @@ export async function GET(

   try {
-    const projects = await scanAllProjects();
-    const project = projects.find((p) => p.slug === slug);
+    // First try direct lookup in common locations
+    const codeBase = getCodeBasePath();
+    const possiblePaths = [
+      path.join(codeBase, slug),
+      path.join(codeBase, '_crawlers', slug),
+      path.join(codeBase, '_icebox', slug),
+      path.join(codeBase, '_old', slug),
+    ];
+
+    let project = null;
+    for (const projectPath of possiblePaths) {
+      project = await scanProject(projectPath);
+      if (project && project.slug === slug) break;
+    }
+
+    // Fallback to full scan if not found
+    if (!project) {
+      const projects = await scanAllProjects();
+      project = projects.find((p) => p.slug === slug);
+    }
```

---

### TypeScript Issues

#### LOW - Implicit `any` in Error Handling

**File:** `app/project/[slug]/page.tsx:35`

```typescript
} catch (err) {
  setError(err instanceof Error ? err.message : 'An error occurred');
}
```

While this handles the error gracefully, consider using a typed error pattern.

#### LOW - Missing Return Type Annotations

Several functions lack explicit return type annotations:
- `formatDate` in `ProjectCard.tsx`
- `handleResize` in `TerminalPanel.tsx`

---

### React Best Practices

#### MEDIUM - Missing `useCallback` for Event Handlers

**File:** `components/terminal/TerminalPanel.tsx`

Event handlers like `executeCommand`, `handleKeyDown`, and `handleResize` are recreated on every render. Should use `useCallback`:

```diff
-  const executeCommand = async (command: string) => {
+  const executeCommand = useCallback(async (command: string) => {
     // ... implementation
-  };
+  }, [projectPath]);
```

#### LOW - Missing `key` Warning Potential

**File:** `components/terminal/TerminalPanel.tsx:234`

Using array index as key is generally acceptable here since entries are only appended:
```typescript
{history.map((entry, i) => (
  <div key={i} className="mb-2">
```

However, if history reordering or deletion is ever added, this could cause issues.

---

### Missing Features

1. **No test files** - Zero test coverage
2. **No error boundary** - Uncaught errors will crash the app
3. **No loading states** for some components
4. **No offline support** or caching strategy

---

## Dependencies Analysis

### Current Dependencies (package.json)

| Package | Version | Status |
|---------|---------|--------|
| next | ^16.1.4 | Latest |
| react | ^18 | Current |
| tailwindcss | ^3.4.1 | Current |
| react-markdown | ^10.1.0 | Current |
| react-syntax-highlighter | ^16.1.0 | Current |
| lucide-react | ^0.563.0 | Current |
| @xterm/xterm | ^6.0.0 | Current |

**Note:** `eslint-config-next` is on v14.2.33 while `next` is v16. Consider updating for consistency.

---

## Scoring Breakdown

| Category | Max Points | Score | Notes |
|----------|-----------|-------|-------|
| **Security** | 40 | 18 | Critical terminal vuln, path traversal in README/move |
| **Code Quality** | 25 | 18 | Good structure, some duplication |
| **TypeScript** | 15 | 13 | Strict mode enabled, minor issues |
| **Architecture** | 10 | 9 | Clean separation, needs constants centralization |
| **Dependencies** | 5 | 5 | All current |
| **Documentation** | 5 | 5 | README, CHANGELOG, AGENTS.md present |
| **Total** | 100 | **68** | |

---

## Recommendations Summary

### Immediate (Security)

1. **CRITICAL:** Fix terminal API command injection - use `execFile()` with command whitelisting
2. **HIGH:** Add path validation to README API
3. **HIGH:** Add path validation to move API

### Short-term (Code Quality)

4. Centralize `CODE_BASE_PATH` constant
5. Optimize single-project lookup in `/api/projects/[slug]`
6. Add error boundaries to the React app

### Long-term

7. Add test coverage
8. Add rate limiting
9. Consider authentication if deploying beyond localhost
10. Add `useCallback` to prevent unnecessary re-renders

---

## Files Reviewed

- `lib/scanner.ts` - Project scanning logic
- `lib/config.ts` - Configuration management
- `lib/types.ts` - TypeScript type definitions
- `app/api/terminal/route.ts` - **CRITICAL VULNERABILITY**
- `app/api/file/route.ts` - File reading (secured)
- `app/api/actions/open-editor/route.ts` - VS Code opening (secured)
- `app/api/actions/open-finder/route.ts` - Finder opening (secured)
- `app/api/actions/move/route.ts` - **NEEDS VALIDATION**
- `app/api/projects/route.ts` - Project listing (secured)
- `app/api/projects/[slug]/route.ts` - Project detail
- `app/api/projects/readme/route.ts` - **NEEDS VALIDATION**
- `app/layout.tsx` - Root layout
- `app/page.tsx` - Dashboard page
- `app/project/[slug]/page.tsx` - Project detail page
- `components/terminal/TerminalPanel.tsx` - Terminal UI
- `components/dashboard/ProjectCard.tsx` - Project card
- `components/project/ReadmePreview.tsx` - README display
- `components/sidebar/Sidebar.tsx` - Navigation sidebar
- `package.json` - Dependencies
- `tsconfig.json` - TypeScript config
- `app/globals.css` - Global styles

---

*Report generated by Claude Opus 4.5 - 2026-01-28*
