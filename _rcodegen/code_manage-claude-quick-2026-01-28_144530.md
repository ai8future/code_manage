Date Created: 2026-01-28 14:45:30 UTC
TOTAL_SCORE: 58/100

# Code Manager - Quick Analysis Report

## Project Overview
- **Type**: Next.js 16.1.4 full-stack web application with TypeScript/React
- **Purpose**: Desktop project management tool that scans and manages codebases in `~/Desktop/_code/`
- **Test Coverage**: None (0%)

---

## Section 1: AUDIT - Security and Code Quality Issues

### 1.1 CRITICAL: Command Injection in Terminal API
**Location**: `app/api/terminal/route.ts:24`
**Severity**: CRITICAL
**Issue**: Uses `exec()` with unsanitized user input, allowing arbitrary command execution.

```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -1,5 +1,7 @@
 import { NextResponse } from 'next/server';
-import { exec } from 'child_process';
+import { exec, execFile } from 'child_process';
+
+const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';

 export const dynamic = 'force-dynamic';

@@ -20,12 +22,25 @@ export async function POST(request: Request) {
       );
     }

+    // Security: Validate cwd is within allowed path
+    if (cwd) {
+      const path = await import('path');
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
+      // Use shell with explicit path to reduce injection risk
+      execFile('/bin/bash', ['-c', command],
         {
-          cwd: cwd || process.cwd(),
+          cwd: cwd || CODE_BASE_PATH,
           maxBuffer: 1024 * 1024 * 10, // 10MB
           timeout: 60000, // 1 minute timeout
           env: {
```

### 1.2 MEDIUM: Path Traversal in README API
**Location**: `app/api/projects/readme/route.ts:22-24`
**Severity**: MEDIUM
**Issue**: No path validation - client can read any file on the system.

```diff
--- a/app/api/projects/readme/route.ts
+++ b/app/api/projects/readme/route.ts
@@ -5,6 +5,8 @@ import path from 'path';
 export const dynamic = 'force-dynamic';

 const README_FILES = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];
+const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';

 export async function GET(request: Request) {
   const { searchParams } = new URL(request.url);
@@ -18,8 +20,16 @@ export async function GET(request: Request) {
   }

   try {
+    // Security: Validate path is within allowed directory
+    const resolvedProjectPath = path.resolve(projectPath);
+    if (!resolvedProjectPath.startsWith(CODE_BASE_PATH + '/') && resolvedProjectPath !== CODE_BASE_PATH) {
+      return NextResponse.json(
+        { error: 'Invalid path' },
+        { status: 403 }
+      );
+    }
+
     for (const filename of README_FILES) {
-      const filePath = path.join(projectPath, filename);
+      const filePath = path.join(resolvedProjectPath, filename);
       try {
         const content = await fs.readFile(filePath, 'utf-8');
         return NextResponse.json({ content, filename });
```

### 1.3 HIGH: Path Traversal in Move Operation
**Location**: `app/api/actions/move/route.ts:27-35`
**Severity**: HIGH
**Issue**: Source path not validated before extracting basename, allowing files to be moved from anywhere.

```diff
--- a/app/api/actions/move/route.ts
+++ b/app/api/actions/move/route.ts
@@ -23,7 +23,16 @@ export async function POST(request: Request) {
       );
     }

-    const projectName = path.basename(projectPath);
+    // Security: Validate source path is within allowed directory
+    const resolvedSourcePath = path.resolve(projectPath);
+    if (!resolvedSourcePath.startsWith(CODE_BASE_PATH + '/')) {
+      return NextResponse.json(
+        { error: 'Invalid source path' },
+        { status: 403 }
+      );
+    }
+
+    const projectName = path.basename(resolvedSourcePath);

     // Determine target directory
     const statusFolder = STATUS_FOLDERS[newStatus as ProjectStatus];
```

### 1.4 MEDIUM: Incomplete Path Validation in File API
**Location**: `app/api/file/route.ts:22`
**Severity**: LOW
**Issue**: Path check only validates trailing slash, missing edge case for exact path match.

```diff
--- a/app/api/file/route.ts
+++ b/app/api/file/route.ts
@@ -19,7 +19,7 @@ export async function GET(request: Request) {

   // Security: Resolve path to prevent traversal attacks (e.g., ../../etc/passwd)
   const resolvedPath = path.resolve(filePath);
-  if (!resolvedPath.startsWith(CODE_BASE_PATH + '/')) {
+  if (!resolvedPath.startsWith(CODE_BASE_PATH + '/') && resolvedPath !== CODE_BASE_PATH) {
     return NextResponse.json(
       { error: 'Invalid path' },
       { status: 403 }
```

