Date Created: 2026-01-28 13:45:12
TOTAL_SCORE: 18/100

# Code Manage - Unit Test Coverage Analysis

## Executive Summary

This codebase has **zero test infrastructure** and **zero test coverage**. The project is a Next.js 16 application for project management and monitoring with significant business logic in the scanner and configuration modules. The complete absence of testing represents a critical quality gap.

### Current State
- **Test Files**: 0
- **Test Framework**: None configured
- **Test Scripts**: None defined
- **Total Source Files**: 38
- **Lines of Complex Business Logic**: ~1,200+
- **API Routes**: 9 (all untested)

---

## Scoring Breakdown (18/100)

| Category | Max Points | Score | Notes |
|----------|------------|-------|-------|
| Test Coverage | 30 | 0 | 0% code coverage |
| Test Infrastructure | 15 | 0 | No test framework configured |
| Unit Tests | 20 | 0 | No unit tests exist |
| Integration Tests | 15 | 0 | No integration tests |
| API Route Tests | 10 | 0 | No API tests |
| Component Tests | 10 | 0 | No component tests |
| Type Definitions Quality | 10 | 8 | Excellent TypeScript types |
| Code Testability | 10 | 10 | Well-structured, testable code |
| **TOTAL** | **120** | **18** | **18/100** |

---

## Test Infrastructure Setup Required

### Package Dependencies to Add

```json
{
  "devDependencies": {
    "vitest": "^3.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/user-event": "^14.5.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "memfs": "^4.6.0"
  }
}
```

### Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

## Proposed Test Files and Patch-Ready Diffs

### 1. Vitest Configuration

**File: `vitest.config.ts`**

```diff
--- /dev/null
+++ vitest.config.ts
@@ -0,0 +1,26 @@
+import { defineConfig } from 'vitest/config';
+import react from '@vitejs/plugin-react';
+import path from 'path';
+
+export default defineConfig({
+  plugins: [react()],
+  test: {
+    environment: 'jsdom',
+    globals: true,
+    setupFiles: ['./tests/setup.ts'],
+    include: ['tests/**/*.test.{ts,tsx}'],
+    coverage: {
+      provider: 'v8',
+      reporter: ['text', 'html'],
+      exclude: [
+        'node_modules',
+        '.next',
+        'tests/**',
+      ],
+    },
+  },
+  resolve: {
+    alias: {
+      '@': path.resolve(__dirname, '.'),
+    },
+  },
+});
```

---

### 2. Test Setup File

**File: `tests/setup.ts`**

```diff
--- /dev/null
+++ tests/setup.ts
@@ -0,0 +1,20 @@
+import '@testing-library/jest-dom';
+import { vi } from 'vitest';
+
+// Mock localStorage for client components
+const localStorageMock = {
+  getItem: vi.fn(),
+  setItem: vi.fn(),
+  removeItem: vi.fn(),
+  clear: vi.fn(),
+  length: 0,
+  key: vi.fn(),
+};
+
+Object.defineProperty(global, 'localStorage', {
+  value: localStorageMock,
+});
+
+// Reset mocks between tests
+beforeEach(() => {
+  vi.clearAllMocks();
+});
```

---

### 3. Scanner Module Unit Tests (CRITICAL PRIORITY)

**File: `tests/lib/scanner.test.ts`**

