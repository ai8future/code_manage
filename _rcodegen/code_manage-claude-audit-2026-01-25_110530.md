Date Created: 2026-01-25 11:05:30
TOTAL_SCORE: 62/100

# Code Management Application - Security Audit Report

**Audit Date:** 2026-01-25 11:05:30
**Repository:** /Users/cliff/Desktop/_code/code_manage
**Codebase Version:** 0.2.0
**Auditor:** Claude Opus 4.5

---

## Executive Summary

This is a Next.js-based project management and monitoring dashboard that scans codebases, tracks projects, and provides utilities for code analysis. The application has **CRITICAL SECURITY VULNERABILITIES** that pose immediate risks if the application is exposed beyond localhost.

**Overall Score: 62/100** (Failing - requires immediate remediation)

**Status:** Several high-impact security issues identified that must be fixed before any production deployment.

---

## Score Breakdown

| Category | Points | Max | Issues |
|----------|--------|-----|--------|
| Authentication & Authorization | 10 | 20 | No auth mechanism, all endpoints public |
| Input Validation | 15 | 25 | Multiple endpoints lack validation |
| Path Traversal Protection | 12 | 20 | README endpoint unprotected, symlink vulnerabilities |
| Command Execution | 8 | 15 | Arbitrary command execution allowed |
| Data Protection | 12 | 15 | No encryption, proper types mostly used |
| Error Handling | 8 | 10 | Generic error messages, could leak info |
| Dependencies | 15 | 15 | No known vulnerable deps |
| **TOTAL** | **62** | **100** | **FAILING** |

---

## Critical Issues (Must Fix Immediately)

### 1. CRITICAL: Unauthenticated Arbitrary Command Execution

**File:** `app/api/terminal/route.ts`
**Lines:** 24-44
**Severity:** CRITICAL
**CWE:** CWE-78 (OS Command Injection), CWE-94 (Improper Control of Generation of Code)

**Description:**
The terminal endpoint accepts and executes arbitrary shell commands with no authentication, no command allowlist/denylist, and no working directory boundary validation.

**Impact:**
- Remote Code Execution (RCE) if server is exposed beyond localhost
- Full system compromise potential
- Can read/write arbitrary files, pivot to other systems

**Current Vulnerable Code:**
```typescript
const result = await new Promise<CommandResult>((resolve) => {
  exec(
    command,                    // User-controlled, no allowlist
    {
      cwd: cwd || process.cwd(), // Can be ANY directory
      maxBuffer: 1024 * 1024 * 10,
      timeout: 60000,
      env: {
        ...process.env,         // Full environment exposure
        TERM: 'xterm-256color',
        FORCE_COLOR: '1',
      },
    },
    // ...
  );
});
```

**Patch-Ready Diff:**
```diff
--- a/app/api/terminal/route.ts
+++ b/app/api/terminal/route.ts
@@ -1,5 +1,7 @@
 import { NextResponse } from 'next/server';
 import { exec } from 'child_process';
+import path from 'path';
+import { getCodeBasePath } from '@/lib/scanner';

 interface CommandResult {
   stdout: string;
@@ -7,15 +9,37 @@ interface CommandResult {
   exitCode: number;
 }

+const CODE_BASE_PATH = getCodeBasePath();
+const TERMINAL_ENABLED = process.env.CODE_MANAGE_ALLOW_TERMINAL === '1';
+
 export async function POST(request: Request) {
   try {
+    if (!TERMINAL_ENABLED) {
+      return NextResponse.json(
+        { error: 'Terminal is disabled. Set CODE_MANAGE_ALLOW_TERMINAL=1 to enable.' },
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

+    // Validate cwd is within CODE_BASE_PATH
+    const desiredCwd = typeof cwd === 'string' ? cwd : CODE_BASE_PATH;
+    const resolvedCwd = path.resolve(desiredCwd);
+    if (!resolvedCwd.startsWith(CODE_BASE_PATH + path.sep) && resolvedCwd !== CODE_BASE_PATH) {
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
           maxBuffer: 1024 * 1024 * 10,
           timeout: 60000,
           env: {
```

---

### 2. CRITICAL: Unrestricted File Path Traversal in README Endpoint

**File:** `app/api/projects/readme/route.ts`
**Lines:** 9-29
**Severity:** CRITICAL
**CWE:** CWE-22 (Path Traversal)

**Description:**
The README endpoint accepts a `path` query parameter with NO validation against the CODE_BASE_PATH boundary. An attacker can read README files from anywhere on the system.

**Attack Example:**
```
GET /api/projects/readme?path=/etc
GET /api/projects/readme?path=../../../etc
```

**Current Vulnerable Code:**
```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get('path');  // No validation!

  // ... later ...
  const filePath = path.join(projectPath, filename);  // Can be ANY path
```

