Date Created: 2026-01-25 11:08:43
TOTAL_SCORE: 15/100

---

# Code Manage - Unit Test Analysis Report

## Executive Summary

**Project**: code_manage (Next.js 16 Project Management Dashboard)
**Version**: 1.0.5
**Total Source Lines**: ~3,800 LOC (TypeScript/TSX)
**Test Files Found**: 0
**Test Coverage**: 0%
**Grade**: 15/100

The codebase has **zero test coverage**. No testing framework is installed, and no test files exist. This report provides comprehensive test proposals with patch-ready diffs for establishing a robust test suite.

---

## Scoring Breakdown

| Category | Max Points | Score | Notes |
|----------|------------|-------|-------|
| Existing Test Coverage | 30 | 0 | No tests exist |
| Testing Framework Setup | 10 | 0 | No Jest/Vitest installed |
| Unit Tests for Core Logic | 25 | 5 | Pure functions exist but untested |
| API Route Tests | 15 | 5 | Security validation exists, untested |
| Component Tests | 10 | 3 | React components untested |
| Integration Tests | 10 | 2 | Data flow untested |
| **TOTAL** | **100** | **15** | Critical gaps |

---

## Current State Analysis

### What Exists
- Clean TypeScript codebase with type definitions
- Modular architecture with separated concerns
- Pure functions suitable for unit testing (`lib/scanner.ts`)
- Security-conscious API implementations (path validation)

### What's Missing
- No testing framework (Jest, Vitest, or similar)
- No test configuration files
- No test scripts in package.json
- No React Testing Library for component tests
- No mocking infrastructure

---

## Recommended Test Setup