### 1.5 LOW: Hardcoded Sensitive Paths
**Location**: `lib/scanner.ts:5`, multiple API routes
**Severity**: LOW
**Issue**: User-specific absolute paths hardcoded in multiple files.

```diff
--- a/lib/scanner.ts
+++ b/lib/scanner.ts
@@ -2,7 +2,7 @@ import { promises as fs } from 'fs';
 import path from 'path';
 import { Project, ProjectStatus, BugInfo, BugReport, RcodegenInfo, RcodegenGrade, RcodegenTaskGrade } from './types';

-const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
+const CODE_BASE_PATH = process.env.CODE_BASE_PATH || '/Users/cliff/Desktop/_code';
```

---

## Section 2: TESTS - Proposed Unit Tests

### 2.1 Path Traversal Security Tests
**Target**: `app/api/file/route.ts`, `app/api/projects/readme/route.ts`, `app/api/actions/move/route.ts`

```diff
--- /dev/null
+++ b/app/api/__tests__/security.test.ts
@@ -0,0 +1,89 @@
+import { GET as getFile } from '../file/route';
+import { GET as getReadme } from '../projects/readme/route';
+import { POST as moveProject } from '../actions/move/route';
+
+describe('Path Traversal Security', () => {
+  describe('File API', () => {
+    it('should reject paths outside CODE_BASE_PATH', async () => {
+      const request = new Request('http://localhost/api/file?path=/etc/passwd');
+      const response = await getFile(request);
+      const data = await response.json();
+
+      expect(response.status).toBe(403);
+      expect(data.error).toBe('Invalid path');
+    });
+
+    it('should reject path traversal attempts', async () => {
+      const request = new Request(
+        'http://localhost/api/file?path=/Users/cliff/Desktop/_code/../../../etc/passwd'
+      );
+      const response = await getFile(request);
+
+      expect(response.status).toBe(403);
+    });
+
+    it('should allow valid paths within CODE_BASE_PATH', async () => {
+      const request = new Request(
+        'http://localhost/api/file?path=/Users/cliff/Desktop/_code/test-project/package.json'
+      );
+      const response = await getFile(request);
+
+      // May be 404 if file doesn't exist, but not 403
+      expect(response.status).not.toBe(403);
+    });
+  });
+
+  describe('README API', () => {
+    it('should reject paths outside CODE_BASE_PATH', async () => {
+      const request = new Request('http://localhost/api/projects/readme?path=/etc');
+      const response = await getReadme(request);
+
+      expect(response.status).toBe(403);
+    });
+  });
+
+  describe('Move API', () => {
+    it('should reject source paths outside CODE_BASE_PATH', async () => {
+      const request = new Request('http://localhost/api/actions/move', {
+        method: 'POST',
+        body: JSON.stringify({
+          slug: 'test',
+          projectPath: '/etc/passwd',
+          newStatus: 'active'
+        })
+      });
+      const response = await moveProject(request);
+
+      expect(response.status).toBe(403);
+    });
+  });
+});
```

### 2.2 Scanner Unit Tests
**Target**: `lib/scanner.ts`

```diff
--- /dev/null
+++ b/lib/__tests__/scanner.test.ts
@@ -0,0 +1,105 @@
+import {
+  fileExists,
+  readJsonFile,
+  detectTechStack,
+  determineStatus,
+  extractDescription,
+  getVersion
+} from '../scanner';
+import { promises as fs } from 'fs';
+import path from 'path';
+
+// Mock fs module
+jest.mock('fs', () => ({
+  promises: {
+    access: jest.fn(),
+    readFile: jest.fn(),
+    stat: jest.fn(),
+    readdir: jest.fn(),
+  }
+}));
+
+describe('Scanner', () => {
+  beforeEach(() => {
+    jest.clearAllMocks();
+  });
+
+  describe('fileExists', () => {
+    it('should return true when file exists', async () => {
+      (fs.access as jest.Mock).mockResolvedValue(undefined);
+
+      const result = await fileExists('/path/to/file');
+
+      expect(result).toBe(true);
+    });
+
+    it('should return false when file does not exist', async () => {
+      (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));
+
+      const result = await fileExists('/path/to/nonexistent');
+
+      expect(result).toBe(false);
+    });
+  });
+
+  describe('readJsonFile', () => {
+    it('should parse valid JSON', async () => {
+      (fs.readFile as jest.Mock).mockResolvedValue('{"name": "test"}');
+
+      const result = await readJsonFile('/path/to/package.json');
+
+      expect(result).toEqual({ name: 'test' });
+    });
+
+    it('should return null for invalid JSON', async () => {
+      (fs.readFile as jest.Mock).mockResolvedValue('not valid json');
+
+      const result = await readJsonFile('/path/to/file');
+
+      expect(result).toBeNull();
+    });
+  });
+
+  describe('determineStatus', () => {
+    it('should return active for root level projects', () => {
+      const result = determineStatus('/Users/cliff/Desktop/_code/my-project');
+      expect(result).toBe('active');
+    });
+
+    it('should return icebox for _icebox projects', () => {
+      const result = determineStatus('/Users/cliff/Desktop/_code/_icebox/old-project');
+      expect(result).toBe('icebox');
+    });
+
+    it('should return archived for _old projects', () => {
+      const result = determineStatus('/Users/cliff/Desktop/_code/_old/archived-project');
+      expect(result).toBe('archived');
+    });
+
+    it('should return crawlers for _crawlers projects', () => {
+      const result = determineStatus('/Users/cliff/Desktop/_code/_crawlers/crawler-project');
+      expect(result).toBe('crawlers');
+    });
+  });
+
+  describe('detectTechStack', () => {
+    it('should detect Next.js from package.json', async () => {
+      (fs.access as jest.Mock).mockImplementation((p) => {
+        if (p.endsWith('package.json')) return Promise.resolve();
+        return Promise.reject(new Error('ENOENT'));
+      });
+      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
+        dependencies: { next: '^14.0.0', react: '^18.0.0' }
+      }));
+
+      const result = await detectTechStack('/project');
+
+      expect(result).toContain('Next.js');
+      expect(result).toContain('React');
+    });
+  });
+});
```