**Patch-Ready Diff:**
```diff
--- a/app/api/projects/readme/route.ts
+++ b/app/api/projects/readme/route.ts
@@ -1,6 +1,9 @@
 import { NextResponse } from 'next/server';
 import fs from 'fs/promises';
 import path from 'path';
+import { getCodeBasePath } from '@/lib/scanner';
+
+const CODE_BASE_PATH = getCodeBasePath();

 const README_FILES = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];

@@ -15,9 +18,18 @@ export async function GET(request: Request) {
     );
   }

+  // Validate path is within CODE_BASE_PATH
+  const resolvedPath = path.resolve(projectPath);
+  if (!resolvedPath.startsWith(CODE_BASE_PATH + path.sep) && resolvedPath !== CODE_BASE_PATH) {
+    return NextResponse.json(
+      { error: 'Invalid path' },
+      { status: 403 }
+    );
+  }
+
   try {
     for (const filename of README_FILES) {
-      const filePath = path.join(projectPath, filename);
+      const filePath = path.join(resolvedPath, filename);
       try {
         const content = await fs.readFile(filePath, 'utf-8');
         return NextResponse.json({ content, filename });
```

---

### 3. HIGH: Symlink Attack Vulnerability in File Read Endpoint

**File:** `app/api/file/route.ts`
**Lines:** 20-27
**Severity:** HIGH
**CWE:** CWE-59 (Improper Link Resolution Before File Access)

**Description:**
The file endpoint uses `path.resolve()` followed by a string prefix check. This is vulnerable to symlink attacks because `path.resolve()` doesn't follow symlinks.

**Attack Scenario:**
```
# Attacker creates symlink inside CODE_BASE_PATH
/Users/cliff/Desktop/_code/malicious_link -> /etc/passwd

# Request passes validation but reads /etc/passwd
GET /api/file?path=/Users/cliff/Desktop/_code/malicious_link
```

**Current Vulnerable Code:**
```typescript
const resolvedPath = path.resolve(filePath);
if (!resolvedPath.startsWith(CODE_BASE_PATH + '/')) {
  return NextResponse.json(
    { error: 'Invalid path' },
    { status: 403 }
  );
}
// File read follows symlink to protected file!
```

**Patch-Ready Diff:**
```diff
--- a/app/api/file/route.ts
+++ b/app/api/file/route.ts
@@ -17,13 +17,33 @@ export async function GET(request: Request) {
   }

   try {
-    const resolvedPath = path.resolve(filePath);
-    if (!resolvedPath.startsWith(CODE_BASE_PATH + '/')) {
+    // Use realpath to resolve symlinks before validation
+    let baseReal: string;
+    let resolvedPath: string;
+    try {
+      baseReal = await fs.realpath(CODE_BASE_PATH);
+      resolvedPath = await fs.realpath(path.resolve(filePath));
+    } catch {
+      return NextResponse.json(
+        { error: 'File not found' },
+        { status: 404 }
+      );
+    }
+
+    if (resolvedPath !== baseReal && !resolvedPath.startsWith(baseReal + path.sep)) {
       return NextResponse.json(
         { error: 'Invalid path' },
         { status: 403 }
       );
     }

+    // Verify it's a file, not a directory
+    const stats = await fs.stat(resolvedPath);
+    if (!stats.isFile()) {
+      return NextResponse.json(
+        { error: 'Path is not a file' },
+        { status: 400 }
+      );
+    }
+
     const content = await fs.readFile(resolvedPath, 'utf-8');
     return NextResponse.json({ content });
```

---

### 4. HIGH: Unrestricted Filesystem Move Operations

**File:** `app/api/actions/move/route.ts`
**Lines:** 16-54
**Severity:** HIGH
**CWE:** CWE-22 (Path Traversal)

**Description:**
The move endpoint accepts `projectPath` with insufficient validation. An attacker could move directories from outside CODE_BASE_PATH into it, or exploit symlinks.

**Current Vulnerable Code:**
```typescript
const projectName = path.basename(projectPath);
// NO VALIDATION that projectPath is within CODE_BASE_PATH
await fs.rename(projectPath, targetPath);  // Uses untrusted projectPath!
```