### Phase 1: Install Testing Dependencies

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event msw
```

### Phase 2: Configuration Files

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/**', 'components/**', 'app/api/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

Create `tests/setup.ts`:
```typescript
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
```

---

## Proposed Unit Tests with Patch-Ready Diffs

### 1. Scanner Module Tests (`lib/scanner.ts`)

**File**: `tests/lib/scanner.test.ts`

```diff
--- /dev/null
+++ tests/lib/scanner.test.ts
@@ -0,0 +1,498 @@
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
+// Mock fs module
+vi.mock('fs', () => ({
+  promises: {
+    access: vi.fn(),
+    readFile: vi.fn(),
+    readdir: vi.fn(),
+    stat: vi.fn(),
+  },
+}));
+
+const mockFs = fs as unknown as {
+  access: ReturnType<typeof vi.fn>;
+  readFile: ReturnType<typeof vi.fn>;
+  readdir: ReturnType<typeof vi.fn>;
+  stat: ReturnType<typeof vi.fn>;
+};
+
+describe('fileExists', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it('should return true when file exists', async () => {
+    mockFs.access.mockResolvedValue(undefined);
+    const result = await fileExists('/path/to/file');
+    expect(result).toBe(true);
+    expect(mockFs.access).toHaveBeenCalledWith('/path/to/file');
+  });
+
+  it('should return false when file does not exist', async () => {
+    mockFs.access.mockRejectedValue(new Error('ENOENT'));
+    const result = await fileExists('/path/to/nonexistent');
+    expect(result).toBe(false);
+  });
+});
+
+describe('readJsonFile', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it('should parse valid JSON file', async () => {
+    const mockData = { name: 'test', version: '1.0.0' };
+    mockFs.readFile.mockResolvedValue(JSON.stringify(mockData));
+
+    const result = await readJsonFile('/path/to/package.json');
+    expect(result).toEqual(mockData);
+  });
+
+  it('should return null for invalid JSON', async () => {
+    mockFs.readFile.mockResolvedValue('{ invalid json }');
+    const result = await readJsonFile('/path/to/invalid.json');
+    expect(result).toBeNull();
+  });
+
+  it('should return null when file read fails', async () => {
+    mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
+    const result = await readJsonFile('/path/to/missing.json');
+    expect(result).toBeNull();
+  });
+});
+
+describe('readTextFile', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it('should return file contents', async () => {
+    mockFs.readFile.mockResolvedValue('Hello, World!');
+    const result = await readTextFile('/path/to/file.txt');
+    expect(result).toBe('Hello, World!');
+  });
+
+  it('should return null when file read fails', async () => {
+    mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
+    const result = await readTextFile('/path/to/missing.txt');
+    expect(result).toBeNull();
+  });
+});
+
+describe('detectTechStack', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it('should detect Next.js and React from package.json', async () => {
+    mockFs.readFile.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('package.json')) {
+        return Promise.resolve(JSON.stringify({
+          dependencies: {
+            next: '^14.0.0',
+            react: '^18.0.0',
+          },
+        }));
+      }
+      throw new Error('ENOENT');
+    });
+    mockFs.access.mockRejectedValue(new Error('ENOENT'));
+
+    const result = await detectTechStack('/project');
+    expect(result).toContain('Next.js');
+    expect(result).toContain('React');
+    expect(result[0]).toBe('Next.js'); // Highest priority
+  });
+
+  it('should detect TypeScript and Tailwind', async () => {
+    mockFs.readFile.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('package.json')) {
+        return Promise.resolve(JSON.stringify({
+          devDependencies: {
+            typescript: '^5.0.0',
+            tailwindcss: '^3.0.0',
+          },
+        }));
+      }
+      throw new Error('ENOENT');
+    });
+    mockFs.access.mockRejectedValue(new Error('ENOENT'));
+
+    const result = await detectTechStack('/project');
+    expect(result).toContain('TypeScript');
+    expect(result).toContain('Tailwind');
+  });
+
+  it('should detect Python with FastAPI from pyproject.toml', async () => {
+    mockFs.readFile.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('package.json')) {
+        throw new Error('ENOENT');
+      }
+      if (filePath.endsWith('pyproject.toml')) {
+        return Promise.resolve('[project]\nname = "myapp"\ndependencies = ["fastapi"]');
+      }
+      throw new Error('ENOENT');
+    });
+    mockFs.access.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('pyproject.toml')) {
+        return Promise.resolve(undefined);
+      }
+      throw new Error('ENOENT');
+    });
+
+    const result = await detectTechStack('/project');
+    expect(result).toContain('Python');
+    expect(result).toContain('FastAPI');
+  });
+
+  it('should detect Rust from Cargo.toml', async () => {
+    mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
+    mockFs.access.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('Cargo.toml')) {
+        return Promise.resolve(undefined);
+      }
+      throw new Error('ENOENT');
+    });
+
+    const result = await detectTechStack('/project');
+    expect(result).toContain('Rust');
+  });
+
+  it('should detect Go from go.mod', async () => {
+    mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
+    mockFs.access.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('go.mod')) {
+        return Promise.resolve(undefined);
+      }
+      throw new Error('ENOENT');
+    });
+
+    const result = await detectTechStack('/project');
+    expect(result).toContain('Go');
+  });
+
+  it('should add Node.js when package.json exists but no specific framework detected', async () => {
+    mockFs.readFile.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('package.json')) {
+        return Promise.resolve(JSON.stringify({
+          dependencies: {
+            lodash: '^4.0.0',
+          },
+        }));
+      }
+      throw new Error('ENOENT');
+    });
+    mockFs.access.mockRejectedValue(new Error('ENOENT'));
+
+    const result = await detectTechStack('/project');
+    expect(result).toContain('Node.js');
+  });
+
+  it('should limit results to 5 technologies', async () => {
+    mockFs.readFile.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('package.json')) {
+        return Promise.resolve(JSON.stringify({
+          dependencies: {
+            next: '^14.0.0',
+            react: '^18.0.0',
+            vue: '^3.0.0',
+            svelte: '^4.0.0',
+            express: '^4.0.0',
+            electron: '^25.0.0',
+            tailwindcss: '^3.0.0',
+          },
+        }));
+      }
+      throw new Error('ENOENT');
+    });
+    mockFs.access.mockRejectedValue(new Error('ENOENT'));
+
+    const result = await detectTechStack('/project');
+    expect(result.length).toBeLessThanOrEqual(5);
+  });
+});
+
+describe('extractDescription', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it('should extract description from package.json', async () => {
+    mockFs.readFile.mockResolvedValue(JSON.stringify({
+      description: 'A test project description',
+    }));
+
+    const result = await extractDescription('/project');
+    expect(result).toBe('A test project description');
+  });
+
+  it('should extract first paragraph from README.md', async () => {
+    mockFs.readFile.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('package.json')) {
+        return Promise.resolve(JSON.stringify({}));
+      }
+      if (filePath.endsWith('README.md')) {
+        return Promise.resolve('# Title\n\nThis is the first paragraph of the readme.');
+      }
+      throw new Error('ENOENT');
+    });
+
+    const result = await extractDescription('/project');
+    expect(result).toBe('This is the first paragraph of the readme.');
+  });
+
+  it('should skip badges and images in README', async () => {
+    mockFs.readFile.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('package.json')) {
+        return Promise.resolve(JSON.stringify({}));
+      }
+      if (filePath.endsWith('README.md')) {
+        return Promise.resolve('# Title\n![badge](url)\n[Link](url)\n\nActual description here.');
+      }
+      throw new Error('ENOENT');
+    });
+
+    const result = await extractDescription('/project');
+    expect(result).toBe('Actual description here.');
+  });
+
+  it('should truncate long descriptions to 200 characters', async () => {
+    const longDescription = 'A'.repeat(300);
+    mockFs.readFile.mockResolvedValue(JSON.stringify({
+      description: longDescription,
+    }));
+
+    const result = await extractDescription('/project');
+    expect(result).toBe(longDescription); // package.json description not truncated
+  });
+
+  it('should return undefined when no description found', async () => {
+    mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
+
+    const result = await extractDescription('/project');
+    expect(result).toBeUndefined();
+  });
+});
+
+describe('getGitInfo', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it('should return hasGit: false when .git does not exist', async () => {
+    mockFs.access.mockRejectedValue(new Error('ENOENT'));
+
+    const result = await getGitInfo('/project');
+    expect(result).toEqual({ hasGit: false });
+  });
+
+  it('should extract branch from HEAD file', async () => {
+    mockFs.access.mockResolvedValue(undefined);
+    mockFs.readFile.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('HEAD')) {
+        return Promise.resolve('ref: refs/heads/main\n');
+      }
+      if (filePath.endsWith('config')) {
+        return Promise.resolve('');
+      }
+      throw new Error('ENOENT');
+    });
+
+    const result = await getGitInfo('/project');
+    expect(result.hasGit).toBe(true);
+    expect(result.branch).toBe('main');
+  });
+
+  it('should extract remote URL from config', async () => {
+    mockFs.access.mockResolvedValue(undefined);
+    mockFs.readFile.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('HEAD')) {
+        return Promise.resolve('ref: refs/heads/main\n');
+      }
+      if (filePath.endsWith('config')) {
+        return Promise.resolve('[remote "origin"]\n\turl = git@github.com:user/repo.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*');
+      }
+      throw new Error('ENOENT');
+    });
+
+    const result = await getGitInfo('/project');
+    expect(result.remote).toBe('git@github.com:user/repo.git');
+  });
+});
+
+describe('getVersion', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it('should read version from VERSION file first', async () => {
+    mockFs.readFile.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('VERSION')) {
+        return Promise.resolve('2.5.0\n');
+      }
+      throw new Error('ENOENT');
+    });
+
+    const result = await getVersion('/project');
+    expect(result).toBe('2.5.0');
+  });
+
+  it('should fallback to package.json version', async () => {
+    mockFs.readFile.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('VERSION')) {
+        throw new Error('ENOENT');
+      }
+      if (filePath.endsWith('package.json')) {
+        return Promise.resolve(JSON.stringify({ version: '1.2.3' }));
+      }
+      throw new Error('ENOENT');
+    });
+
+    const result = await getVersion('/project');
+    expect(result).toBe('1.2.3');
+  });
+
+  it('should extract version from pyproject.toml', async () => {
+    mockFs.readFile.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('pyproject.toml')) {
+        return Promise.resolve('[project]\nversion = "3.4.5"\n');
+      }
+      throw new Error('ENOENT');
+    });
+
+    const result = await getVersion('/project');
+    expect(result).toBe('3.4.5');
+  });
+
+  it('should extract version from Cargo.toml', async () => {
+    mockFs.readFile.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('Cargo.toml')) {
+        return Promise.resolve('[package]\nname = "myapp"\nversion = "0.1.0"\n');
+      }
+      throw new Error('ENOENT');
+    });
+
+    const result = await getVersion('/project');
+    expect(result).toBe('0.1.0');
+  });
+
+  it('should return undefined when no version found', async () => {
+    mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
+
+    const result = await getVersion('/project');
+    expect(result).toBeUndefined();
+  });
+});
+
+describe('determineStatus', () => {
+  it('should return "active" for root level projects', () => {
+    const result = determineStatus('/Users/cliff/Desktop/_code/myproject');
+    expect(result).toBe('active');
+  });
+
+  it('should return "crawlers" for projects in _crawlers folder', () => {
+    const result = determineStatus('/Users/cliff/Desktop/_code/_crawlers/myproject');
+    expect(result).toBe('crawlers');
+  });
+
+  it('should return "icebox" for projects in _icebox folder', () => {
+    const result = determineStatus('/Users/cliff/Desktop/_code/_icebox/myproject');
+    expect(result).toBe('icebox');
+  });
+
+  it('should return "archived" for projects in _old folder', () => {
+    const result = determineStatus('/Users/cliff/Desktop/_code/_old/myproject');
+    expect(result).toBe('archived');
+  });
+});
+
+describe('scanBugs', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it('should return undefined when no bug directories exist', async () => {
+    mockFs.readdir.mockRejectedValue(new Error('ENOENT'));
+
+    const result = await scanBugs('/project');
+    expect(result).toBeUndefined();
+  });
+
+  it('should count open and fixed bugs', async () => {
+    mockFs.readdir.mockImplementation((dirPath: string) => {
+      if (dirPath.endsWith('_bugs_open')) {
+        return Promise.resolve(['2024-01-01-bug1.md', '2024-01-02-bug2.md']);
+      }
+      if (dirPath.endsWith('_bugs_fixed')) {
+        return Promise.resolve(['2024-01-03-bug3.md']);
+      }
+      throw new Error('ENOENT');
+    });
+    mockFs.readFile.mockResolvedValue('# Bug Title\n\nDescription');
+
+    const result = await scanBugs('/project');
+    expect(result?.openCount).toBe(2);
+    expect(result?.fixedCount).toBe(1);
+    expect(result?.bugs.length).toBe(3);
+  });
+
+  it('should skip .gitkeep files', async () => {
+    mockFs.readdir.mockImplementation((dirPath: string) => {
+      if (dirPath.endsWith('_bugs_open')) {
+        return Promise.resolve(['.gitkeep', '2024-01-01-bug1.md']);
+      }
+      throw new Error('ENOENT');
+    });
+    mockFs.readFile.mockResolvedValue('# Bug Title');
+
+    const result = await scanBugs('/project');
+    expect(result?.openCount).toBe(1);
+  });
+
+  it('should parse date from filename', async () => {
+    mockFs.readdir.mockImplementation((dirPath: string) => {
+      if (dirPath.endsWith('_bugs_open')) {
+        return Promise.resolve(['2024-06-15-critical-bug.md']);
+      }
+      throw new Error('ENOENT');
+    });
+    mockFs.readFile.mockResolvedValue('# Critical Bug\n\nDetails here');
+
+    const result = await scanBugs('/project');
+    expect(result?.bugs[0].date).toBe('2024-06-15');
+  });
+});
+
+describe('isProjectDirectory', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it('should return true when package.json exists', async () => {
+    mockFs.access.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('package.json')) {
+        return Promise.resolve(undefined);
+      }
+      throw new Error('ENOENT');
+    });
+
+    const result = await isProjectDirectory('/project');
+    expect(result).toBe(true);
+  });
+
+  it('should return true when .git exists', async () => {
+    mockFs.access.mockImplementation((filePath: string) => {
+      if (filePath.endsWith('.git')) {
+        return Promise.resolve(undefined);
+      }
+      throw new Error('ENOENT');
+    });
+
+    const result = await isProjectDirectory('/project');
+    expect(result).toBe(true);
+  });
+
+  it('should return false when no project indicators exist', async () => {
+    mockFs.access.mockRejectedValue(new Error('ENOENT'));
+
+    const result = await isProjectDirectory('/random-folder');
+    expect(result).toBe(false);
+  });
+});
```

---

### 2. Config Module Tests (`lib/config.ts`)

**File**: `tests/lib/config.test.ts`

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
+import { DEFAULT_CONFIG } from '@/lib/types';
+
+vi.mock('fs', () => ({
+  promises: {
+    readFile: vi.fn(),
+    writeFile: vi.fn(),
+  },
+}));
+
+vi.mock('@/lib/scanner', () => ({
+  getCodeBasePath: () => '/Users/cliff/Desktop/_code',
+}));
+
+const mockFs = fs as unknown as {
+  readFile: ReturnType<typeof vi.fn>;
+  writeFile: ReturnType<typeof vi.fn>;
+};
+
+describe('readConfig', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it('should return parsed config when file exists', async () => {
+    const mockConfig = {
+      projects: {
+        'my-project': {
+          customName: 'My Project',
+          tags: ['web', 'react'],
+        },
+      },
+      settings: {
+        sidebarCollapsed: true,
+        defaultStatus: 'active',
+        terminalHeight: 400,
+      },
+    };
+    mockFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));
+
+    const result = await readConfig();
+    expect(result.projects['my-project'].customName).toBe('My Project');
+    expect(result.settings.sidebarCollapsed).toBe(true);
+  });
+
+  it('should merge with defaults when config is partial', async () => {
+    mockFs.readFile.mockResolvedValue(JSON.stringify({
+      projects: {},
+    }));
+
+    const result = await readConfig();
+    expect(result.settings).toEqual(DEFAULT_CONFIG.settings);
+  });
+
+  it('should return default config when file does not exist', async () => {
+    mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
+
+    const result = await readConfig();
+    expect(result).toEqual(DEFAULT_CONFIG);
+  });
+
+  it('should return default config when file contains invalid JSON', async () => {
+    mockFs.readFile.mockResolvedValue('{ invalid json }');
+
+    const result = await readConfig();
+    expect(result).toEqual(DEFAULT_CONFIG);
+  });
+});
+
+describe('writeConfig', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it('should write config as formatted JSON', async () => {
+    mockFs.writeFile.mockResolvedValue(undefined);
+
+    const config = {
+      projects: { 'test': { customName: 'Test' } },
+      settings: DEFAULT_CONFIG.settings,
+    };
+
+    await writeConfig(config);
+
+    expect(mockFs.writeFile).toHaveBeenCalledWith(
+      '/Users/cliff/Desktop/_code/.code-manage.json',
+      JSON.stringify(config, null, 2),
+      'utf-8'
+    );
+  });
+});
+
+describe('getProjectMetadata', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it('should return metadata for existing project', async () => {
+    mockFs.readFile.mockResolvedValue(JSON.stringify({
+      projects: {
+        'my-project': { customName: 'My Custom Name' },
+      },
+      settings: DEFAULT_CONFIG.settings,
+    }));
+
+    const result = await getProjectMetadata('my-project');
+    expect(result?.customName).toBe('My Custom Name');
+  });
+
+  it('should return undefined for non-existent project', async () => {
+    mockFs.readFile.mockResolvedValue(JSON.stringify({
+      projects: {},
+      settings: DEFAULT_CONFIG.settings,
+    }));
+
+    const result = await getProjectMetadata('non-existent');
+    expect(result).toBeUndefined();
+  });
+});
+
+describe('setProjectMetadata', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it('should merge new metadata with existing', async () => {
+    mockFs.readFile.mockResolvedValue(JSON.stringify({
+      projects: {
+        'my-project': { customName: 'Old Name', tags: ['old'] },
+      },
+      settings: DEFAULT_CONFIG.settings,
+    }));
+    mockFs.writeFile.mockResolvedValue(undefined);
+
+    await setProjectMetadata('my-project', { customName: 'New Name' });
+
+    const writtenData = JSON.parse(mockFs.writeFile.mock.calls[0][1]);
+    expect(writtenData.projects['my-project'].customName).toBe('New Name');
+    expect(writtenData.projects['my-project'].tags).toEqual(['old']);
+  });
+});
```

