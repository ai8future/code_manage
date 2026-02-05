Date Created: 2026-01-25 15:32:00
TOTAL_SCORE: 78/100

# Code Manage - Code Audit Report

## Executive Summary

Code Manage is a Next.js 16 web application providing a dashboard for managing and tracking projects in `~/Desktop/_code/`. The codebase demonstrates solid architecture with good separation of concerns, but has several issues that warrant attention including a **critical security vulnerability**, unused code, React hook dependency warnings, and code smell patterns.

---

## Critical Issues (Deduct 12 points)

### 1. **CRITICAL: Command Injection Vulnerability in Terminal API** (-10 points)
**File:** `app/api/terminal/route.ts:24`

The terminal API uses `exec()` with unsanitized user input, allowing arbitrary command execution:

```typescript
// VULNERABLE CODE
exec(
  command,  // User-controlled input passed directly to shell
  { cwd: cwd || process.cwd(), ... }
)
```

**Risk:** An attacker can execute any shell command on the server.

**Patch-Ready Diff:**
```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -1,5 +1,7 @@
 import { NextResponse } from 'next/server';
-import { exec } from 'child_process';
+import { spawn } from 'child_process';
+import path from 'path';
+
+const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';

 export const dynamic = 'force-dynamic';

@@ -20,21 +22,40 @@ export async function POST(request: Request) {
       );
     }

+    // Validate cwd is within allowed directory
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
-      exec(
-        command,
-        {
-          cwd: cwd || process.cwd(),
-          maxBuffer: 1024 * 1024 * 10, // 10MB
-          timeout: 60000, // 1 minute timeout
-          env: {
-            ...process.env,
-            TERM: 'xterm-256color',
-            FORCE_COLOR: '1',
-          },
+      // Use spawn with shell:true but validate cwd
+      const child = spawn(command, [], {
+        cwd: cwd || CODE_BASE_PATH,
+        shell: true,
+        timeout: 60000,
+        env: {
+          ...process.env,
+          TERM: 'xterm-256color',
+          FORCE_COLOR: '1',
         },
-        (error, stdout, stderr) => {
-          resolve({
-            stdout: stdout || '',
-            stderr: stderr || '',
-            exitCode: error?.code || 0,
-          });
-        }
-      );
+      });
+
+      let stdout = '';
+      let stderr = '';
+
+      child.stdout?.on('data', (data) => { stdout += data.toString(); });
+      child.stderr?.on('data', (data) => { stderr += data.toString(); });
+
+      child.on('close', (code) => {
+        resolve({ stdout, stderr, exitCode: code ?? 0 });
+      });
+
+      child.on('error', (err) => {
+        resolve({ stdout, stderr: err.message, exitCode: 1 });
+      });
     });
```

**Note:** The current code intentionally allows shell command execution as it's a terminal feature. However, the `cwd` parameter should be validated to prevent directory traversal. The above diff adds cwd validation while preserving intended terminal functionality.

### 2. **Path Traversal in README API** (-2 points)
**File:** `app/api/projects/readme/route.ts:21-28`

The README API doesn't validate that the provided path is within the allowed directory:

```typescript
// VULNERABLE - no path validation
for (const filename of README_FILES) {
  const filePath = path.join(projectPath, filename);
  const content = await fs.readFile(filePath, 'utf-8');
}
```

**Patch-Ready Diff:**
```diff
--- a/app/api/projects/readme/route.ts
+++ b/app/api/projects/readme/route.ts
@@ -6,6 +6,8 @@ export const dynamic = 'force-dynamic';

 const README_FILES = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];

+const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
+
 export async function GET(request: Request) {
   const { searchParams } = new URL(request.url);
   const projectPath = searchParams.get('path');
@@ -17,8 +19,17 @@ export async function GET(request: Request) {
     );
   }

+  // Security: Validate path is within allowed directory
+  const resolvedProjectPath = path.resolve(projectPath);
+  if (!resolvedProjectPath.startsWith(CODE_BASE_PATH + '/') && resolvedProjectPath !== CODE_BASE_PATH) {
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
```

---

## ESLint Errors (Deduct 5 points)

### 3. Unused Imports and Variables

**File:** `app/api/projects/[slug]/route.ts:2`
```typescript
import { scanAllProjects, scanProject } from '@/lib/scanner';
// scanProject is imported but never used
```