**Patch-Ready Diff:**
```diff
--- a/app/api/actions/move/route.ts
+++ b/app/api/actions/move/route.ts
@@ -23,6 +23,33 @@ export async function POST(request: Request) {
       );
     }

+    // Validate newStatus is a valid status
+    if (typeof newStatus !== 'string' || !(newStatus in STATUS_FOLDERS)) {
+      return NextResponse.json(
+        { error: 'Invalid status' },
+        { status: 400 }
+      );
+    }
+
+    // Validate projectPath is within CODE_BASE_PATH
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
+    // Verify project exists and is a directory
+    const projectStats = await fs.stat(resolvedProjectPath);
+    if (!projectStats.isDirectory()) {
+      return NextResponse.json(
+        { error: 'Project path is not a directory' },
+        { status: 400 }
+      );
+    }
+
-    const projectName = path.basename(projectPath);
+    const projectName = path.basename(resolvedProjectPath);

     // Determine target directory
     const statusFolder = STATUS_FOLDERS[newStatus as ProjectStatus];
@@ -42,7 +69,7 @@ export async function POST(request: Request) {
     }

     // Move the project
-    await fs.rename(projectPath, targetPath);
+    await fs.rename(resolvedProjectPath, targetPath);
```

---

### 5. HIGH: Input Validation Missing in PATCH Project Metadata

**File:** `app/api/projects/[slug]/route.ts`
**Lines:** 48-74
**Severity:** HIGH
**CWE:** CWE-20 (Improper Input Validation)

**Description:**
The PATCH endpoint accepts arbitrary values without type checking, potentially corrupting config files or causing runtime errors.

**Attack Example:**
```json
PATCH /api/projects/myproject
{
  "status": "invalid_status",
  "customName": 12345,
  "tags": "not_an_array",
  "notes": { "malicious": "object" }
}
```

**Patch-Ready Diff:**
```diff
--- a/app/api/projects/[slug]/route.ts
+++ b/app/api/projects/[slug]/route.ts
@@ -48,15 +48,51 @@ export async function PATCH(
     const body = await request.json();
     const metadata: Partial<ProjectMetadata> = {};

-    if (body.status) metadata.status = body.status;
-    if (body.customName !== undefined) metadata.customName = body.customName;
-    if (body.customDescription !== undefined) metadata.customDescription = body.customDescription;
-    if (body.tags !== undefined) metadata.tags = body.tags;
-    if (body.notes !== undefined) metadata.notes = body.notes;
+    const VALID_STATUSES = ['active', 'crawlers', 'icebox', 'archived'];
+
+    if (body.status !== undefined) {
+      if (typeof body.status !== 'string' || !VALID_STATUSES.includes(body.status)) {
+        return NextResponse.json(
+          { error: 'Invalid status. Must be one of: ' + VALID_STATUSES.join(', ') },
+          { status: 400 }
+        );
+      }
+      metadata.status = body.status;
+    }
+
+    if (body.customName !== undefined) {
+      if (typeof body.customName !== 'string') {
+        return NextResponse.json({ error: 'customName must be a string' }, { status: 400 });
+      }
+      metadata.customName = body.customName;
+    }
+
+    if (body.customDescription !== undefined) {
+      if (typeof body.customDescription !== 'string') {
+        return NextResponse.json({ error: 'customDescription must be a string' }, { status: 400 });
+      }
+      metadata.customDescription = body.customDescription;
+    }
+
+    if (body.tags !== undefined) {
+      if (!Array.isArray(body.tags) || !body.tags.every((tag: unknown) => typeof tag === 'string')) {
+        return NextResponse.json({ error: 'tags must be an array of strings' }, { status: 400 });
+      }
+      metadata.tags = body.tags;
+    }
+
+    if (body.notes !== undefined) {
+      if (typeof body.notes !== 'string') {
+        return NextResponse.json({ error: 'notes must be a string' }, { status: 400 });
+      }
+      metadata.notes = body.notes;
+    }

     await setProjectMetadata(slug, metadata);
```

---

## Medium Severity Issues

### 6. MEDIUM: Hardcoded Paths Reduce Portability

**Files:**
- `lib/scanner.ts:5`
- `app/api/file/route.ts:7`
- `app/api/actions/move/route.ts:7`
- `app/api/actions/open-editor/route.ts:8`
- `app/api/actions/open-finder/route.ts:8`

**Severity:** MEDIUM
**CWE:** CWE-426 (Untrusted Search Path)

**Description:**
CODE_BASE_PATH is hardcoded to `/Users/cliff/Desktop/_code` in multiple files, making deployment to other machines impossible.

**Recommendation:**
Centralize in environment configuration:

```typescript
// .env.local
CODE_BASE_PATH=/Users/cliff/Desktop/_code

// lib/scanner.ts - export helper
export function getCodeBasePath(): string {
  return process.env.CODE_BASE_PATH || '/Users/cliff/Desktop/_code';
}

// All other files - import and use
import { getCodeBasePath } from '@/lib/scanner';
const CODE_BASE_PATH = getCodeBasePath();
```

---

### 7. MEDIUM: Git Worktree Support Missing

**File:** `lib/scanner.ts`
**Lines:** 187-219
**Severity:** MEDIUM

**Description:**
The git info reader assumes `.git` is always a directory. In git worktrees, `.git` is a file pointing to the actual git directory.