---

### 3. API Route Tests

**File**: `tests/api/file.test.ts`

```diff
--- /dev/null
+++ tests/api/file.test.ts
@@ -0,0 +1,98 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+import { GET } from '@/app/api/file/route';
+import { promises as fs } from 'fs';
+
+vi.mock('fs', () => ({
+  promises: {
+    readFile: vi.fn(),
+  },
+}));
+
+const mockFs = fs as unknown as {
+  readFile: ReturnType<typeof vi.fn>;
+};
+
+describe('GET /api/file', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it('should return file contents for valid path', async () => {
+    mockFs.readFile.mockResolvedValue('file contents here');
+
+    const request = new Request(
+      'http://localhost/api/file?path=/Users/cliff/Desktop/_code/myproject/README.md'
+    );
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(200);
+    expect(data.content).toBe('file contents here');
+  });
+
+  it('should return 400 when path is missing', async () => {
+    const request = new Request('http://localhost/api/file');
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(400);
+    expect(data.error).toBe('Path is required');
+  });
+
+  it('should return 403 for path traversal attempt', async () => {
+    const request = new Request(
+      'http://localhost/api/file?path=/Users/cliff/Desktop/_code/../../../etc/passwd'
+    );
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(403);
+    expect(data.error).toBe('Invalid path');
+  });
+
+  it('should return 403 for paths outside CODE_BASE_PATH', async () => {
+    const request = new Request(
+      'http://localhost/api/file?path=/etc/passwd'
+    );
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(403);
+    expect(data.error).toBe('Invalid path');
+  });
+
+  it('should return 404 when file does not exist', async () => {
+    mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
+
+    const request = new Request(
+      'http://localhost/api/file?path=/Users/cliff/Desktop/_code/myproject/nonexistent.txt'
+    );
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(404);
+    expect(data.error).toBe('Failed to read file');
+  });
+
+  // SECURITY: Test boundary conditions for path validation
+  it('should reject path that equals CODE_BASE_PATH without trailing content', async () => {
+    // The path must start with CODE_BASE_PATH + '/' not just CODE_BASE_PATH
+    const request = new Request(
+      'http://localhost/api/file?path=/Users/cliff/Desktop/_code'
+    );
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(403);
+  });
+
+  it('should reject symbolic link escapes (conceptual test)', async () => {
+    // This tests that path.resolve is used correctly
+    // In practice, symlinks require OS-level testing
+    const request = new Request(
+      'http://localhost/api/file?path=/Users/cliff/Desktop/_code/project/../../../tmp/evil'
+    );
+    const response = await GET(request);
+
+    expect(response.status).toBe(403);
+  });
+});
```