**File:** `lib/scanner.ts:3`
```typescript
import { RcodegenTaskGrade } from './types';
// RcodegenTaskGrade is imported but never used
```

**File:** `components/terminal/TerminalPanel.tsx:67`
```typescript
} catch (error) {  // error is unused
```

**File:** `components/project/BugsCard.tsx:92` and `components/project/ReadmePreview.tsx:79`
```typescript
code: ({ className, children, ...props }) => {  // props is unused
```

**Patch-Ready Diff for scanner.ts:**
```diff
--- a/lib/scanner.ts
+++ b/lib/scanner.ts
@@ -1,6 +1,6 @@
 import { promises as fs } from 'fs';
 import path from 'path';
-import { Project, ProjectStatus, BugInfo, BugReport, RcodegenInfo, RcodegenGrade, RcodegenTaskGrade } from './types';
+import { Project, ProjectStatus, BugInfo, BugReport, RcodegenInfo, RcodegenGrade } from './types';
```

**Patch-Ready Diff for route.ts:**
```diff
--- a/app/api/projects/[slug]/route.ts
+++ b/app/api/projects/[slug]/route.ts
@@ -1,5 +1,5 @@
 import { NextResponse } from 'next/server';
-import { scanAllProjects, scanProject } from '@/lib/scanner';
+import { scanAllProjects } from '@/lib/scanner';
 import { getProjectMetadata, setProjectMetadata } from '@/lib/config';
```

**Patch-Ready Diff for TerminalPanel.tsx:**
```diff
--- a/components/terminal/TerminalPanel.tsx
+++ b/components/terminal/TerminalPanel.tsx
@@ -64,7 +64,7 @@ export function TerminalPanel({ projectPath, onClose }: TerminalPanelProps) {
           timestamp: new Date(),
         },
       ]);
-    } catch (error) {
+    } catch {
       setHistory((prev) => [
```

**Patch-Ready Diff for BugsCard.tsx:**
```diff
--- a/components/project/BugsCard.tsx
+++ b/components/project/BugsCard.tsx
@@ -89,7 +89,7 @@ function BugModal({ bug, projectPath, onClose, onOpenInEditor }: BugModalProps)
           {content && (
             <div className="prose prose-sm dark:prose-invert max-w-none">
               <ReactMarkdown
                 components={{
-                  code: ({ className, children, ...props }) => {
+                  code: ({ className, children }) => {
                     const match = /language-(\w+)/.exec(className || '');
```

**Patch-Ready Diff for ReadmePreview.tsx:**
```diff
--- a/components/project/ReadmePreview.tsx
+++ b/components/project/ReadmePreview.tsx
@@ -76,7 +76,7 @@ export function ReadmePreview({ projectPath }: ReadmePreviewProps) {
             p: ({ children }) => <p className="mb-3 text-gray-700 dark:text-gray-300">{children}</p>,
             ul: ({ children }) => <ul className="list-disc pl-5 mb-3">{children}</ul>,
             ol: ({ children }) => <ol className="list-decimal pl-5 mb-3">{children}</ol>,
             li: ({ children }) => <li className="mb-1 text-gray-700 dark:text-gray-300">{children}</li>,
-            code: ({ className, children, ...props }) => {
+            code: ({ className, children }) => {
               const match = /language-(\w+)/.exec(className || '');
```

---

## React Hook Warnings (Deduct 3 points)

### 4. Missing useEffect Dependencies

**File:** `app/project/[slug]/page.tsx:43`
```typescript
useEffect(() => {
  fetchProject();
}, [slug]);  // Missing 'fetchProject' dependency
```

**File:** `components/dashboard/ProjectGrid.tsx:55`
```typescript
useEffect(() => {
  fetchProjects();
}, [status, search]);  // Missing 'fetchProjects' dependency
```

**File:** `components/sidebar/SidebarProjectList.tsx:67`
```typescript
useEffect(() => {
  // ...fetch logic
}, [isActive]);  // Missing 'loaded' and 'status' dependencies
```

**Recommended Fix Pattern:** Wrap fetch functions in `useCallback` or move them inside the effect:

```diff
--- a/app/project/[slug]/page.tsx
+++ b/app/project/[slug]/page.tsx
@@ -1,5 +1,5 @@
 'use client';

-import { useEffect, useState } from 'react';
+import { useEffect, useState, useCallback } from 'react';
 import { useParams } from 'next/navigation';
 import { Loader2 } from 'lucide-react';
 import { Project } from '@/lib/types';
@@ -20,7 +20,7 @@ export default function ProjectPage() {
   const [error, setError] = useState<string | null>(null);
   const [showTerminal, setShowTerminal] = useState(false);

-  const fetchProject = async () => {
+  const fetchProject = useCallback(async () => {
     try {
       const response = await fetch(`/api/projects/${slug}`);
       if (!response.ok) {
@@ -36,11 +36,11 @@ export default function ProjectPage() {
     } finally {
       setLoading(false);
     }
-  };
+  }, [slug]);

   useEffect(() => {
     fetchProject();
-  }, [slug]);
+  }, [fetchProject]);
```

---

## Code Smells (Deduct 2 points)

### 5. Hardcoded Path Constant Duplication
The `CODE_BASE_PATH` constant is defined in multiple files:
- `lib/scanner.ts:5`
- `app/api/file/route.ts:7`
- `app/api/actions/move/route.ts:7`
- `app/api/actions/open-editor/route.ts:8`
- `app/api/actions/open-finder/route.ts:8`

**Recommendation:** Export from a single location (e.g., `lib/constants.ts` or `lib/scanner.ts`).

### 6. Version Mismatch
- `package.json` shows version `0.1.0`
- `VERSION` file shows `1.0.5`

This inconsistency could cause confusion about actual release versions.

### 7. Tailwind Config Uses `require()`
**File:** `tailwind.config.ts:24`
```typescript
require('@tailwindcss/typography')  // ESLint error: @typescript-eslint/no-require-imports
```

This should use ES module import syntax.

---

## Potential Logic Issues

### 8. Terminal Ctrl+C Doesn't Kill Process
**File:** `components/terminal/TerminalPanel.tsx:108-123`

The comment acknowledges this:
```typescript
if (e.key === 'c' && e.ctrlKey) {
  if (isRunning) {
    // Note: This won't actually kill the process on the server
```

The terminal provides visual feedback but the server-side process continues running until timeout.

### 9. Move Project API Lacks Path Validation
**File:** `app/api/actions/move/route.ts:18`

The `projectPath` from the request body isn't validated before being used with `fs.rename()`:

```typescript
const { slug, projectPath, newStatus } = await request.json();
// projectPath is used directly without validation
await fs.rename(projectPath, targetPath);
```

**Patch-Ready Diff:**
```diff
--- a/app/api/actions/move/route.ts
+++ b/app/api/actions/move/route.ts
@@ -24,6 +24,14 @@ export async function POST(request: Request) {
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

## Positive Aspects

1. **Good Security Practices in Some Areas:**
   - `open-editor` and `open-finder` use `execFile()` instead of `exec()` to prevent injection
   - `file` API has proper path traversal protection
   - Status parameter validation in projects API

2. **Clean Architecture:**
   - Clear separation between scanner, config, and types
   - Modular component structure
   - Proper TypeScript typing throughout

3. **Good UX Patterns:**
   - Loading states with spinners
   - Error handling with user feedback
   - Responsive design considerations

4. **Efficient Data Loading:**
   - Single scan reused for filtering and counts in projects API
   - Lazy loading of project lists in sidebar

---

## Summary of Issues

| Category | Count | Points Deducted |
|----------|-------|-----------------|
| Critical Security | 2 | -12 |
| ESLint Errors | 6 | -5 |
| React Hook Warnings | 3 | -3 |
| Code Smells | 3 | -2 |

**Total Deductions:** 22 points

**Final Score:** 78/100

---

## Recommended Priority Order

1. **HIGH:** Add path validation to terminal API's `cwd` parameter
2. **HIGH:** Add path validation to README API
3. **HIGH:** Add path validation to move API
4. **MEDIUM:** Fix ESLint errors (unused imports/variables)
5. **MEDIUM:** Fix React hook dependency warnings
6. **LOW:** Consolidate `CODE_BASE_PATH` constant
7. **LOW:** Sync VERSION file with package.json
8. **LOW:** Convert Tailwind config to ES modules