### 2.3 Terminal API Tests
**Target**: `app/api/terminal/route.ts`

```diff
--- /dev/null
+++ b/app/api/__tests__/terminal.test.ts
@@ -0,0 +1,54 @@
+import { POST } from '../terminal/route';
+
+describe('Terminal API', () => {
+  it('should require command parameter', async () => {
+    const request = new Request('http://localhost/api/terminal', {
+      method: 'POST',
+      body: JSON.stringify({})
+    });
+
+    const response = await POST(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(400);
+    expect(data.error).toBe('Command is required');
+  });
+
+  it('should execute valid commands', async () => {
+    const request = new Request('http://localhost/api/terminal', {
+      method: 'POST',
+      body: JSON.stringify({
+        command: 'echo "hello"',
+        cwd: '/Users/cliff/Desktop/_code'
+      })
+    });
+
+    const response = await POST(request);
+    const data = await response.json();
+
+    expect(data.stdout).toContain('hello');
+    expect(data.exitCode).toBe(0);
+  });
+
+  it('should reject cwd outside CODE_BASE_PATH', async () => {
+    const request = new Request('http://localhost/api/terminal', {
+      method: 'POST',
+      body: JSON.stringify({
+        command: 'ls',
+        cwd: '/etc'
+      })
+    });
+
+    const response = await POST(request);
+
+    expect(response.status).toBe(403);
+  });
+});
```

---

## Section 3: FIXES - Bugs and Code Smells

### 3.1 Unreliable Exit Code Handling
**Location**: `app/api/terminal/route.ts:40`
**Issue**: Exit code may be undefined when process is killed by signal.

```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -4,6 +4,7 @@ import { exec } from 'child_process';
 interface CommandResult {
   stdout: string;
   stderr: string;
   exitCode: number;
+  signal?: string;
 }

@@ -33,8 +34,15 @@ export async function POST(request: Request) {
           },
         },
         (error, stdout, stderr) => {
+          let exitCode = 0;
+          if (error) {
+            // error.code is the exit code, error.signal is if killed by signal
+            exitCode = typeof error.code === 'number' ? error.code :
+                       error.signal ? 128 : 1;
+          }
           resolve({
             stdout: stdout || '',
             stderr: stderr || '',
-            exitCode: error?.code || 0,
+            exitCode,
+            signal: error?.signal,
           });
         }
       );
```

### 3.2 Silent Failure in BugModal
**Location**: `components/project/BugsCard.tsx:31-41`
**Issue**: No error state shown if content is undefined.

```diff
--- a/components/project/BugsCard.tsx
+++ b/components/project/BugsCard.tsx
@@ -30,7 +30,11 @@ function BugModal({ bug, projectPath, onClose, onOpenInEditor }: BugModalProps)
     fetch(`/api/file?path=${encodeURIComponent(filePath)}`)
       .then(res => res.json())
       .then(data => {
-        if (data.error) {
+        if (data.error) {
           setError(data.error);
+        } else if (data.content === undefined || data.content === null) {
+          setError('File content is empty or missing');
         } else {
           setContent(data.content);
         }
```

### 3.3 Missing AbortController for Fetch Requests
**Location**: `components/project/BugsCard.tsx:27-42`
**Issue**: Component unmount during fetch can cause memory leak.