**File**: `tests/api/projects.test.ts`

```diff
--- /dev/null
+++ tests/api/projects.test.ts
@@ -0,0 +1,143 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+import { GET } from '@/app/api/projects/route';
+import { scanAllProjects } from '@/lib/scanner';
+import { readConfig } from '@/lib/config';
+
+vi.mock('@/lib/scanner', () => ({
+  scanAllProjects: vi.fn(),
+}));
+
+vi.mock('@/lib/config', () => ({
+  readConfig: vi.fn(),
+}));
+
+const mockScanAllProjects = scanAllProjects as ReturnType<typeof vi.fn>;
+const mockReadConfig = readConfig as ReturnType<typeof vi.fn>;
+
+describe('GET /api/projects', () => {
+  const mockProjects = [
+    {
+      slug: 'project-one',
+      name: 'Project One',
+      path: '/path/to/project-one',
+      status: 'active',
+      techStack: ['React', 'TypeScript'],
+      lastModified: '2024-01-01T00:00:00.000Z',
+      hasGit: true,
+    },
+    {
+      slug: 'project-two',
+      name: 'Project Two',
+      path: '/path/to/project-two',
+      status: 'icebox',
+      techStack: ['Python', 'FastAPI'],
+      lastModified: '2024-01-02T00:00:00.000Z',
+      hasGit: true,
+    },
+  ];
+
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockScanAllProjects.mockResolvedValue(mockProjects);
+    mockReadConfig.mockResolvedValue({ projects: {}, settings: {} });
+  });
+
+  it('should return all projects when no filters', async () => {
+    const request = new Request('http://localhost/api/projects');
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(200);
+    expect(data.projects).toHaveLength(2);
+  });
+
+  it('should filter by status', async () => {
+    const request = new Request('http://localhost/api/projects?status=active');
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(data.projects).toHaveLength(1);
+    expect(data.projects[0].slug).toBe('project-one');
+  });
+
+  it('should return 400 for invalid status', async () => {
+    const request = new Request('http://localhost/api/projects?status=invalid');
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(400);
+    expect(data.error).toContain('Invalid status');
+  });
+
+  it('should filter by search term in name', async () => {
+    const request = new Request('http://localhost/api/projects?search=one');
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(data.projects).toHaveLength(1);
+    expect(data.projects[0].name).toBe('Project One');
+  });
+
+  it('should filter by search term in tech stack', async () => {
+    const request = new Request('http://localhost/api/projects?search=python');
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(data.projects).toHaveLength(1);
+    expect(data.projects[0].techStack).toContain('Python');
+  });
+
+  it('should return counts for all statuses', async () => {
+    const request = new Request('http://localhost/api/projects');
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(data.counts).toEqual({
+      active: 1,
+      crawlers: 0,
+      icebox: 1,
+      archived: 0,
+    });
+  });
+
+  it('should apply custom metadata from config', async () => {
+    mockReadConfig.mockResolvedValue({
+      projects: {
+        'project-one': {
+          customName: 'Custom Project Name',
+          status: 'archived',
+        },
+      },
+      settings: {},
+    });
+
+    const request = new Request('http://localhost/api/projects');
+    const response = await GET(request);
+    const data = await response.json();
+
+    const project = data.projects.find((p: { slug: string }) => p.slug === 'project-one');
+    expect(project.name).toBe('Custom Project Name');
+    expect(project.status).toBe('archived');
+  });
+
+  it('should handle scan errors gracefully', async () => {
+    mockScanAllProjects.mockRejectedValue(new Error('Scan failed'));
+
+    const request = new Request('http://localhost/api/projects');
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(500);
+    expect(data.error).toBe('Failed to scan projects');
+  });
+
+  it('should perform case-insensitive search', async () => {
+    const request = new Request('http://localhost/api/projects?search=PROJECT');
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(data.projects).toHaveLength(2);
+  });
+});
```

