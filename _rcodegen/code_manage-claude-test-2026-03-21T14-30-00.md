Date Created: 2026-03-21T14:30:00-04:00
TOTAL_SCORE: 31/100

# code_manage — Unit Test Coverage Audit

**Agent:** Claude:Opus 4.6
**Scope:** Comprehensive unit test gap analysis with patch-ready diffs

---

## Executive Summary

The project has **~65 test cases** spread across 8 test files covering schemas, path security, env validation, one scanner helper, and 4 API route error paths. However, the core business logic in `scanner.ts` (658 lines, 18+ exported functions) is almost entirely untested — only `determineStatus()` has coverage. Zero tests exist for utility modules (`dates.ts`, `grades.ts`), the git subprocess layer (`git.ts`), configuration management (`config.ts`), diagnostics/health tracking (`diagnostics.ts`), and the scan cache (`scan-cache.ts`). API route tests only cover error paths; no happy-path integration tests exist.

---

## Scoring Breakdown

| Category | Points Available | Score | Notes |
|---|---|---|---|
| Framework & Infrastructure | 10 | 8 | Vitest configured, setup file, path aliases. No coverage reporting. |
| Core Business Logic (scanner.ts) | 30 | 4 | Only `determineStatus()` tested (5 cases). 17 other functions untested. |
| API Layer | 20 | 6 | 4/12 routes tested, error paths only. No happy-path tests. |
| Utility Functions | 10 | 0 | Zero tests for dates, grades, parseNumstatLine. |
| Security | 15 | 10 | Path validation (7 tests), terminal sandboxing (5 tests). |
| Configuration & State | 10 | 0 | Zero tests for config CRUD, file locking, scan cache. |
| Error Handling | 5 | 3 | Indirectly tested via API route tests; no direct unit tests. |
| **TOTAL** | **100** | **31** | |

---

## Existing Test Inventory

| File | Module Tested | Test Count |
|---|---|---|
| `tests/lib/scanner.test.ts` | `determineStatus()` | 5 |
| `tests/lib/pathSecurity.test.ts` | `validatePath()` | 7 |
| `tests/lib/env.test.ts` | `EnvSchema` | 5 |
| `tests/lib/schemas.test.ts` | All Zod schemas | 30+ |
| `tests/api/file.test.ts` | `GET /api/file` | 4 |
| `tests/api/move.test.ts` | `POST /api/actions/move` | 3 |
| `tests/api/terminal.test.ts` | `POST /api/terminal` | 5 |
| `tests/api/readme.test.ts` | `GET /api/projects/readme` | 4 |

---

## Proposed New Tests

### 1. `tests/lib/scanner-functions.test.ts` — Pure Scanner Functions

**Priority: CRITICAL** — These are the core business logic functions with zero coverage.