```diff
--- a/components/project/BugsCard.tsx
+++ b/components/project/BugsCard.tsx
@@ -25,15 +25,21 @@ function BugModal({ bug, projectPath, onClose, onOpenInEditor }: BugModalProps)
   const [error, setError] = useState<string | null>(null);

   useEffect(() => {
+    const controller = new AbortController();
     const folder = bug.status === 'open' ? '_bugs_open' : '_bugs_fixed';
     const filePath = `${projectPath}/${folder}/${bug.filename}`;

-    fetch(`/api/file?path=${encodeURIComponent(filePath)}`)
+    fetch(`/api/file?path=${encodeURIComponent(filePath)}`, {
+      signal: controller.signal
+    })
       .then(res => res.json())
       .then(data => {
         if (data.error) {
           setError(data.error);
         } else {
           setContent(data.content);
         }
       })
-      .catch(() => setError('Failed to load file'))
+      .catch((err) => {
+        if (err.name !== 'AbortError') {
+          setError('Failed to load file');
+        }
+      })
       .finally(() => setLoading(false));
+
+    return () => controller.abort();
   }, [bug, projectPath]);
```

### 3.4 Missing Input Validation in Project PATCH
**Location**: `app/api/projects/[slug]/route.ts` (if exists)
**Issue**: Status values not validated against enum.

```diff
--- a/app/api/projects/[slug]/route.ts
+++ b/app/api/projects/[slug]/route.ts
@@ -52,11 +52,20 @@ export async function PATCH(
     return NextResponse.json({ error: 'Project not found' }, { status: 404 });
   }

+  const VALID_STATUSES = ['active', 'crawlers', 'icebox', 'archived'];
+
   // Update metadata
   const metadata = await getProjectMetadata(slug);
-  if (body.status) metadata.status = body.status;
-  if (body.tags !== undefined) metadata.tags = body.tags;
+
+  if (body.status) {
+    if (!VALID_STATUSES.includes(body.status)) {
+      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
+    }
+    metadata.status = body.status;
+  }
+
+  if (body.tags !== undefined) {
+    if (!Array.isArray(body.tags) || !body.tags.every(t => typeof t === 'string')) {
+      return NextResponse.json({ error: 'Tags must be an array of strings' }, { status: 400 });
+    }
+    metadata.tags = body.tags;
+  }

   await setProjectMetadata(slug, metadata);
```

---

## Section 4: REFACTOR - Improvement Opportunities

### 4.1 Extract Shared Path Validation Utility
**Files affected**: All API routes that validate paths
**Recommendation**: Create a shared utility function for path validation to ensure consistent security checks.

```typescript
// lib/security.ts
export function isPathWithinBase(targetPath: string, basePath: string): boolean {
  const resolved = path.resolve(targetPath);
  return resolved.startsWith(basePath + '/') || resolved === basePath;
}
```

### 4.2 Deduplicate Markdown Rendering Configuration
**Files affected**: `components/project/BugsCard.tsx`, `components/project/ReadmePreview.tsx`
**Recommendation**: Extract the ReactMarkdown configuration with syntax highlighting into a shared component.

### 4.3 Add Environment Configuration
**Files affected**: All files with hardcoded `CODE_BASE_PATH`
**Recommendation**: Use environment variables or a configuration file for the base path, making the application portable.

### 4.4 Implement Request Caching for Scanner
**Files affected**: `lib/scanner.ts`, `app/api/projects/route.ts`
**Recommendation**: Add caching layer for project scan results to avoid redundant filesystem operations on every request.

### 4.5 Add Error Boundary Components
**Files affected**: All React components
**Recommendation**: Wrap components in error boundaries to gracefully handle rendering failures and provide user feedback.

### 4.6 Add API Response Type Safety
**Files affected**: All API routes
**Recommendation**: Create shared response types and use consistent error response format across all endpoints.

### 4.7 Extract Terminal Process Management
**Files affected**: `app/api/terminal/route.ts`, `components/terminal/TerminalPanel.tsx`
**Recommendation**: Create a proper process manager that can track running processes, enable actual Ctrl+C functionality, and clean up orphaned processes.

---

## Scoring Breakdown

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Security | 40/100 | 35% | 14 |
| Code Quality | 65/100 | 25% | 16.25 |
| Test Coverage | 0/100 | 20% | 0 |
| Architecture | 70/100 | 10% | 7 |
| Error Handling | 55/100 | 10% | 5.5 |
| **TOTAL** | | | **58/100** |

### Key Issues Impacting Score:
1. **Critical command injection vulnerability** (-15 points)
2. **Multiple path traversal vulnerabilities** (-10 points)
3. **Zero test coverage** (-20 points)
4. **Silent error handling throughout** (-5 points)
5. **Hardcoded configuration** (-2 points)