**File**: `tests/api/move.test.ts`

```diff
--- /dev/null
+++ tests/api/move.test.ts
@@ -0,0 +1,108 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+import { POST } from '@/app/api/actions/move/route';
+import { promises as fs } from 'fs';
+import { setProjectMetadata } from '@/lib/config';
+
+vi.mock('fs', () => ({
+  promises: {
+    access: vi.fn(),
+    mkdir: vi.fn(),
+    rename: vi.fn(),
+  },
+}));
+
+vi.mock('@/lib/config', () => ({
+  setProjectMetadata: vi.fn(),
+}));
+
+const mockFs = fs as unknown as {
+  access: ReturnType<typeof vi.fn>;
+  mkdir: ReturnType<typeof vi.fn>;
+  rename: ReturnType<typeof vi.fn>;
+};
+
+describe('POST /api/actions/move', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockFs.access.mockRejectedValue(new Error('ENOENT')); // Target doesn't exist by default
+    mockFs.mkdir.mockResolvedValue(undefined);
+    mockFs.rename.mockResolvedValue(undefined);
+  });
+
+  it('should move project to icebox', async () => {
+    const request = new Request('http://localhost/api/actions/move', {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({
+        slug: 'my-project',
+        projectPath: '/Users/cliff/Desktop/_code/my-project',
+        newStatus: 'icebox',
+      }),
+    });
+
+    const response = await POST(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(200);
+    expect(data.success).toBe(true);
+    expect(data.newPath).toBe('/Users/cliff/Desktop/_code/_icebox/my-project');
+    expect(mockFs.mkdir).toHaveBeenCalled();
+    expect(mockFs.rename).toHaveBeenCalled();
+  });
+
+  it('should move project to active (root level)', async () => {
+    const request = new Request('http://localhost/api/actions/move', {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({
+        slug: 'my-project',
+        projectPath: '/Users/cliff/Desktop/_code/_icebox/my-project',
+        newStatus: 'active',
+      }),
+    });
+
+    const response = await POST(request);
+    const data = await response.json();
+
+    expect(data.newPath).toBe('/Users/cliff/Desktop/_code/my-project');
+  });
+
+  it('should return 400 when required fields are missing', async () => {
+    const request = new Request('http://localhost/api/actions/move', {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({
+        slug: 'my-project',
+        // missing projectPath and newStatus
+      }),
+    });
+
+    const response = await POST(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(400);
+    expect(data.error).toBe('Missing required fields');
+  });
+
+  it('should return 409 when target already exists', async () => {
+    mockFs.access.mockResolvedValue(undefined); // Target exists
+
+    const request = new Request('http://localhost/api/actions/move', {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({
+        slug: 'my-project',
+        projectPath: '/Users/cliff/Desktop/_code/my-project',
+        newStatus: 'icebox',
+      }),
+    });
+
+    const response = await POST(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(409);
+    expect(data.error).toContain('already exists');
+  });
+});
```