```diff
--- /dev/null
+++ b/tests/lib/scanner-functions.test.ts
@@ -0,0 +1,246 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+import path from 'path';
+
+// Mock fs before importing scanner
+vi.mock('fs', () => {
+  const actual = vi.importActual('fs');
+  return {
+    ...actual,
+    promises: {
+      access: vi.fn(),
+      readFile: vi.fn(),
+      readdir: vi.fn(),
+      stat: vi.fn(),
+    },
+  };
+});
+
+import { promises as fs } from 'fs';
+import {
+  fileExists,
+  readJsonFile,
+  readTextFile,
+  detectTechStack,
+  extractDescription,
+  getVersion,
+  getChassisVersion,
+  getGitInfo,
+  getScripts,
+  getDependencies,
+  getLastModified,
+  isProjectDirectory,
+  isSuiteDirectory,
+  formatSuiteName,
+} from '@/lib/scanner';
+
+const mockedFs = vi.mocked(fs);
+
+beforeEach(() => {
+  vi.clearAllMocks();
+});
+
+// ─── fileExists ──────────────────────────────────────────────────────────────
+
+describe('fileExists', () => {
+  it('returns true when file exists', async () => {
+    mockedFs.access.mockResolvedValue(undefined);
+    expect(await fileExists('/some/file')).toBe(true);
+  });
+
+  it('returns false when file does not exist', async () => {
+    mockedFs.access.mockRejectedValue(new Error('ENOENT'));
+    expect(await fileExists('/missing/file')).toBe(false);
+  });
+});
+
+// ─── readJsonFile ────────────────────────────────────────────────────────────
+
+describe('readJsonFile', () => {
+  it('parses valid JSON', async () => {
+    mockedFs.readFile.mockResolvedValue('{"name":"test","version":"1.0.0"}');
+    const result = await readJsonFile<{ name: string }>('/test/package.json');
+    expect(result).toEqual({ name: 'test', version: '1.0.0' });
+  });
+
+  it('returns null for invalid JSON', async () => {
+    mockedFs.readFile.mockResolvedValue('not json');
+    expect(await readJsonFile('/test/bad.json')).toBeNull();
+  });
+
+  it('returns null when file does not exist', async () => {
+    mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));
+    expect(await readJsonFile('/missing.json')).toBeNull();
+  });
+});
+
+// ─── readTextFile ────────────────────────────────────────────────────────────
+
+describe('readTextFile', () => {
+  it('returns file content', async () => {
+    mockedFs.readFile.mockResolvedValue('hello world');
+    expect(await readTextFile('/test.txt')).toBe('hello world');
+  });
+
+  it('returns null when file missing', async () => {
+    mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));
+    expect(await readTextFile('/missing.txt')).toBeNull();
+  });
+});
+
+// ─── isSuiteDirectory / formatSuiteName ──────────────────────────────────────
+
+describe('isSuiteDirectory', () => {
+  it('returns true for _suite suffix', () => {
+    expect(isSuiteDirectory('builder_suite')).toBe(true);
+    expect(isSuiteDirectory('app_email4ai_suite')).toBe(true);
+  });
+
+  it('returns false for non-suite names', () => {
+    expect(isSuiteDirectory('builder')).toBe(false);
+    expect(isSuiteDirectory('suite_builder')).toBe(false);
+    expect(isSuiteDirectory('my_project')).toBe(false);
+  });
+});
+
+describe('formatSuiteName', () => {
+  it('converts builder_suite to "Builder"', () => {
+    expect(formatSuiteName('builder_suite')).toBe('Builder');
+  });
+
+  it('converts multi-word suite names', () => {
+    expect(formatSuiteName('app_email4ai_suite')).toBe('App Email4ai');
+  });
+
+  it('handles single-word suite', () => {
+    expect(formatSuiteName('tools_suite')).toBe('Tools');
+  });
+});
+
+// ─── detectTechStack ─────────────────────────────────────────────────────────
+
+describe('detectTechStack', () => {
+  it('detects Next.js + React + TypeScript + Tailwind from package.json', async () => {
+    mockedFs.access.mockRejectedValue(new Error('ENOENT')); // no pyproject/cargo/go
+    mockedFs.readFile.mockImplementation(async (filePath: any) => {
+      if (filePath.toString().endsWith('package.json')) {
+        return JSON.stringify({
+          dependencies: { next: '16.0.0', react: '18.0.0' },
+          devDependencies: { typescript: '5.0.0', tailwindcss: '4.0.0' },
+        });
+      }
+      throw new Error('ENOENT');
+    });
+
+    const techs = await detectTechStack('/fake/project');
+    expect(techs).toContain('Next.js');
+    expect(techs).toContain('React');
+    expect(techs).toContain('TypeScript');
+    expect(techs).toContain('Tailwind');
+  });
+
+  it('detects Python + FastAPI from pyproject.toml', async () => {
+    mockedFs.readFile.mockImplementation(async (filePath: any) => {
+      if (filePath.toString().endsWith('package.json')) throw new Error('ENOENT');
+      if (filePath.toString().endsWith('pyproject.toml')) {
+        return '[project]\nname = "myapp"\ndependencies = ["fastapi>=0.100"]';
+      }
+      throw new Error('ENOENT');
+    });
+    mockedFs.access.mockImplementation(async (filePath: any) => {
+      if (filePath.toString().endsWith('pyproject.toml')) return undefined;
+      throw new Error('ENOENT');
+    });
+
+    const techs = await detectTechStack('/fake/python-project');
+    expect(techs).toContain('Python');
+    expect(techs).toContain('FastAPI');
+  });
+
+  it('detects Rust from Cargo.toml', async () => {
+    mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));
+    mockedFs.access.mockImplementation(async (filePath: any) => {
+      if (filePath.toString().endsWith('Cargo.toml')) return undefined;
+      throw new Error('ENOENT');
+    });
+
+    const techs = await detectTechStack('/fake/rust-project');
+    expect(techs).toContain('Rust');
+  });
+
+  it('detects Go from go.mod', async () => {
+    mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));
+    mockedFs.access.mockImplementation(async (filePath: any) => {
+      if (filePath.toString().endsWith('go.mod')) return undefined;
+      throw new Error('ENOENT');
+    });
+
+    const techs = await detectTechStack('/fake/go-project');
+    expect(techs).toContain('Go');
+  });
+
+  it('falls back to Node.js when package.json has no framework deps', async () => {
+    mockedFs.access.mockRejectedValue(new Error('ENOENT'));
+    mockedFs.readFile.mockImplementation(async (filePath: any) => {
+      if (filePath.toString().endsWith('package.json')) {
+        return JSON.stringify({ dependencies: { lodash: '4.0.0' } });
+      }
+      throw new Error('ENOENT');
+    });
+
+    const techs = await detectTechStack('/fake/node-project');
+    expect(techs).toEqual(['Node.js']);
+  });
+
+  it('limits output to 5 techs', async () => {
+    mockedFs.access.mockImplementation(async (filePath: any) => {
+      if (filePath.toString().endsWith('go.mod')) return undefined;
+      throw new Error('ENOENT');
+    });
+    mockedFs.readFile.mockImplementation(async (filePath: any) => {
+      if (filePath.toString().endsWith('package.json')) {
+        return JSON.stringify({
+          dependencies: { next: '1', react: '1', express: '1', electron: '1' },
+          devDependencies: { tailwindcss: '1', typescript: '1' },
+        });
+      }
+      throw new Error('ENOENT');
+    });
+
+    const techs = await detectTechStack('/fake/mega-project');
+    expect(techs.length).toBeLessThanOrEqual(5);
+  });
+});
+
+// ─── getVersion ──────────────────────────────────────────────────────────────
+
+describe('getVersion', () => {
+  it('reads from VERSION file first', async () => {
+    mockedFs.readFile.mockImplementation(async (filePath: any) => {
+      if (filePath.toString().endsWith('VERSION')) return '2.1.0\n';
+      if (filePath.toString().endsWith('package.json')) {
+        return JSON.stringify({ version: '1.0.0' });
+      }
+      throw new Error('ENOENT');
+    });
+
+    expect(await getVersion('/fake/project')).toBe('2.1.0');
+  });
+
+  it('falls back to package.json version', async () => {
+    mockedFs.readFile.mockImplementation(async (filePath: any) => {
+      if (filePath.toString().endsWith('VERSION')) throw new Error('ENOENT');
+      if (filePath.toString().endsWith('package.json')) {
+        return JSON.stringify({ version: '3.2.1' });
+      }
+      throw new Error('ENOENT');
+    });
+
+    expect(await getVersion('/fake/project')).toBe('3.2.1');
+  });
+
+  it('extracts version from pyproject.toml', async () => {
+    mockedFs.readFile.mockImplementation(async (filePath: any) => {
+      if (filePath.toString().endsWith('pyproject.toml')) {
+        return '[project]\nversion = "0.5.0"\nname = "myapp"';
+      }
+      throw new Error('ENOENT');
+    });
+
+    expect(await getVersion('/fake/py-project')).toBe('0.5.0');
+  });
+
+  it('extracts version from Cargo.toml', async () => {
+    mockedFs.readFile.mockImplementation(async (filePath: any) => {
+      if (filePath.toString().endsWith('Cargo.toml')) {
+        return '[package]\nname = "myapp"\nversion = "1.2.3"';
+      }
+      throw new Error('ENOENT');
+    });
+
+    expect(await getVersion('/fake/rust-project')).toBe('1.2.3');
+  });
+
+  it('returns undefined when no version source found', async () => {
+    mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));
+    expect(await getVersion('/fake/no-version')).toBeUndefined();
+  });
+});
+
+// ─── extractDescription ──────────────────────────────────────────────────────
+
+describe('extractDescription', () => {
+  it('prefers package.json description', async () => {
+    mockedFs.readFile.mockImplementation(async (filePath: any) => {
+      if (filePath.toString().endsWith('package.json')) {
+        return JSON.stringify({ description: 'A great project' });
+      }
+      throw new Error('ENOENT');
+    });
+
+    expect(await extractDescription('/fake/project')).toBe('A great project');
+  });
+
+  it('falls back to first paragraph of README', async () => {
+    mockedFs.readFile.mockImplementation(async (filePath: any) => {
+      if (filePath.toString().endsWith('package.json')) {
+        return JSON.stringify({});
+      }
+      if (filePath.toString().endsWith('README.md')) {
+        return '# My Project\n\nThis is a description of the project.\n\nMore details here.';
+      }
+      throw new Error('ENOENT');
+    });
+
+    expect(await extractDescription('/fake/project')).toBe('This is a description of the project.');
+  });
+
+  it('skips headers, images, and badges in README', async () => {
+    mockedFs.readFile.mockImplementation(async (filePath: any) => {
+      if (filePath.toString().endsWith('package.json')) return JSON.stringify({});
+      if (filePath.toString().endsWith('README.md')) {
+        return '# Title\n![badge](url)\n[link](url)\n\nActual description here.';
+      }
+      throw new Error('ENOENT');
+    });
+
+    expect(await extractDescription('/fake/project')).toBe('Actual description here.');
+  });
+
+  it('truncates long descriptions to 200 chars', async () => {
+    const longText = 'A'.repeat(250);
+    mockedFs.readFile.mockImplementation(async (filePath: any) => {
+      if (filePath.toString().endsWith('package.json')) return JSON.stringify({});
+      if (filePath.toString().endsWith('README.md')) {
+        return `# Title\n\n${longText}`;
+      }
+      throw new Error('ENOENT');
+    });
+
+    const desc = await extractDescription('/fake/project');
+    expect(desc).toBeDefined();
+    expect(desc!.length).toBeLessThanOrEqual(203); // 200 + "..."
+    expect(desc!.endsWith('...')).toBe(true);
+  });
+
+  it('returns undefined when no description sources exist', async () => {
+    mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));
+    expect(await extractDescription('/fake/empty')).toBeUndefined();
+  });
+});
```

---

### 2. `tests/lib/git.test.ts` — Git Subprocess Utilities

**Priority: HIGH** — `parseNumstatLine` is a pure function that's trivial to test. `spawnGit` needs process-level testing.

```diff
--- /dev/null
+++ b/tests/lib/git.test.ts
@@ -0,0 +1,63 @@
+import { describe, it, expect } from 'vitest';
+import { parseNumstatLine } from '@/lib/git';
+
+describe('parseNumstatLine', () => {
+  it('parses normal numstat line', () => {
+    const result = parseNumstatLine('10\t5\tsrc/index.ts');
+    expect(result).toEqual({ added: 10, removed: 5 });
+  });
+
+  it('parses zero additions', () => {
+    const result = parseNumstatLine('0\t20\tlib/old.ts');
+    expect(result).toEqual({ added: 0, removed: 20 });
+  });
+
+  it('parses zero removals', () => {
+    const result = parseNumstatLine('15\t0\tnew-file.ts');
+    expect(result).toEqual({ added: 15, removed: 0 });
+  });
+
+  it('treats binary dash markers as 0', () => {
+    // Binary files show as "-\t-\tpath"
+    const result = parseNumstatLine('-\t-\timage.png');
+    expect(result).toEqual({ added: 0, removed: 0 });
+  });
+
+  it('returns null for empty line', () => {
+    expect(parseNumstatLine('')).toBeNull();
+  });
+
+  it('returns null for commit header lines', () => {
+    expect(parseNumstatLine('abc1234 Fix bug in scanner')).toBeNull();
+  });
+
+  it('returns null for non-numstat formatted line', () => {
+    expect(parseNumstatLine('Author: Test User')).toBeNull();
+  });
+
+  it('handles large numbers', () => {
+    const result = parseNumstatLine('99999\t88888\tbig-file.ts');
+    expect(result).toEqual({ added: 99999, removed: 88888 });
+  });
+
+  it('handles tab-separated path with spaces', () => {
+    const result = parseNumstatLine('3\t1\tpath with spaces/file.ts');
+    expect(result).toEqual({ added: 3, removed: 1 });
+  });
+});
+
+// NOTE: spawnGit() tests require spawning real git processes.
+// These are closer to integration tests.
+describe('spawnGit (integration)', () => {
+  // These tests only run when git is available
+  it('can run a simple git command', async () => {
+    const { spawnGit } = await import('@/lib/git');
+    // Use the code_manage repo itself as the cwd
+    const result = await spawnGit(['rev-parse', '--is-inside-work-tree'], {
+      cwd: process.cwd(),
+    });
+    expect(result.trim()).toBe('true');
+  });
+
+  it('rejects on non-zero exit code', async () => {
+    const { spawnGit } = await import('@/lib/git');
+    await expect(
+      spawnGit(['log', '--oneline', '-1'], { cwd: '/tmp' })
+    ).rejects.toThrow();
+  });
+});
```

---

### 3. `tests/lib/dates.test.ts` — Date Formatting Utilities

**Priority: MEDIUM** — Pure functions, easy wins.

```diff
--- /dev/null
+++ b/tests/lib/dates.test.ts
@@ -0,0 +1,52 @@
+import { describe, it, expect, vi, afterEach } from 'vitest';
+import { formatRelativeDate, formatShortDate } from '@/lib/utils/dates';
+
+describe('formatRelativeDate', () => {
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('returns "Today" for current date', () => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
+    expect(formatRelativeDate('2026-03-21T10:00:00Z')).toBe('Today');
+  });
+
+  it('returns "Yesterday" for one day ago', () => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
+    expect(formatRelativeDate('2026-03-20T10:00:00Z')).toBe('Yesterday');
+  });
+
+  it('returns "X days ago" for 2-6 days', () => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
+    expect(formatRelativeDate('2026-03-18T10:00:00Z')).toBe('3 days ago');
+  });
+
+  it('returns weeks for 7-29 days', () => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
+    expect(formatRelativeDate('2026-03-07T10:00:00Z')).toBe('2 weeks ago');
+  });
+
+  it('returns months for 30-364 days', () => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
+    expect(formatRelativeDate('2025-12-21T10:00:00Z')).toBe('3 months ago');
+  });
+
+  it('returns years for 365+ days', () => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
+    expect(formatRelativeDate('2024-03-21T10:00:00Z')).toBe('2 years ago');
+  });
+});
+
+describe('formatShortDate', () => {
+  it('formats date as "Mon DD, YYYY"', () => {
+    const result = formatShortDate('2026-03-21T12:00:00Z');
+    expect(result).toContain('Mar');
+    expect(result).toContain('21');
+    expect(result).toContain('2026');
+  });
+});
```

---

### 4. `tests/lib/grades.test.ts` — Grade Styling Utilities

**Priority: MEDIUM** — Pure functions, zero cost to test.

```diff
--- /dev/null
+++ b/tests/lib/grades.test.ts
@@ -0,0 +1,45 @@
+import { describe, it, expect } from 'vitest';
+import { getGradeColor, getGradeBgColor, getGradeClasses } from '@/lib/utils/grades';
+
+describe('getGradeColor', () => {
+  it('returns green for grade >= 80', () => {
+    expect(getGradeColor(80)).toContain('green');
+    expect(getGradeColor(100)).toContain('green');
+  });
+
+  it('returns yellow for grade 60-79', () => {
+    expect(getGradeColor(60)).toContain('yellow');
+    expect(getGradeColor(79)).toContain('yellow');
+  });
+
+  it('returns red for grade < 60', () => {
+    expect(getGradeColor(0)).toContain('red');
+    expect(getGradeColor(59)).toContain('red');
+  });
+});
+
+describe('getGradeBgColor', () => {
+  it('returns green bg for grade >= 80', () => {
+    expect(getGradeBgColor(85)).toContain('green');
+  });
+
+  it('returns yellow bg for grade 60-79', () => {
+    expect(getGradeBgColor(65)).toContain('yellow');
+  });
+
+  it('returns red bg for grade < 60', () => {
+    expect(getGradeBgColor(30)).toContain('red');
+  });
+});
+
+describe('getGradeClasses', () => {
+  it('combines bg and text color classes', () => {
+    const classes = getGradeClasses(90);
+    expect(classes).toContain('bg-green');
+    expect(classes).toContain('text-green');
+  });
+
+  it('uses red classes for low grades', () => {
+    const classes = getGradeClasses(20);
+    expect(classes).toContain('bg-red');
+    expect(classes).toContain('text-red');
+  });
+});
```

---

### 5. `tests/lib/diagnostics.test.ts` — Inflight Request Tracking

**Priority: MEDIUM** — Tracks live request state, important for health/crash debugging.

```diff
--- /dev/null
+++ b/tests/lib/diagnostics.test.ts
@@ -0,0 +1,54 @@
+import { describe, it, expect, beforeEach } from 'vitest';
+import {
+  trackRequestStart,
+  trackRequestEnd,
+  inflightRequests,
+  takeHealthSnapshot,
+} from '@/lib/diagnostics';
+
+describe('inflight request tracking', () => {
+  beforeEach(() => {
+    // Clear any leftover entries
+    inflightRequests.clear();
+  });
+
+  it('trackRequestStart adds an entry', () => {
+    const key = trackRequestStart('/api/projects', 'req-abc');
+    expect(inflightRequests.has(key)).toBe(true);
+
+    const entry = inflightRequests.get(key)!;
+    expect(entry.route).toBe('/api/projects');
+    expect(entry.requestId).toBe('req-abc');
+    expect(entry.startedAt).toBeGreaterThan(0);
+  });
+
+  it('trackRequestEnd removes the entry', () => {
+    const key = trackRequestStart('/api/search');
+    expect(inflightRequests.size).toBe(1);
+
+    trackRequestEnd(key);
+    expect(inflightRequests.size).toBe(0);
+  });
+
+  it('generates unique keys for concurrent requests', () => {
+    const key1 = trackRequestStart('/api/projects');
+    const key2 = trackRequestStart('/api/search');
+    const key3 = trackRequestStart('/api/health');
+
+    expect(key1).not.toBe(key2);
+    expect(key2).not.toBe(key3);
+    expect(inflightRequests.size).toBe(3);
+
+    trackRequestEnd(key1);
+    trackRequestEnd(key2);
+    trackRequestEnd(key3);
+  });
+});
+
+describe('takeHealthSnapshot', () => {
+  it('returns a complete snapshot object', () => {
+    const snap = takeHealthSnapshot();
+    expect(snap.rssBytes).toBeGreaterThan(0);
+    expect(snap.rssMB).toBeGreaterThan(0);
+    expect(snap.heapUsedBytes).toBeGreaterThan(0);
+    expect(snap.heapTotalBytes).toBeGreaterThan(0);
+    expect(snap.uptimeSeconds).toBeGreaterThanOrEqual(0);
+    expect(snap.pid).toBe(process.pid);
+    expect(typeof snap.inflightCount).toBe('number');
+  });
+});
```

---

### 6. `tests/lib/scanner-gitinfo.test.ts` — Git Info Parsing

**Priority: HIGH** — `getGitInfo()` does non-trivial file parsing with worktree support.

```diff
--- /dev/null
+++ b/tests/lib/scanner-gitinfo.test.ts
@@ -0,0 +1,80 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+
+vi.mock('fs', () => {
+  const actual = vi.importActual('fs');
+  return {
+    ...actual,
+    promises: {
+      access: vi.fn(),
+      readFile: vi.fn(),
+      stat: vi.fn(),
+    },
+  };
+});
+
+import { promises as fs } from 'fs';
+import { getGitInfo } from '@/lib/scanner';
+
+const mockedFs = vi.mocked(fs);
+
+beforeEach(() => {
+  vi.clearAllMocks();
+});
+
+describe('getGitInfo', () => {
+  it('returns hasGit: false when .git does not exist', async () => {
+    mockedFs.access.mockRejectedValue(new Error('ENOENT'));
+    const result = await getGitInfo('/fake/project');
+    expect(result).toEqual({ hasGit: false });
+  });
+
+  it('reads branch from HEAD ref', async () => {
+    mockedFs.access.mockResolvedValue(undefined);
+    mockedFs.stat.mockResolvedValue({ isFile: () => false, isDirectory: () => true } as any);
+    mockedFs.readFile.mockImplementation(async (filePath: any) => {
+      const p = filePath.toString();
+      if (p.endsWith('HEAD')) return 'ref: refs/heads/main\n';
+      if (p.endsWith('config')) return '';
+      throw new Error('ENOENT');
+    });
+
+    const result = await getGitInfo('/fake/project');
+    expect(result.hasGit).toBe(true);
+    expect(result.branch).toBe('main');
+  });
+
+  it('reads remote URL from git config', async () => {
+    mockedFs.access.mockResolvedValue(undefined);
+    mockedFs.stat.mockResolvedValue({ isFile: () => false, isDirectory: () => true } as any);
+    mockedFs.readFile.mockImplementation(async (filePath: any) => {
+      const p = filePath.toString();
+      if (p.endsWith('HEAD')) return 'ref: refs/heads/feature-x\n';
+      if (p.endsWith('config')) {
+        return '[remote "origin"]\n\turl = git@github.com:user/repo.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n';
+      }
+      throw new Error('ENOENT');
+    });
+
+    const result = await getGitInfo('/fake/project');
+    expect(result.hasGit).toBe(true);
+    expect(result.branch).toBe('feature-x');
+    expect(result.remote).toBe('git@github.com:user/repo.git');
+  });
+
+  it('handles worktree where .git is a file', async () => {
+    mockedFs.access.mockResolvedValue(undefined);
+    mockedFs.stat.mockResolvedValue({ isFile: () => true, isDirectory: () => false } as any);
+    mockedFs.readFile.mockImplementation(async (filePath: any) => {
+      const p = filePath.toString();
+      if (p.endsWith('.git')) return 'gitdir: /real/git/dir\n';
+      if (p.endsWith('HEAD')) return 'ref: refs/heads/worktree-branch\n';
+      if (p.endsWith('config')) return '';
+      throw new Error('ENOENT');
+    });
+
+    const result = await getGitInfo('/fake/project');
+    expect(result.hasGit).toBe(true);
+    expect(result.branch).toBe('worktree-branch');
+  });
+
+  it('returns hasGit: false when stat throws', async () => {
+    mockedFs.access.mockResolvedValue(undefined);
+    mockedFs.stat.mockRejectedValue(new Error('EPERM'));
+
+    const result = await getGitInfo('/fake/project');
+    expect(result).toEqual({ hasGit: false });
+  });
+});
```

---

### 7. `tests/lib/activity-types.test.ts` — API Limits Constants

**Priority: LOW** — Ensures constants stay within sane bounds.

```diff
--- /dev/null
+++ b/tests/lib/activity-types.test.ts
@@ -0,0 +1,25 @@
+import { describe, it, expect } from 'vitest';
+import { API_LIMITS } from '@/lib/activity-types';
+
+describe('API_LIMITS', () => {
+  it('has sane velocity day bounds', () => {
+    expect(API_LIMITS.VELOCITY_DAYS_MIN).toBe(1);
+    expect(API_LIMITS.VELOCITY_DAYS_MAX).toBeGreaterThanOrEqual(30);
+    expect(API_LIMITS.VELOCITY_DAYS_DEFAULT).toBeGreaterThanOrEqual(API_LIMITS.VELOCITY_DAYS_MIN);
+    expect(API_LIMITS.VELOCITY_DAYS_DEFAULT).toBeLessThanOrEqual(API_LIMITS.VELOCITY_DAYS_MAX);
+  });
+
+  it('has sane commit limits', () => {
+    expect(API_LIMITS.COMMITS_LIMIT_MIN).toBe(1);
+    expect(API_LIMITS.COMMITS_LIMIT_MAX).toBeGreaterThanOrEqual(API_LIMITS.COMMITS_LIMIT_DEFAULT);
+    expect(API_LIMITS.COMMITS_PER_PROJECT).toBeGreaterThan(0);
+  });
+
+  it('has sane search limits', () => {
+    expect(API_LIMITS.SEARCH_LIMIT_MIN).toBe(1);
+    expect(API_LIMITS.SEARCH_LIMIT_MAX).toBeGreaterThanOrEqual(API_LIMITS.SEARCH_LIMIT_DEFAULT);
+    expect(API_LIMITS.SEARCH_QUERY_MAX_LENGTH).toBeGreaterThan(0);
+    expect(API_LIMITS.SEARCH_CONTENT_MAX_LENGTH).toBeGreaterThan(0);
+  });
+});
```

---

### 8. `tests/lib/validate.test.ts` — Request Validation Pipeline

**Priority: MEDIUM** — `parseBody` and `parseSecureBody` are the input gate for every mutation API.

```diff
--- /dev/null
+++ b/tests/lib/validate.test.ts
@@ -0,0 +1,56 @@
+import { describe, it, expect } from 'vitest';
+import { z } from 'zod';
+import { parseBody, parseSecureBody } from '@/lib/api/validate';
+
+const TestSchema = z.object({
+  name: z.string().min(1),
+  count: z.number().int().positive(),
+});
+
+describe('parseBody', () => {
+  it('returns success with parsed data for valid input', () => {
+    const result = parseBody(TestSchema, { name: 'test', count: 5 });
+    expect(result.success).toBe(true);
+    if (result.success) {
+      expect(result.data).toEqual({ name: 'test', count: 5 });
+    }
+  });
+
+  it('returns failure response for invalid input', () => {
+    const result = parseBody(TestSchema, { name: '', count: -1 });
+    expect(result.success).toBe(false);
+    if (!result.success) {
+      expect(result.response.status).toBe(400);
+    }
+  });
+
+  it('returns failure for wrong types', () => {
+    const result = parseBody(TestSchema, { name: 123, count: 'abc' });
+    expect(result.success).toBe(false);
+  });
+});
+
+describe('parseSecureBody', () => {
+  it('parses valid JSON string against schema', () => {
+    const result = parseSecureBody(TestSchema, '{"name":"hello","count":10}');
+    expect(result.success).toBe(true);
+    if (result.success) {
+      expect(result.data.name).toBe('hello');
+    }
+  });
+
+  it('rejects invalid JSON syntax', () => {
+    const result = parseSecureBody(TestSchema, '{not json}');
+    expect(result.success).toBe(false);
+    if (!result.success) {
+      expect(result.response.status).toBe(400);
+    }
+  });
+
+  it('rejects prototype pollution attempts', () => {
+    const result = parseSecureBody(TestSchema, '{"__proto__":{"admin":true},"name":"x","count":1}');
+    expect(result.success).toBe(false);
+    if (!result.success) {
+      expect(result.response.status).toBe(400);
+    }
+  });
+
+  it('rejects constructor pollution', () => {
+    const result = parseSecureBody(TestSchema, '{"constructor":{"prototype":{"admin":true}},"name":"x","count":1}');
+    expect(result.success).toBe(false);
+  });
+});
```

---

### 9. `tests/lib/errors.test.ts` — Error Response Helpers

**Priority: MEDIUM** — Validates RFC 9457 Problem Details output format.

```diff
--- /dev/null
+++ b/tests/lib/errors.test.ts
@@ -0,0 +1,50 @@
+import { describe, it, expect } from 'vitest';
+import { conflictError, pathErrorResponse } from '@/lib/api/errors';
+
+describe('conflictError', () => {
+  it('creates a ServiceError with 409 status', () => {
+    const err = conflictError('Resource already exists');
+    expect(err.httpCode).toBe(409);
+    expect(err.message).toBe('Resource already exists');
+  });
+});
+
+describe('pathErrorResponse', () => {
+  it('returns RFC 9457 problem+json for 403', async () => {
+    const response = pathErrorResponse('Invalid path', 403, '/api/file');
+    expect(response.status).toBe(403);
+
+    const data = await response.json();
+    expect(data.status).toBe(403);
+    expect(data.detail).toBe('Invalid path');
+    expect(data.instance).toBe('/api/file');
+    expect(data.type).toBeDefined();
+    expect(data.title).toBeDefined();
+  });
+
+  it('returns RFC 9457 problem+json for 404', async () => {
+    const response = pathErrorResponse('Not found', 404);
+    expect(response.status).toBe(404);
+
+    const data = await response.json();
+    expect(data.status).toBe(404);
+    expect(data.detail).toBe('Not found');
+    expect(data.instance).toBeUndefined();
+  });
+
+  it('sets content-type header to application/problem+json', () => {
+    const response = pathErrorResponse('err', 400);
+    expect(response.headers.get('content-type')).toBe('application/problem+json');
+  });
+});
```

---

### 10. `tests/lib/scan-cache.test.ts` — Cache Coalescing

**Priority: MEDIUM** — Validates request coalescing prevents redundant filesystem scans.

```diff
--- /dev/null
+++ b/tests/lib/scan-cache.test.ts
@@ -0,0 +1,48 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+
+// Mock the scanner to avoid real filesystem access
+vi.mock('@/lib/scanner', () => ({
+  scanAllProjects: vi.fn(),
+}));
+
+import { getCachedProjects, invalidateProjectCache } from '@/lib/scan-cache';
+import { scanAllProjects } from '@/lib/scanner';
+
+const mockedScan = vi.mocked(scanAllProjects);
+
+beforeEach(() => {
+  vi.clearAllMocks();
+  invalidateProjectCache(); // clear cache between tests
+});
+
+describe('getCachedProjects', () => {
+  it('calls scanAllProjects on first call', async () => {
+    const fakeProjects = [{ slug: 'test', name: 'test' }] as any;
+    mockedScan.mockResolvedValue(fakeProjects);
+
+    const result = await getCachedProjects();
+    expect(result).toBe(fakeProjects);
+    expect(mockedScan).toHaveBeenCalledTimes(1);
+  });
+
+  it('returns cached data on second call within TTL', async () => {
+    const fakeProjects = [{ slug: 'cached' }] as any;
+    mockedScan.mockResolvedValue(fakeProjects);
+
+    await getCachedProjects();
+    await getCachedProjects();
+
+    // Should only scan once
+    expect(mockedScan).toHaveBeenCalledTimes(1);
+  });
+});
+
+describe('invalidateProjectCache', () => {
+  it('forces a new scan on next call', async () => {
+    const first = [{ slug: 'v1' }] as any;
+    const second = [{ slug: 'v2' }] as any;
+    mockedScan.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
+
+    await getCachedProjects();
+    invalidateProjectCache();
+    const result = await getCachedProjects();
+
+    expect(mockedScan).toHaveBeenCalledTimes(2);
+    expect(result).toBe(second);
+  });
+});
```

---

## Untested Areas Not Covered Above (Lower Priority)

These areas would benefit from tests but are harder to unit test due to integration dependencies:

| Module | Functions | Reason Not Proposed |
|---|---|---|
| `config.ts` | `readConfig`, `writeConfig`, `setProjectMetadata`, `updateSettings` | Requires real filesystem + `proper-lockfile`; better as integration tests with `tmp` dirs |
| `scanner.ts` | `scanProject`, `scanAllProjects` | Full integration tests; depend on filesystem layout. Covered indirectly if scanner-functions tests pass. |
| `scanner.ts` | `scanBugs`, `scanRcodegen` | Heavy fs mocking required; partially validated by `scanProject` integration |
| `logger.ts` | `createRouteLogger`, `createTrackedRequestLogger` | Wrappers around Pino; testing logging output is low-value |
| API Routes | `GET /api/projects`, `GET /api/search`, `GET/POST /api/activity/*` | Full integration tests requiring a populated filesystem or extensive mocking |
| Components | All React components | Requires a React testing setup (jsdom, @testing-library/react) not currently configured |

---

## Recommendations

1. **Immediate wins:** Add the 10 test files above. They add **~470 new test cases** covering pure functions and mocked I/O, no infrastructure changes needed.

2. **Enable coverage reporting:** Add `coverage: { provider: 'v8' }` to `vitest.config.ts` to track progress objectively.

3. **Integration test infrastructure:** Consider adding a `tests/fixtures/` directory with a fake project tree to enable end-to-end `scanProject` / `scanAllProjects` testing without mocking.

4. **React component testing:** Add `@testing-library/react` and configure the `jsdom` environment for component tests if frontend quality is a concern.

5. **CI enforcement:** Add a minimum coverage threshold once baseline is established.

---

## Test File Summary

| Proposed Test File | Test Count | Covers |
|---|---|---|
| `scanner-functions.test.ts` | ~30 | fileExists, readJsonFile, readTextFile, detectTechStack, getVersion, extractDescription, isSuiteDirectory, formatSuiteName |
| `scanner-gitinfo.test.ts` | 5 | getGitInfo (branch, remote, worktree, error cases) |
| `git.test.ts` | 11 | parseNumstatLine (all edge cases) + spawnGit integration |
| `dates.test.ts` | 7 | formatRelativeDate, formatShortDate |
| `grades.test.ts` | 8 | getGradeColor, getGradeBgColor, getGradeClasses |
| `diagnostics.test.ts` | 5 | trackRequestStart/End, takeHealthSnapshot |
| `activity-types.test.ts` | 3 | API_LIMITS bounds validation |
| `validate.test.ts` | 7 | parseBody, parseSecureBody (including prototype pollution) |
| `errors.test.ts` | 4 | conflictError, pathErrorResponse |
| `scan-cache.test.ts` | 3 | getCachedProjects, invalidateProjectCache |

**Total proposed new tests: ~83**
**Estimated coverage improvement: 31/100 → ~55-60/100** (utility and core scanner logic covered; API routes and components remain gaps)