```diff
--- /dev/null
+++ tests/lib/scanner.test.ts
@@ -0,0 +1,456 @@
+import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
+import { promises as fs } from 'fs';
+import path from 'path';
+import {
+  fileExists,
+  readJsonFile,
+  readTextFile,
+  detectTechStack,
+  extractDescription,
+  getGitInfo,
+  getVersion,
+  getScripts,
+  getDependencies,
+  getLastModified,
+  scanBugs,
+  scanRcodegen,
+  isProjectDirectory,
+  determineStatus,
+  scanProject,
+} from '@/lib/scanner';
+
+// Mock the fs module
+vi.mock('fs', () => ({
+  promises: {
+    access: vi.fn(),
+    readFile: vi.fn(),
+    readdir: vi.fn(),
+    stat: vi.fn(),
+  },
+}));
+
+const mockFs = vi.mocked(fs);
+
+describe('scanner module', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  describe('fileExists', () => {
+    it('should return true when file exists', async () => {
+      mockFs.access.mockResolvedValueOnce(undefined);
+      const result = await fileExists('/path/to/file');
+      expect(result).toBe(true);
+      expect(mockFs.access).toHaveBeenCalledWith('/path/to/file');
+    });
+
+    it('should return false when file does not exist', async () => {
+      mockFs.access.mockRejectedValueOnce(new Error('ENOENT'));
+      const result = await fileExists('/path/to/nonexistent');
+      expect(result).toBe(false);
+    });
+  });
+
+  describe('readJsonFile', () => {
+    it('should parse and return JSON content', async () => {
+      const mockData = { name: 'test', version: '1.0.0' };
+      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockData));
+
+      const result = await readJsonFile<typeof mockData>('/path/to/file.json');
+      expect(result).toEqual(mockData);
+    });
+
+    it('should return null for invalid JSON', async () => {
+      mockFs.readFile.mockResolvedValueOnce('not valid json');
+      const result = await readJsonFile('/path/to/invalid.json');
+      expect(result).toBeNull();
+    });
+
+    it('should return null when file does not exist', async () => {
+      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
+      const result = await readJsonFile('/path/to/missing.json');
+      expect(result).toBeNull();
+    });
+  });
+
+  describe('readTextFile', () => {
+    it('should return file content as string', async () => {
+      mockFs.readFile.mockResolvedValueOnce('file content here');
+      const result = await readTextFile('/path/to/file.txt');
+      expect(result).toBe('file content here');
+    });
+
+    it('should return null when file does not exist', async () => {
+      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
+      const result = await readTextFile('/path/to/missing.txt');
+      expect(result).toBeNull();
+    });
+  });
+
+  describe('detectTechStack', () => {
+    it('should detect Next.js and React from package.json', async () => {
+      mockFs.access.mockResolvedValue(undefined);
+      mockFs.readFile.mockImplementation(async (filePath) => {
+        if (String(filePath).includes('package.json')) {
+          return JSON.stringify({
+            dependencies: {
+              'next': '^14.0.0',
+              'react': '^18.0.0',
+            },
+          });
+        }
+        throw new Error('ENOENT');
+      });
+
+      const result = await detectTechStack('/project');
+      expect(result).toContain('Next.js');
+      expect(result).toContain('React');
+    });
+
+    it('should detect Python from pyproject.toml', async () => {
+      mockFs.access.mockImplementation(async (filePath) => {
+        if (String(filePath).includes('pyproject.toml')) {
+          return undefined;
+        }
+        throw new Error('ENOENT');
+      });
+      mockFs.readFile.mockImplementation(async (filePath) => {
+        if (String(filePath).includes('pyproject.toml')) {
+          return '[project]\nname = "myproject"\ndependencies = ["fastapi"]';
+        }
+        throw new Error('ENOENT');
+      });
+
+      const result = await detectTechStack('/python-project');
+      expect(result).toContain('Python');
+      expect(result).toContain('FastAPI');
+    });
+
+    it('should detect Rust from Cargo.toml', async () => {
+      mockFs.access.mockImplementation(async (filePath) => {
+        if (String(filePath).includes('Cargo.toml')) {
+          return undefined;
+        }
+        throw new Error('ENOENT');
+      });
+      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
+
+      const result = await detectTechStack('/rust-project');
+      expect(result).toContain('Rust');
+    });
+
+    it('should detect Go from go.mod', async () => {
+      mockFs.access.mockImplementation(async (filePath) => {
+        if (String(filePath).includes('go.mod')) {
+          return undefined;
+        }
+        throw new Error('ENOENT');
+      });
+      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
+
+      const result = await detectTechStack('/go-project');
+      expect(result).toContain('Go');
+    });
+
+    it('should return Node.js as fallback when package.json exists without frameworks', async () => {
+      mockFs.access.mockResolvedValue(undefined);
+      mockFs.readFile.mockImplementation(async (filePath) => {
+        if (String(filePath).includes('package.json')) {
+          return JSON.stringify({
+            dependencies: {},
+          });
+        }
+        throw new Error('ENOENT');
+      });
+
+      const result = await detectTechStack('/plain-node');
+      expect(result).toContain('Node.js');
+    });
+
+    it('should limit tech stack to 5 items', async () => {
+      mockFs.access.mockResolvedValue(undefined);
+      mockFs.readFile.mockImplementation(async (filePath) => {
+        if (String(filePath).includes('package.json')) {
+          return JSON.stringify({
+            dependencies: {
+              'next': '14.0.0',
+              'react': '18.0.0',
+              'express': '4.0.0',
+              'electron': '28.0.0',
+              'tailwindcss': '3.0.0',
+              'typescript': '5.0.0',
+            },
+          });
+        }
+        throw new Error('ENOENT');
+      });
+
+      const result = await detectTechStack('/big-project');
+      expect(result.length).toBeLessThanOrEqual(5);
+    });
+  });
+
+  describe('extractDescription', () => {
+    it('should extract description from package.json', async () => {
+      mockFs.readFile.mockResolvedValueOnce(
+        JSON.stringify({ description: 'A test project description' })
+      );
+
+      const result = await extractDescription('/project');
+      expect(result).toBe('A test project description');
+    });
+
+    it('should extract description from README.md when package.json has none', async () => {
+      mockFs.readFile.mockImplementation(async (filePath) => {
+        if (String(filePath).includes('package.json')) {
+          return JSON.stringify({});
+        }
+        if (String(filePath).includes('README.md')) {
+          return '# Project Title\n\nThis is the project description from readme.';
+        }
+        throw new Error('ENOENT');
+      });
+
+      const result = await extractDescription('/project');
+      expect(result).toBe('This is the project description from readme.');
+    });
+
+    it('should skip headers and images in README', async () => {
+      mockFs.readFile.mockImplementation(async (filePath) => {
+        if (String(filePath).includes('README.md')) {
+          return '# Title\n![badge](url)\n[link](url)\n\nActual description here.';
+        }
+        throw new Error('ENOENT');
+      });
+
+      const result = await extractDescription('/project');
+      expect(result).toBe('Actual description here.');
+    });
+
+    it('should truncate long descriptions to 200 characters', async () => {
+      const longDescription = 'A'.repeat(300);
+      mockFs.readFile.mockImplementation(async (filePath) => {
+        if (String(filePath).includes('README.md')) {
+          return `# Title\n\n${longDescription}`;
+        }
+        throw new Error('ENOENT');
+      });
+
+      const result = await extractDescription('/project');
+      expect(result?.length).toBeLessThanOrEqual(203); // 200 + '...'
+      expect(result).toMatch(/\.\.\.$/);
+    });
+  });
+
+  describe('getGitInfo', () => {
+    it('should return hasGit false when .git does not exist', async () => {
+      mockFs.access.mockRejectedValueOnce(new Error('ENOENT'));
+      const result = await getGitInfo('/project');
+      expect(result).toEqual({ hasGit: false });
+    });
+
+    it('should parse branch from HEAD file', async () => {
+      mockFs.access.mockResolvedValueOnce(undefined);
+      mockFs.readFile.mockImplementation(async (filePath) => {
+        if (String(filePath).includes('HEAD')) {
+          return 'ref: refs/heads/main\n';
+        }
+        throw new Error('ENOENT');
+      });
+
+      const result = await getGitInfo('/project');
+      expect(result.hasGit).toBe(true);
+      expect(result.branch).toBe('main');
+    });
+
+    it('should parse remote URL from config', async () => {
+      mockFs.access.mockResolvedValueOnce(undefined);
+      mockFs.readFile.mockImplementation(async (filePath) => {
+        if (String(filePath).includes('HEAD')) {
+          return 'ref: refs/heads/main\n';
+        }
+        if (String(filePath).includes('config')) {
+          return '[remote "origin"]\n\turl = git@github.com:user/repo.git\n';
+        }
+        throw new Error('ENOENT');
+      });
+
+      const result = await getGitInfo('/project');
+      expect(result.remote).toBe('git@github.com:user/repo.git');
+    });
+  });
+
+  describe('getVersion', () => {
+    it('should read version from VERSION file first', async () => {
+      mockFs.readFile.mockResolvedValueOnce('1.2.3\n');
+      const result = await getVersion('/project');
+      expect(result).toBe('1.2.3');
+    });
+
+    it('should read version from package.json when VERSION missing', async () => {
+      mockFs.readFile.mockImplementation(async (filePath) => {
+        if (String(filePath).includes('VERSION')) {
+          throw new Error('ENOENT');
+        }
+        if (String(filePath).includes('package.json')) {
+          return JSON.stringify({ version: '2.0.0' });
+        }
+        throw new Error('ENOENT');
+      });
+
+      const result = await getVersion('/project');
+      expect(result).toBe('2.0.0');
+    });
+
+    it('should parse version from pyproject.toml', async () => {
+      mockFs.readFile.mockImplementation(async (filePath) => {
+        if (String(filePath).includes('pyproject.toml')) {
+          return '[project]\nversion = "3.0.0"';
+        }
+        throw new Error('ENOENT');
+      });
+
+      const result = await getVersion('/project');
+      expect(result).toBe('3.0.0');
+    });
+
+    it('should parse version from Cargo.toml', async () => {
+      mockFs.readFile.mockImplementation(async (filePath) => {
+        if (String(filePath).includes('Cargo.toml')) {
+          return '[package]\nversion = "4.0.0"';
+        }
+        throw new Error('ENOENT');
+      });
+
+      const result = await getVersion('/project');
+      expect(result).toBe('4.0.0');
+    });
+  });
+
+  describe('scanBugs', () => {
+    it('should return undefined when no bug directories exist', async () => {
+      mockFs.readdir.mockRejectedValue(new Error('ENOENT'));
+      const result = await scanBugs('/project');
+      expect(result).toBeUndefined();
+    });
+
+    it('should count open and fixed bugs', async () => {
+      mockFs.readdir.mockImplementation(async (dirPath) => {
+        if (String(dirPath).includes('_bugs_open')) {
+          return ['2024-01-01-bug1.md', '2024-01-02-bug2.md'] as unknown as fs.Dirent[];
+        }
+        if (String(dirPath).includes('_bugs_fixed')) {
+          return ['2024-01-03-bug3.md'] as unknown as fs.Dirent[];
+        }
+        throw new Error('ENOENT');
+      });
+      mockFs.readFile.mockImplementation(async (filePath) => {
+        return '# Bug Title\n\nBug description';
+      });
+
+      const result = await scanBugs('/project');
+      expect(result?.openCount).toBe(2);
+      expect(result?.fixedCount).toBe(1);
+      expect(result?.bugs).toHaveLength(3);
+    });
+
+    it('should skip .gitkeep files', async () => {
+      mockFs.readdir.mockImplementation(async (dirPath) => {
+        if (String(dirPath).includes('_bugs_open')) {
+          return ['.gitkeep', '2024-01-01-bug.md'] as unknown as fs.Dirent[];
+        }
+        throw new Error('ENOENT');
+      });
+      mockFs.readFile.mockResolvedValue('# Bug\n\nDescription');
+
+      const result = await scanBugs('/project');
+      expect(result?.openCount).toBe(1);
+    });
+  });
+
+  describe('scanRcodegen', () => {
+    it('should return undefined when _rcodegen does not exist', async () => {
+      mockFs.access.mockRejectedValue(new Error('ENOENT'));
+      const result = await scanRcodegen('/project');
+      expect(result).toBeUndefined();
+    });
+
+    it('should parse grades from .grades.json', async () => {
+      mockFs.access.mockResolvedValue(undefined);
+      mockFs.readFile.mockResolvedValueOnce(
+        JSON.stringify({
+          grades: [
+            { date: '2024-01-15', tool: 'claude', task: 'audit', grade: 85, reportFile: 'report.md' },
+          ],
+        })
+      );
+
+      const result = await scanRcodegen('/project');
+      expect(result?.reportCount).toBe(1);
+      expect(result?.latestGrade).toBe(85);
+      expect(result?.taskGrades.audit).toHaveLength(1);
+    });
+
+    it('should parse grades from filenames when .grades.json missing', async () => {
+      mockFs.access.mockResolvedValue(undefined);
+      mockFs.readFile.mockImplementation(async (filePath) => {
+        if (String(filePath).includes('.grades.json')) {
+          throw new Error('ENOENT');
+        }
+        return 'TOTAL_SCORE: 75/100';
+      });
+      mockFs.readdir.mockResolvedValueOnce([
+        'project-claude-audit-2024-01-15.md',
+      ] as unknown as fs.Dirent[]);
+
+      const result = await scanRcodegen('/project');
+      expect(result?.reportCount).toBe(1);
+      expect(result?.latestGrade).toBe(75);
+    });
+  });
+
+  describe('isProjectDirectory', () => {
+    it('should return true when package.json exists', async () => {
+      mockFs.access.mockImplementation(async (filePath) => {
+        if (String(filePath).includes('package.json')) {
+          return undefined;
+        }
+        throw new Error('ENOENT');
+      });
+
+      const result = await isProjectDirectory('/project');
+      expect(result).toBe(true);
+    });
+
+    it('should return true when .git exists', async () => {
+      mockFs.access.mockImplementation(async (filePath) => {
+        if (String(filePath).endsWith('.git')) {
+          return undefined;
+        }
+        throw new Error('ENOENT');
+      });
+
+      const result = await isProjectDirectory('/project');
+      expect(result).toBe(true);
+    });
+
+    it('should return false when no project indicators exist', async () => {
+      mockFs.access.mockRejectedValue(new Error('ENOENT'));
+      const result = await isProjectDirectory('/random-folder');
+      expect(result).toBe(false);
+    });
+  });
+
+  describe('determineStatus', () => {
+    it('should return "active" for root level projects', () => {
+      const result = determineStatus('/Users/cliff/Desktop/_code/my-project');
+      expect(result).toBe('active');
+    });
+
+    it('should return "icebox" for projects in _icebox folder', () => {
+      const result = determineStatus('/Users/cliff/Desktop/_code/_icebox/old-project');
+      expect(result).toBe('icebox');
+    });
+
+    it('should return "archived" for projects in _old folder', () => {
+      const result = determineStatus('/Users/cliff/Desktop/_code/_old/legacy');
+      expect(result).toBe('archived');
+    });
+
+    it('should return "crawlers" for projects in _crawlers folder', () => {
+      const result = determineStatus('/Users/cliff/Desktop/_code/_crawlers/scraper');
+      expect(result).toBe('crawlers');
+    });
+  });
+});
```

---

### 4. Config Module Unit Tests

**File: `tests/lib/config.test.ts`**

```diff
--- /dev/null
+++ tests/lib/config.test.ts
@@ -0,0 +1,142 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+import { promises as fs } from 'fs';
+import {
+  readConfig,
+  writeConfig,
+  getProjectMetadata,
+  setProjectMetadata,
+  updateSettings,
+} from '@/lib/config';
+import { DEFAULT_CONFIG, CodeManageConfig } from '@/lib/types';
+
+vi.mock('fs', () => ({
+  promises: {
+    readFile: vi.fn(),
+    writeFile: vi.fn(),
+  },
+}));
+
+vi.mock('@/lib/scanner', () => ({
+  getCodeBasePath: vi.fn(() => '/Users/cliff/Desktop/_code'),
+}));
+
+const mockFs = vi.mocked(fs);
+
+describe('config module', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  describe('readConfig', () => {
+    it('should return parsed config when file exists', async () => {
+      const mockConfig: CodeManageConfig = {
+        projects: {
+          'my-project': { status: 'icebox', customName: 'My Project' },
+        },
+        settings: {
+          sidebarCollapsed: true,
+          defaultStatus: 'active',
+          terminalHeight: 400,
+        },
+      };
+      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockConfig));
+
+      const result = await readConfig();
+      expect(result.projects['my-project']?.status).toBe('icebox');
+      expect(result.settings.sidebarCollapsed).toBe(true);
+    });
+
+    it('should return defaults when file does not exist', async () => {
+      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
+
+      const result = await readConfig();
+      expect(result).toEqual(DEFAULT_CONFIG);
+    });
+
+    it('should return defaults when file contains invalid JSON', async () => {
+      mockFs.readFile.mockResolvedValueOnce('not valid json');
+
+      const result = await readConfig();
+      expect(result).toEqual(DEFAULT_CONFIG);
+    });
+
+    it('should merge partial config with defaults', async () => {
+      const partialConfig = {
+        projects: { 'proj': { status: 'active' } },
+        // settings missing
+      };
+      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(partialConfig));
+
+      const result = await readConfig();
+      expect(result.settings).toBeDefined();
+      expect(result.settings.sidebarCollapsed).toBe(false);
+    });
+  });
+
+  describe('writeConfig', () => {
+    it('should write config as formatted JSON', async () => {
+      mockFs.writeFile.mockResolvedValueOnce(undefined);
+      const config: CodeManageConfig = {
+        projects: {},
+        settings: DEFAULT_CONFIG.settings,
+      };
+
+      await writeConfig(config);
+
+      expect(mockFs.writeFile).toHaveBeenCalledWith(
+        expect.stringContaining('.code-manage.json'),
+        JSON.stringify(config, null, 2),
+        'utf-8'
+      );
+    });
+  });
+
+  describe('getProjectMetadata', () => {
+    it('should return metadata for existing project', async () => {
+      mockFs.readFile.mockResolvedValueOnce(
+        JSON.stringify({
+          projects: {
+            'my-project': { status: 'icebox', tags: ['web'] },
+          },
+          settings: DEFAULT_CONFIG.settings,
+        })
+      );
+
+      const result = await getProjectMetadata('my-project');
+      expect(result?.status).toBe('icebox');
+      expect(result?.tags).toContain('web');
+    });
+
+    it('should return undefined for non-existent project', async () => {
+      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(DEFAULT_CONFIG));
+
+      const result = await getProjectMetadata('nonexistent');
+      expect(result).toBeUndefined();
+    });
+  });
+
+  describe('setProjectMetadata', () => {
+    it('should merge new metadata with existing', async () => {
+      mockFs.readFile.mockResolvedValueOnce(
+        JSON.stringify({
+          projects: { 'proj': { status: 'active', tags: ['old'] } },
+          settings: DEFAULT_CONFIG.settings,
+        })
+      );
+      mockFs.writeFile.mockResolvedValueOnce(undefined);
+
+      await setProjectMetadata('proj', { tags: ['new', 'tags'] });
+
+      expect(mockFs.writeFile).toHaveBeenCalled();
+      const writtenContent = JSON.parse(
+        mockFs.writeFile.mock.calls[0][1] as string
+      );
+      expect(writtenContent.projects['proj'].tags).toEqual(['new', 'tags']);
+    });
+  });
+
+  describe('updateSettings', () => {
+    it('should merge new settings with existing', async () => {
+      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(DEFAULT_CONFIG));
+      mockFs.writeFile.mockResolvedValueOnce(undefined);
+
+      await updateSettings({ terminalHeight: 500 });
+
+      const writtenContent = JSON.parse(
+        mockFs.writeFile.mock.calls[0][1] as string
+      );
+      expect(writtenContent.settings.terminalHeight).toBe(500);
+      expect(writtenContent.settings.sidebarCollapsed).toBe(false);
+    });
+  });
+});
```

---

### 5. API Route Tests - Projects

**File: `tests/api/projects.test.ts`**

```diff
--- /dev/null
+++ tests/api/projects.test.ts
@@ -0,0 +1,157 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+import { GET } from '@/app/api/projects/route';
+import * as scanner from '@/lib/scanner';
+import * as config from '@/lib/config';
+import { Project, DEFAULT_CONFIG } from '@/lib/types';
+
+vi.mock('@/lib/scanner');
+vi.mock('@/lib/config');
+
+const mockScanner = vi.mocked(scanner);
+const mockConfig = vi.mocked(config);
+
+const mockProjects: Project[] = [
+  {
+    slug: 'project-a',
+    name: 'Project A',
+    path: '/code/project-a',
+    status: 'active',
+    techStack: ['Next.js', 'React'],
+    lastModified: '2024-01-15T00:00:00Z',
+    hasGit: true,
+    description: 'A test project',
+  },
+  {
+    slug: 'project-b',
+    name: 'Project B',
+    path: '/code/project-b',
+    status: 'icebox',
+    techStack: ['Python'],
+    lastModified: '2024-01-10T00:00:00Z',
+    hasGit: false,
+  },
+  {
+    slug: 'crawler-x',
+    name: 'Crawler X',
+    path: '/code/_crawlers/crawler-x',
+    status: 'crawlers',
+    techStack: ['Python', 'Scrapy'],
+    lastModified: '2024-01-05T00:00:00Z',
+    hasGit: true,
+  },
+];
+
+describe('GET /api/projects', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockScanner.scanAllProjects.mockResolvedValue(mockProjects);
+    mockConfig.readConfig.mockResolvedValue(DEFAULT_CONFIG);
+  });
+
+  it('should return all projects when no filters', async () => {
+    const request = new Request('http://localhost/api/projects');
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(200);
+    expect(data.projects).toHaveLength(3);
+    expect(data.counts).toEqual({
+      active: 1,
+      crawlers: 1,
+      icebox: 1,
+      archived: 0,
+    });
+  });
+
+  it('should filter by status parameter', async () => {
+    const request = new Request('http://localhost/api/projects?status=active');
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(data.projects).toHaveLength(1);
+    expect(data.projects[0].slug).toBe('project-a');
+  });
+
+  it('should return 400 for invalid status', async () => {
+    const request = new Request('http://localhost/api/projects?status=invalid');
+    const response = await GET(request);
+
+    expect(response.status).toBe(400);
+    const data = await response.json();
+    expect(data.error).toContain('Invalid status');
+  });
+
+  it('should filter by search term in name', async () => {
+    const request = new Request('http://localhost/api/projects?search=crawler');
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(data.projects).toHaveLength(1);
+    expect(data.projects[0].slug).toBe('crawler-x');
+  });
+
+  it('should filter by search term in description', async () => {
+    const request = new Request('http://localhost/api/projects?search=test');
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(data.projects).toHaveLength(1);
+    expect(data.projects[0].slug).toBe('project-a');
+  });
+
+  it('should filter by search term in tech stack', async () => {
+    const request = new Request('http://localhost/api/projects?search=scrapy');
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(data.projects).toHaveLength(1);
+    expect(data.projects[0].slug).toBe('crawler-x');
+  });
+
+  it('should apply custom metadata from config', async () => {
+    mockConfig.readConfig.mockResolvedValueOnce({
+      ...DEFAULT_CONFIG,
+      projects: {
+        'project-a': {
+          customName: 'Custom Name',
+          customDescription: 'Custom description',
+          status: 'icebox',
+        },
+      },
+    });
+
+    const request = new Request('http://localhost/api/projects');
+    const response = await GET(request);
+    const data = await response.json();
+
+    const projectA = data.projects.find((p: Project) => p.slug === 'project-a');
+    expect(projectA.name).toBe('Custom Name');
+    expect(projectA.description).toBe('Custom description');
+    expect(projectA.status).toBe('icebox');
+  });
+
+  it('should combine status and search filters', async () => {
+    const request = new Request('http://localhost/api/projects?status=active&search=project');
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(data.projects).toHaveLength(1);
+    expect(data.projects[0].slug).toBe('project-a');
+  });
+
+  it('should handle scanner errors gracefully', async () => {
+    mockScanner.scanAllProjects.mockRejectedValueOnce(new Error('Scan failed'));
+
+    const request = new Request('http://localhost/api/projects');
+    const response = await GET(request);
+
+    expect(response.status).toBe(500);
+    const data = await response.json();
+    expect(data.error).toBe('Failed to scan projects');
+  });
+});
```

---

### 6. API Route Tests - Terminal (Security Critical)

**File: `tests/api/terminal.test.ts`**

```diff
--- /dev/null
+++ tests/api/terminal.test.ts
@@ -0,0 +1,93 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+import { POST } from '@/app/api/terminal/route';
+import { exec } from 'child_process';
+
+vi.mock('child_process', () => ({
+  exec: vi.fn(),
+}));
+
+const mockExec = vi.mocked(exec);
+
+describe('POST /api/terminal', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it('should execute command and return output', async () => {
+    mockExec.mockImplementation((command, options, callback) => {
+      if (callback) callback(null, 'command output', '');
+      return {} as ReturnType<typeof exec>;
+    });
+
+    const request = new Request('http://localhost/api/terminal', {
+      method: 'POST',
+      body: JSON.stringify({ command: 'ls -la' }),
+    });
+
+    const response = await POST(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(200);
+    expect(data.stdout).toBe('command output');
+    expect(data.exitCode).toBe(0);
+  });
+
+  it('should return 400 when command is missing', async () => {
+    const request = new Request('http://localhost/api/terminal', {
+      method: 'POST',
+      body: JSON.stringify({}),
+    });
+
+    const response = await POST(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(400);
+    expect(data.error).toBe('Command is required');
+  });
+
+  it('should use provided cwd', async () => {
+    mockExec.mockImplementation((command, options, callback) => {
+      if (callback) callback(null, '', '');
+      return {} as ReturnType<typeof exec>;
+    });
+
+    const request = new Request('http://localhost/api/terminal', {
+      method: 'POST',
+      body: JSON.stringify({ command: 'pwd', cwd: '/custom/path' }),
+    });
+
+    await POST(request);
+
+    expect(mockExec).toHaveBeenCalledWith(
+      'pwd',
+      expect.objectContaining({ cwd: '/custom/path' }),
+      expect.any(Function)
+    );
+  });
+
+  it('should return exit code on command failure', async () => {
+    mockExec.mockImplementation((command, options, callback) => {
+      const error = { code: 1 } as Error & { code: number };
+      if (callback) callback(error, '', 'command failed');
+      return {} as ReturnType<typeof exec>;
+    });
+
+    const request = new Request('http://localhost/api/terminal', {
+      method: 'POST',
+      body: JSON.stringify({ command: 'exit 1' }),
+    });
+
+    const response = await POST(request);
+    const data = await response.json();
+
+    expect(data.exitCode).toBe(1);
+    expect(data.stderr).toBe('command failed');
+  });
+
+  it('should set proper environment variables', async () => {
+    mockExec.mockImplementation((command, options, callback) => {
+      expect(options).toHaveProperty('env.TERM', 'xterm-256color');
+      expect(options).toHaveProperty('env.FORCE_COLOR', '1');
+      if (callback) callback(null, '', '');
+      return {} as ReturnType<typeof exec>;
+    });
+
+    const request = new Request('http://localhost/api/terminal', {
+      method: 'POST',
+      body: JSON.stringify({ command: 'echo test' }),
+    });
+
+    await POST(request);
+    expect(mockExec).toHaveBeenCalled();
+  });
+});
```

---

### 7. Context Provider Tests

**File: `tests/components/SidebarContext.test.tsx`**

```diff
--- /dev/null
+++ tests/components/SidebarContext.test.tsx
@@ -0,0 +1,95 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+import { render, screen, act } from '@testing-library/react';
+import userEvent from '@testing-library/user-event';
+import { SidebarProvider, useSidebar } from '@/components/sidebar/SidebarContext';
+
+// Test component that uses the context
+function TestConsumer() {
+  const { collapsed, toggleCollapsed, setCollapsed } = useSidebar();
+  return (
+    <div>
+      <span data-testid="collapsed">{String(collapsed)}</span>
+      <button data-testid="toggle" onClick={toggleCollapsed}>Toggle</button>
+      <button data-testid="setTrue" onClick={() => setCollapsed(true)}>Set True</button>
+      <button data-testid="setFalse" onClick={() => setCollapsed(false)}>Set False</button>
+    </div>
+  );
+}
+
+describe('SidebarContext', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    localStorage.clear();
+  });
+
+  describe('SidebarProvider', () => {
+    it('should provide default collapsed value of false', async () => {
+      render(
+        <SidebarProvider>
+          <TestConsumer />
+        </SidebarProvider>
+      );
+
+      // Wait for mount effect
+      await act(async () => {
+        await new Promise(resolve => setTimeout(resolve, 0));
+      });
+
+      expect(screen.getByTestId('collapsed')).toHaveTextContent('false');
+    });
+
+    it('should read initial value from localStorage', async () => {
+      localStorage.getItem = vi.fn().mockReturnValue('true');
+
+      render(
+        <SidebarProvider>
+          <TestConsumer />
+        </SidebarProvider>
+      );
+
+      await act(async () => {
+        await new Promise(resolve => setTimeout(resolve, 0));
+      });
+
+      expect(screen.getByTestId('collapsed')).toHaveTextContent('true');
+    });
+
+    it('should toggle collapsed state', async () => {
+      const user = userEvent.setup();
+
+      render(
+        <SidebarProvider>
+          <TestConsumer />
+        </SidebarProvider>
+      );
+
+      await act(async () => {
+        await new Promise(resolve => setTimeout(resolve, 0));
+      });
+
+      expect(screen.getByTestId('collapsed')).toHaveTextContent('false');
+
+      await user.click(screen.getByTestId('toggle'));
+      expect(screen.getByTestId('collapsed')).toHaveTextContent('true');
+
+      await user.click(screen.getByTestId('toggle'));
+      expect(screen.getByTestId('collapsed')).toHaveTextContent('false');
+    });
+
+    it('should persist to localStorage on change', async () => {
+      const user = userEvent.setup();
+
+      render(
+        <SidebarProvider>
+          <TestConsumer />
+        </SidebarProvider>
+      );
+
+      await act(async () => {
+        await new Promise(resolve => setTimeout(resolve, 0));
+      });
+
+      await user.click(screen.getByTestId('setTrue'));
+      expect(localStorage.setItem).toHaveBeenCalledWith(
+        'code-manage-sidebar-collapsed',
+        'true'
+      );
+    });
+  });
+
+  describe('useSidebar', () => {
+    it('should throw error when used outside provider', () => {
+      // Suppress console.error for this test
+      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
+
+      expect(() => {
+        render(<TestConsumer />);
+      }).toThrow('useSidebar must be used within a SidebarProvider');
+
+      consoleSpy.mockRestore();
+    });
+  });
+});
```

---

### 8. Type Validation Tests

**File: `tests/lib/types.test.ts`**

```diff
--- /dev/null
+++ tests/lib/types.test.ts
@@ -0,0 +1,78 @@
+import { describe, it, expect } from 'vitest';
+import {
+  DEFAULT_CONFIG,
+  ProjectStatus,
+  Project,
+  BugInfo,
+  RcodegenInfo,
+} from '@/lib/types';
+
+describe('types module', () => {
+  describe('DEFAULT_CONFIG', () => {
+    it('should have empty projects object', () => {
+      expect(DEFAULT_CONFIG.projects).toEqual({});
+    });
+
+    it('should have correct default settings', () => {
+      expect(DEFAULT_CONFIG.settings).toEqual({
+        sidebarCollapsed: false,
+        defaultStatus: 'active',
+        terminalHeight: 300,
+      });
+    });
+  });
+
+  describe('type guards', () => {
+    const validStatuses: ProjectStatus[] = ['active', 'crawlers', 'icebox', 'archived'];
+
+    it('should include all valid project statuses', () => {
+      expect(validStatuses).toContain('active');
+      expect(validStatuses).toContain('crawlers');
+      expect(validStatuses).toContain('icebox');
+      expect(validStatuses).toContain('archived');
+    });
+  });
+
+  describe('Project interface', () => {
+    it('should allow valid project objects', () => {
+      const project: Project = {
+        slug: 'test-project',
+        name: 'Test Project',
+        path: '/path/to/project',
+        status: 'active',
+        techStack: ['TypeScript'],
+        lastModified: '2024-01-15T00:00:00Z',
+        hasGit: true,
+      };
+
+      expect(project.slug).toBe('test-project');
+      expect(project.status).toBe('active');
+    });
+
+    it('should allow optional fields to be undefined', () => {
+      const project: Project = {
+        slug: 'minimal',
+        name: 'Minimal',
+        path: '/path',
+        status: 'active',
+        techStack: [],
+        lastModified: '2024-01-01T00:00:00Z',
+        hasGit: false,
+      };
+
+      expect(project.description).toBeUndefined();
+      expect(project.version).toBeUndefined();
+      expect(project.bugs).toBeUndefined();
+      expect(project.rcodegen).toBeUndefined();
+    });
+  });
+
+  describe('BugInfo interface', () => {
+    it('should track open and fixed counts', () => {
+      const bugInfo: BugInfo = {
+        openCount: 5,
+        fixedCount: 10,
+        bugs: [],
+      };
+
+      expect(bugInfo.openCount + bugInfo.fixedCount).toBe(15);
+    });
+  });
+});
```

---

## Priority Implementation Order

### Phase 1: Foundation (Critical)
1. Install test dependencies
2. Create `vitest.config.ts`
3. Create `tests/setup.ts`

### Phase 2: Core Logic Tests (High Priority)
1. `tests/lib/scanner.test.ts` - Scanner module (580+ lines of complex logic)
2. `tests/lib/config.test.ts` - Configuration management

### Phase 3: API Tests (High Priority)
1. `tests/api/projects.test.ts` - Main API endpoint
2. `tests/api/terminal.test.ts` - Security-critical command execution

### Phase 4: Component Tests (Medium Priority)
1. `tests/components/SidebarContext.test.tsx` - Context providers
2. Additional component tests as needed

---

## Coverage Goals

| Module | Current Coverage | Target Coverage |
|--------|-----------------|-----------------|
| lib/scanner.ts | 0% | 80% |
| lib/config.ts | 0% | 90% |
| lib/types.ts | N/A (types only) | Type tests |
| API routes | 0% | 75% |
| Components | 0% | 60% |
| **Overall** | **0%** | **70%** |

---

## Recommendations

### Immediate Actions
1. **Install Vitest** as the test framework - it's fast, modern, and works well with Next.js
2. **Prioritize scanner.ts tests** - this file contains the core business logic
3. **Add terminal API tests** - this is security-critical as it executes shell commands

### Test Strategy
1. **Unit tests first** - Focus on pure functions in lib/
2. **Mocking strategy** - Mock fs module for scanner tests, mock fetch for API tests
3. **Integration tests later** - Add after unit test foundation is solid

### Technical Debt
- The codebase is well-structured and testable
- Types are well-defined, making test assertions easier
- No existing technical debt from tests (clean slate)

---

## Files Summary

| Proposed File | Lines | Priority |
|---------------|-------|----------|
| vitest.config.ts | 26 | Critical |
| tests/setup.ts | 20 | Critical |
| tests/lib/scanner.test.ts | 456 | Critical |
| tests/lib/config.test.ts | 142 | High |
| tests/api/projects.test.ts | 157 | High |
| tests/api/terminal.test.ts | 93 | High |
| tests/components/SidebarContext.test.tsx | 95 | Medium |
| tests/lib/types.test.ts | 78 | Low |
| **TOTAL** | **1,067** | - |

---

## Conclusion

This codebase has **excellent testability** but **zero test coverage**. The well-defined TypeScript types, separation of concerns, and pure functions make it straightforward to add comprehensive tests. The proposed test suite covers the most critical paths and would bring coverage to approximately 70%.

**Grade Justification (18/100):**
- +8 points for excellent TypeScript types that enable good testing
- +10 points for well-structured, testable code architecture
- -0 points for the complete absence of any test infrastructure or tests

The low score reflects the reality that no tests exist, but the high testability means implementing the proposed tests would be straightforward.