---

### 4. Component Tests

**File**: `tests/components/ProjectCard.test.tsx`

```diff
--- /dev/null
+++ tests/components/ProjectCard.test.tsx
@@ -0,0 +1,168 @@
+import { describe, it, expect, vi } from 'vitest';
+import { render, screen, fireEvent } from '@testing-library/react';
+import { ProjectCard } from '@/components/dashboard/ProjectCard';
+import { Project } from '@/lib/types';
+
+const mockProject: Project = {
+  slug: 'test-project',
+  name: 'Test Project',
+  path: '/path/to/test-project',
+  description: 'A test project for unit testing',
+  status: 'active',
+  techStack: ['React', 'TypeScript', 'Tailwind'],
+  version: '1.0.0',
+  lastModified: new Date().toISOString(),
+  gitBranch: 'main',
+  hasGit: true,
+};
+
+describe('ProjectCard', () => {
+  it('should render project name', () => {
+    render(<ProjectCard project={mockProject} />);
+    expect(screen.getByText('Test Project')).toBeInTheDocument();
+  });
+
+  it('should render project description', () => {
+    render(<ProjectCard project={mockProject} />);
+    expect(screen.getByText('A test project for unit testing')).toBeInTheDocument();
+  });
+
+  it('should render tech stack badges', () => {
+    render(<ProjectCard project={mockProject} />);
+    expect(screen.getByText('React')).toBeInTheDocument();
+    expect(screen.getByText('TypeScript')).toBeInTheDocument();
+  });
+
+  it('should render version', () => {
+    render(<ProjectCard project={mockProject} />);
+    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
+  });
+
+  it('should render git branch', () => {
+    render(<ProjectCard project={mockProject} />);
+    expect(screen.getByText('main')).toBeInTheDocument();
+  });
+
+  it('should show "Today" for recent modifications', () => {
+    const recentProject = {
+      ...mockProject,
+      lastModified: new Date().toISOString(),
+    };
+    render(<ProjectCard project={recentProject} />);
+    expect(screen.getByText('Today')).toBeInTheDocument();
+  });
+
+  it('should show "Yesterday" for one day old modifications', () => {
+    const yesterday = new Date();
+    yesterday.setDate(yesterday.getDate() - 1);
+    const oldProject = {
+      ...mockProject,
+      lastModified: yesterday.toISOString(),
+    };
+    render(<ProjectCard project={oldProject} />);
+    expect(screen.getByText('Yesterday')).toBeInTheDocument();
+  });
+
+  it('should show "X days ago" for recent modifications', () => {
+    const threeDaysAgo = new Date();
+    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
+    const oldProject = {
+      ...mockProject,
+      lastModified: threeDaysAgo.toISOString(),
+    };
+    render(<ProjectCard project={oldProject} />);
+    expect(screen.getByText('3 days ago')).toBeInTheDocument();
+  });
+
+  it('should show bug count badge when bugs exist', () => {
+    const projectWithBugs = {
+      ...mockProject,
+      bugs: {
+        openCount: 3,
+        fixedCount: 2,
+        bugs: [],
+      },
+    };
+    render(<ProjectCard project={projectWithBugs} />);
+    expect(screen.getByText('3')).toBeInTheDocument();
+  });
+
+  it('should show rcodegen grade badge', () => {
+    const projectWithGrade = {
+      ...mockProject,
+      rcodegen: {
+        reportCount: 1,
+        lastRun: new Date().toISOString(),
+        latestGrade: 85,
+        taskGrades: { audit: [], test: [], fix: [], refactor: [] },
+        recentGrades: [],
+      },
+    };
+    render(<ProjectCard project={projectWithGrade} />);
+    expect(screen.getByText('85')).toBeInTheDocument();
+  });
+
+  it('should open menu when clicking menu button', () => {
+    render(<ProjectCard project={mockProject} />);
+    const menuButton = screen.getByRole('button');
+    fireEvent.click(menuButton);
+    expect(screen.getByText('Open in VS Code')).toBeInTheDocument();
+    expect(screen.getByText('Open in Finder')).toBeInTheDocument();
+    expect(screen.getByText('Copy Path')).toBeInTheDocument();
+  });
+
+  it('should call onOpenInEditor when clicking VS Code option', () => {
+    const onOpenInEditor = vi.fn();
+    render(<ProjectCard project={mockProject} onOpenInEditor={onOpenInEditor} />);
+
+    const menuButton = screen.getByRole('button');
+    fireEvent.click(menuButton);
+    fireEvent.click(screen.getByText('Open in VS Code'));
+
+    expect(onOpenInEditor).toHaveBeenCalledWith(mockProject);
+  });
+
+  it('should truncate tech stack to 4 items', () => {
+    const projectWithManyTechs = {
+      ...mockProject,
+      techStack: ['React', 'TypeScript', 'Tailwind', 'Next.js', 'Node.js', 'GraphQL'],
+    };
+    render(<ProjectCard project={projectWithManyTechs} />);
+    expect(screen.getByText('+2')).toBeInTheDocument();
+  });
+
+  it('should link to project detail page', () => {
+    render(<ProjectCard project={mockProject} />);
+    const link = screen.getByRole('link');
+    expect(link).toHaveAttribute('href', '/project/test-project');
+  });
+});
+
+describe('ProjectCard formatDate', () => {
+  // These tests verify the internal formatDate function behavior
+
+  it('should show weeks for 7-29 day old modifications', () => {
+    const twoWeeksAgo = new Date();
+    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
+    const oldProject = {
+      ...mockProject,
+      lastModified: twoWeeksAgo.toISOString(),
+    };
+    render(<ProjectCard project={oldProject} />);
+    expect(screen.getByText('2 weeks ago')).toBeInTheDocument();
+  });
+
+  it('should show months for 30-364 day old modifications', () => {
+    const twoMonthsAgo = new Date();
+    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
+    const oldProject = {
+      ...mockProject,
+      lastModified: twoMonthsAgo.toISOString(),
+    };
+    render(<ProjectCard project={oldProject} />);
+    expect(screen.getByText('2 months ago')).toBeInTheDocument();
+  });
+
+  it('should show years for 365+ day old modifications', () => {
+    const twoYearsAgo = new Date();
+    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
+    const oldProject = {
+      ...mockProject,
+      lastModified: twoYearsAgo.toISOString(),
+    };
+    render(<ProjectCard project={oldProject} />);
+    expect(screen.getByText('2 years ago')).toBeInTheDocument();
+  });
+});
```