**Patch-Ready Diff:**
```diff
--- a/lib/scanner.ts
+++ b/lib/scanner.ts
@@ -187,10 +187,24 @@ async function getGitInfo(projectPath: string): Promise<GitInfo> {
   const gitPath = path.join(projectPath, '.git');
-  if (!(await fileExists(gitPath))) {
-    return { hasGit: false };
+
+  let gitDir = gitPath;
+  try {
+    const gitStat = await fs.stat(gitPath);
+    if (gitStat.isFile()) {
+      // This is a git worktree - .git is a file pointing to the real git dir
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
   }

   let branch: string | undefined;
   let remote: string | undefined;

   // Read current branch from HEAD
-  const headContent = await readTextFile(path.join(gitPath, 'HEAD'));
+  const headContent = await readTextFile(path.join(gitDir, 'HEAD'));
```

---

### 8. MEDIUM: Grade Counting Logic Error

**File:** `components/dashboard/CodeHealthSection.tsx`
**Lines:** 52-53
**Severity:** MEDIUM
**CWE:** CWE-1025 (Comparison Using Wrong Factors)

**Description:**
Projects with a grade of 0 are incorrectly classified as "without grades" because 0 is falsy in JavaScript.

**Current Vulnerable Code:**
```typescript
const projectsWithGrades = projects.filter(p => p.rcodegen?.latestGrade != null);
const projectsWithoutGrades = projects.filter(p => !p.rcodegen?.latestGrade);
// Grade 0 is falsy, so filtered into projectsWithoutGrades!
```

**Patch-Ready Diff:**
```diff
--- a/components/dashboard/CodeHealthSection.tsx
+++ b/components/dashboard/CodeHealthSection.tsx
@@ -52,7 +52,7 @@ export function CodeHealthSection() {
   const projectsWithGrades = projects.filter(p => p.rcodegen?.latestGrade != null);
-  const projectsWithoutGrades = projects.filter(p => !p.rcodegen?.latestGrade);
+  const projectsWithoutGrades = projects.filter(p => p.rcodegen?.latestGrade == null);
```

---

## Low Severity Issues

### 9. LOW: ESLint Configuration Version Mismatch

**File:** `package.json`
**Lines:** 16, 26
**Severity:** LOW

**Issue:**
```json
"next": "^16.1.4",
"eslint-config-next": "14.2.33"  // Should align with Next 16
```

**Fix:** Update to `"eslint-config-next": "^16"`

---

### 10. LOW: Incomplete Crawlers Status Support

**Files:**
- `components/settings/SettingsPanel.tsx`
- `components/actions/ActionsMenu.tsx`

**Severity:** LOW

**Description:**
The "crawlers" status is supported in the backend but not fully integrated into UI settings and default status options.

---

## Positive Observations

1. **Good separation of concerns** - API routes, lib utilities, and components are well-organized
2. **TypeScript usage** - Type safety throughout the codebase
3. **React best practices** - Proper hooks usage and component patterns
4. **Safe subprocess calls** - `execFile` used instead of `exec` for open-editor/open-finder endpoints (prevents shell injection)
5. **Error handling** - Try/catch blocks present across endpoints
6. **No vulnerable dependencies** - Package audit shows no known vulnerabilities

---

## Recommendations for Deployment

**DO NOT deploy this application to a public-facing server without:**

1. Implementing all CRITICAL and HIGH severity fixes above
2. Adding authentication (OAuth, JWT, or API key)
3. Running behind a WAF (Web Application Firewall)
4. Implementing rate limiting
5. Adding request logging and monitoring
6. Setting up proper CORS policies
7. Using HTTPS/TLS encryption

**Current safe deployment scope:** Localhost or trusted internal networks only

---

## Remediation Priority

### IMMEDIATE (Within 24 hours):
1. Disable or feature-gate the terminal endpoint
2. Add path validation to README endpoint
3. Fix symlink vulnerabilities with `fs.realpath()`
4. Validate move endpoint inputs

### SHORT TERM (Within 1 week):
5. Add input validation to PATCH endpoint
6. Fix git worktree support
7. Centralize CODE_BASE_PATH configuration
8. Add environment variable support

### MEDIUM TERM (Within 1 month):
9. Implement authentication mechanism
10. Add rate limiting
11. Add CSRF protection
12. Add comprehensive logging
13. Add API versioning

---

## Conclusion

The Code Management application demonstrates good architectural patterns and development practices but contains multiple **critical security vulnerabilities** that must be addressed before any exposure beyond local development. The most critical issue is the unauthenticated arbitrary command execution endpoint, which poses an immediate risk of full system compromise.

**Final Assessment: REQUIRES IMMEDIATE REMEDIATION BEFORE PRODUCTION USE**

---

*Report generated by Claude Opus 4.5 on 2026-01-25*