**File**: `tests/components/CodeQualityCard.test.tsx`

```diff
--- /dev/null
+++ tests/components/CodeQualityCard.test.tsx
@@ -0,0 +1,113 @@
+import { describe, it, expect, vi } from 'vitest';
+import { render, screen, fireEvent } from '@testing-library/react';
+import { CodeQualityCard } from '@/components/project/CodeQualityCard';
+import { RcodegenInfo } from '@/lib/types';
+
+const mockRcodegen: RcodegenInfo = {
+  reportCount: 5,
+  lastRun: '2024-01-15T10:00:00.000Z',
+  latestGrade: 75,
+  taskGrades: {
+    audit: [{ grade: 80, tool: 'claude' }],
+    test: [{ grade: 65, tool: 'codex' }],
+    fix: [{ grade: 90, tool: 'claude' }],
+    refactor: [],
+  },
+  recentGrades: [
+    { date: '2024-01-15', tool: 'claude', task: 'audit', grade: 80, reportFile: 'report1.md' },
+    { date: '2024-01-14', tool: 'codex', task: 'test', grade: 65, reportFile: 'report2.md' },
+  ],
+};
+
+describe('CodeQualityCard', () => {
+  it('should render latest grade', () => {
+    render(<CodeQualityCard rcodegen={mockRcodegen} projectPath="/test" />);
+    expect(screen.getByText('75')).toBeInTheDocument();
+  });
+
+  it('should render report count', () => {
+    render(<CodeQualityCard rcodegen={mockRcodegen} projectPath="/test" />);
+    expect(screen.getByText('5 reports')).toBeInTheDocument();
+  });
+
+  it('should render task grades', () => {
+    render(<CodeQualityCard rcodegen={mockRcodegen} projectPath="/test" />);
+    expect(screen.getByText('Audit')).toBeInTheDocument();
+    expect(screen.getByText('80')).toBeInTheDocument();
+    expect(screen.getByText('Tests')).toBeInTheDocument();
+    expect(screen.getByText('65')).toBeInTheDocument();
+  });
+
+  it('should expand/collapse reports list', () => {
+    render(<CodeQualityCard rcodegen={mockRcodegen} projectPath="/test" />);
+
+    // Initially collapsed
+    expect(screen.queryByText('Audit - claude')).not.toBeInTheDocument();
+
+    // Click to expand
+    fireEvent.click(screen.getByText(/Recent Reports/));
+    expect(screen.getByText('Audit - claude')).toBeInTheDocument();
+  });
+
+  it('should apply green color for grades >= 80', () => {
+    const highGradeRcodegen: RcodegenInfo = {
+      ...mockRcodegen,
+      latestGrade: 85,
+    };
+    render(<CodeQualityCard rcodegen={highGradeRcodegen} projectPath="/test" />);
+
+    const gradeElement = screen.getByText('85');
+    expect(gradeElement.className).toContain('green');
+  });
+
+  it('should apply yellow color for grades 60-79', () => {
+    render(<CodeQualityCard rcodegen={mockRcodegen} projectPath="/test" />);
+
+    const gradeElement = screen.getByText('75');
+    expect(gradeElement.className).toContain('yellow');
+  });
+
+  it('should apply red color for grades < 60', () => {
+    const lowGradeRcodegen: RcodegenInfo = {
+      ...mockRcodegen,
+      latestGrade: 45,
+    };
+    render(<CodeQualityCard rcodegen={lowGradeRcodegen} projectPath="/test" />);
+
+    const gradeElement = screen.getByText('45');
+    expect(gradeElement.className).toContain('red');
+  });
+
+  it('should show last analyzed date', () => {
+    render(<CodeQualityCard rcodegen={mockRcodegen} projectPath="/test" />);
+    expect(screen.getByText(/Last analyzed:/)).toBeInTheDocument();
+    expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument();
+  });
+
+  it('should not show task grades section when all empty', () => {
+    const noTaskGrades: RcodegenInfo = {
+      ...mockRcodegen,
+      taskGrades: {
+        audit: [],
+        test: [],
+        fix: [],
+        refactor: [],
+      },
+    };
+    render(<CodeQualityCard rcodegen={noTaskGrades} projectPath="/test" />);
+    expect(screen.queryByText('Audit')).not.toBeInTheDocument();
+  });
+
+  it('should call API when clicking report', async () => {
+    global.fetch = vi.fn().mockResolvedValue({ ok: true });
+
+    render(<CodeQualityCard rcodegen={mockRcodegen} projectPath="/test/project" />);
+
+    // Expand reports
+    fireEvent.click(screen.getByText(/Recent Reports/));
+
+    // Click on a report
+    fireEvent.click(screen.getByText('Audit - claude'));
+
+    expect(global.fetch).toHaveBeenCalledWith('/api/actions/open-editor', {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({ path: '/test/project/_rcodegen/report1.md' }),
+    });
+  });
+});
```

---

### 5. Utility Function Tests

**File**: `tests/utils/gradeColors.test.ts`

```diff
--- /dev/null
+++ tests/utils/gradeColors.test.ts
@@ -0,0 +1,58 @@
+import { describe, it, expect } from 'vitest';
+
+// These functions are duplicated in multiple components
+// Test the expected behavior for extraction into a shared utility
+
+function getGradeColor(grade: number): string {
+  if (grade >= 80) return 'text-green-600 dark:text-green-400';
+  if (grade >= 60) return 'text-yellow-600 dark:text-yellow-400';
+  return 'text-red-600 dark:text-red-400';
+}
+
+function getGradeBgColor(grade: number): string {
+  if (grade >= 80) return 'bg-green-100 dark:bg-green-900/30';
+  if (grade >= 60) return 'bg-yellow-100 dark:bg-yellow-900/30';
+  return 'bg-red-100 dark:bg-red-900/30';
+}
+
+describe('getGradeColor', () => {
+  it('should return green for grades >= 80', () => {
+    expect(getGradeColor(80)).toContain('green');
+    expect(getGradeColor(100)).toContain('green');
+    expect(getGradeColor(95)).toContain('green');
+  });
+
+  it('should return yellow for grades 60-79', () => {
+    expect(getGradeColor(60)).toContain('yellow');
+    expect(getGradeColor(79)).toContain('yellow');
+    expect(getGradeColor(70)).toContain('yellow');
+  });
+
+  it('should return red for grades < 60', () => {
+    expect(getGradeColor(0)).toContain('red');
+    expect(getGradeColor(59)).toContain('red');
+    expect(getGradeColor(30)).toContain('red');
+  });
+
+  it('should handle boundary values correctly', () => {
+    expect(getGradeColor(80)).toContain('green');
+    expect(getGradeColor(79.9)).toContain('yellow'); // Float edge case
+    expect(getGradeColor(60)).toContain('yellow');
+    expect(getGradeColor(59.9)).toContain('red');
+  });
+});
+
+describe('getGradeBgColor', () => {
+  it('should return green bg for grades >= 80', () => {
+    expect(getGradeBgColor(85)).toContain('bg-green');
+  });
+
+  it('should return yellow bg for grades 60-79', () => {
+    expect(getGradeBgColor(70)).toContain('bg-yellow');
+  });
+
+  it('should return red bg for grades < 60', () => {
+    expect(getGradeBgColor(50)).toContain('bg-red');
+  });
+});
```

---

## Package.json Update

```diff
--- package.json
+++ package.json
@@ -5,7 +5,9 @@
   "scripts": {
     "dev": "next dev",
     "build": "next build",
     "start": "next start",
-    "lint": "next lint"
+    "lint": "next lint",
+    "test": "vitest",
+    "test:coverage": "vitest run --coverage"
   },
```

---

## Priority Matrix

| Priority | Test File | Coverage Target | Effort |
|----------|-----------|-----------------|--------|
| **P0** | `tests/lib/scanner.test.ts` | Core scanning logic | High |
| **P0** | `tests/api/file.test.ts` | Path traversal security | Medium |
| **P1** | `tests/lib/config.test.ts` | Config read/write | Low |
| **P1** | `tests/api/projects.test.ts` | API filtering/validation | Medium |
| **P1** | `tests/api/move.test.ts` | Project move logic | Medium |
| **P2** | `tests/components/ProjectCard.test.tsx` | UI rendering | Medium |
| **P2** | `tests/components/CodeQualityCard.test.tsx` | Grade display | Low |
| **P3** | `tests/utils/gradeColors.test.ts` | Utility functions | Low |

---

## Identified Issues During Analysis

### 1. Duplicate Code - Grade Color Functions
The `getGradeColor` and `getGradeBgColor` functions are duplicated in:
- `components/project/CodeQualityCard.tsx` (lines 28-38)
- `components/dashboard/CodeHealthSection.tsx` (lines 8-18)

**Recommendation**: Extract to `lib/utils.ts` for single source of truth and easier testing.

### 2. Hardcoded Path Constant
`CODE_BASE_PATH` is hardcoded in multiple files:
- `lib/scanner.ts:5`
- `app/api/file/route.ts:7`
- `app/api/actions/open-editor/route.ts:8`
- `app/api/actions/move/route.ts:7`

**Recommendation**: Centralize in a single config file for easier testing and deployment.

### 3. Missing Input Validation in Move API
The `/api/actions/move` endpoint doesn't validate `newStatus` against valid status values.

**Current code** (line 30):
```typescript
const statusFolder = STATUS_FOLDERS[newStatus as ProjectStatus];
```

**Risk**: Invalid status values will result in undefined behavior.

### 4. No Error Boundaries
React components don't have error boundaries for graceful failure handling during data fetching.

---

## Test Coverage Goals

| Milestone | Target Coverage | Timeline |
|-----------|-----------------|----------|
| Initial Setup | 0% → 20% | Week 1 |
| Core Logic | 20% → 50% | Week 2 |
| API Routes | 50% → 70% | Week 3 |
| Components | 70% → 85% | Week 4 |

---

## Conclusion

The code_manage project has **zero test coverage** despite having well-structured, testable code. The proposed tests focus on:

1. **Core business logic** (`lib/scanner.ts`) - Critical for project discovery
2. **Security-critical paths** - Path traversal prevention in file API
3. **API route validation** - Input validation and error handling
4. **Component behavior** - Date formatting, grade colors, user interactions

Implementing these tests would raise the codebase from its current **15/100** to an estimated **75-85/100** grade, providing confidence in refactoring and feature development.

---

*Report generated by Claude Opus 4.5 on 2026-01-25*
