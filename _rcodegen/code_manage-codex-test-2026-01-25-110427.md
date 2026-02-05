Date Created: 2026-01-25 11:04:27 +0100
Date Updated: 2026-01-28
TOTAL_SCORE: 22/100

---

## IMPLEMENTED ITEMS

High-value tests have been added:
- vitest test infrastructure
- API security tests (file, terminal, readme, move routes)
- determineStatus unit test

Most proposed tests were evaluated as low-ROI and not implemented.

# Codebase Unit Test Assessment (Fast Pass)

## Snapshot
- No test runner or test scripts present; no tests directory.
- Core logic lives in `lib/` (scanner/config) and API routes under `app/api/`.
- Client components contain logic worth testing (filtering, menus, grade rendering).

## Score Rationale (22/100)
- Test tooling: 0/20 (no runner, no test scripts, no configs).
- Core logic coverage: 5/35 (scanner/config are untested).
- API route coverage: 5/20 (no route tests, path validation unverified).
- UI coverage: 3/15 (no component tests).
- Risk controls: 9/10 (TypeScript, small modules, linting).

## Untested High-Risk Areas
- `lib/scanner.ts` (filesystem traversal, tech detection, bug/rcodegen parsing).
- `lib/config.ts` (config persistence/merging; metadata writes).
- `app/api/projects/route.ts` (filtering/search/counts; metadata overlay).
- `app/api/file/route.ts` (path traversal guard; error modes).
- UI client logic in `components/dashboard/` (search and menu interactions).

## Proposed Unit Tests (Priority Order)
1. **Scanner logic**: tech detection, README extraction, version precedence, bug parsing, rcodegen parsing, status determination.
2. **Config persistence**: defaults merge, metadata update, settings update.
3. **API routes**: projects list filtering, invalid status 400, file path validation 403/404.
4. **UI interactions**: SearchBar input + clear; ProjectCard menu actions; ProjectGrid search filtering.
5. **Edge cases**: scanRcodegen fallback parsing, scanBugs sorting, missing/invalid JSON handling.

## Patch-Ready Diffs
Below are focused diffs to add a minimal test runner and high-value unit tests. These do not modify runtime logic.

```diff
diff --git a/package.json b/package.json
index 1e3f9a7..77c7f0c 100644
--- a/package.json
+++ b/package.json
@@ -6,10 +6,12 @@
   "scripts": {
     "dev": "next dev",
     "build": "next build",
     "start": "next start",
-    "lint": "next lint"
+    "lint": "next lint",
+    "test": "vitest run",
+    "test:watch": "vitest"
   },
   "dependencies": {
@@ -23,11 +25,16 @@
   "devDependencies": {
     "@types/node": "^20",
     "@types/react": "^18",
     "@types/react-dom": "^18",
+    "@testing-library/jest-dom": "^6.4.2",
+    "@testing-library/react": "^14.3.1",
+    "@testing-library/user-event": "^14.5.2",
     "eslint": "^8",
     "eslint-config-next": "14.2.33",
+    "jsdom": "^24.0.0",
     "postcss": "^8",
     "tailwindcss": "^3.4.1",
-    "typescript": "^5"
+    "typescript": "^5",
+    "vitest": "^1.6.0"
   }
 }
```

```diff
diff --git a/vitest.config.ts b/vitest.config.ts
new file mode 100644
--- /dev/null
+++ b/vitest.config.ts
@@ -0,0 +1,15 @@
+import { defineConfig } from 'vitest/config';
+import path from 'path';
+
+export default defineConfig({
+  test: {
+    environment: 'jsdom',
+    setupFiles: ['./tests/setup.ts'],
+    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
+  },
+  resolve: {
+    alias: {
+      '@': path.resolve(__dirname, '.'),
+    },
+  },
+});
```

```diff
diff --git a/tests/setup.ts b/tests/setup.ts
new file mode 100644
--- /dev/null
+++ b/tests/setup.ts
@@ -0,0 +1 @@
+import '@testing-library/jest-dom/vitest';
```

```diff
diff --git a/tests/lib/config.test.ts b/tests/lib/config.test.ts
new file mode 100644
--- /dev/null
+++ b/tests/lib/config.test.ts
@@ -0,0 +1,85 @@
+// @vitest-environment node
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { promises as fs } from 'fs';
+import path from 'path';
+import os from 'os';
+import { DEFAULT_CONFIG } from '@/lib/types';
+
+let tempDir = '';
+
+vi.mock('@/lib/scanner', () => ({
+  getCodeBasePath: () => tempDir,
+}));
+
+import {
+  readConfig,
+  writeConfig,
+  getProjectMetadata,
+  setProjectMetadata,
+  updateSettings,
+} from '@/lib/config';
+
+describe('config', () => {
+  beforeEach(async () => {
+    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-manage-config-'));
+  });
+
+  afterEach(async () => {
+    if (tempDir) {
+      await fs.rm(tempDir, { recursive: true, force: true });
+    }
+  });
+
+  it('returns defaults when config is missing', async () => {
+    const config = await readConfig();
+    expect(config).toEqual(DEFAULT_CONFIG);
+  });
+
+  it('merges settings with defaults', async () => {
+    const configPath = path.join(tempDir, '.code-manage.json');
+    await fs.writeFile(
+      configPath,
+      JSON.stringify({ settings: { sidebarCollapsed: true } }),
+      'utf-8'
+    );
+
+    const config = await readConfig();
+    expect(config.settings.sidebarCollapsed).toBe(true);
+    expect(config.settings.defaultStatus).toBe(DEFAULT_CONFIG.settings.defaultStatus);
+    expect(config.settings.terminalHeight).toBe(DEFAULT_CONFIG.settings.terminalHeight);
+  });
+
+  it('writes and reads project metadata', async () => {
+    await setProjectMetadata('alpha', { customName: 'Alpha', status: 'icebox' });
+
+    const metadata = await getProjectMetadata('alpha');
+    expect(metadata).toEqual({ customName: 'Alpha', status: 'icebox' });
+  });
+
+  it('updates settings without losing defaults', async () => {
+    await updateSettings({ sidebarCollapsed: true });
+
+    const config = await readConfig();
+    expect(config.settings.sidebarCollapsed).toBe(true);
+    expect(config.settings.defaultStatus).toBe(DEFAULT_CONFIG.settings.defaultStatus);
+    expect(config.settings.terminalHeight).toBe(DEFAULT_CONFIG.settings.terminalHeight);
+  });
+
+  it('writes config file on demand', async () => {
+    await writeConfig({
+      ...DEFAULT_CONFIG,
+      settings: { ...DEFAULT_CONFIG.settings, sidebarCollapsed: true },
+    });
+
+    const configPath = path.join(tempDir, '.code-manage.json');
+    const content = await fs.readFile(configPath, 'utf-8');
+    expect(JSON.parse(content).settings.sidebarCollapsed).toBe(true);
+  });
+});
```

```diff
diff --git a/tests/lib/scanner.test.ts b/tests/lib/scanner.test.ts
new file mode 100644
--- /dev/null
+++ b/tests/lib/scanner.test.ts
@@ -0,0 +1,171 @@
+// @vitest-environment node
+import { afterEach, beforeEach, describe, expect, it } from 'vitest';
+import { promises as fs } from 'fs';
+import path from 'path';
+import os from 'os';
+import {
+  detectTechStack,
+  extractDescription,
+  getVersion,
+  scanBugs,
+  scanRcodegen,
+  determineStatus,
+} from '@/lib/scanner';
+
+let tempDir = '';
+
+async function writeFile(relativePath: string, content: string) {
+  const filePath = path.join(tempDir, relativePath);
+  await fs.mkdir(path.dirname(filePath), { recursive: true });
+  await fs.writeFile(filePath, content, 'utf-8');
+}
+
+describe('scanner', () => {
+  beforeEach(async () => {
+    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-manage-scan-'));
+  });
+
+  afterEach(async () => {
+    if (tempDir) {
+      await fs.rm(tempDir, { recursive: true, force: true });
+    }
+  });
+
+  it('detects JavaScript ecosystem frameworks', async () => {
+    await writeFile(
+      'package.json',
+      JSON.stringify({
+        dependencies: {
+          next: '^13.0.0',
+          react: '^18.0.0',
+          tailwindcss: '^3.0.0',
+          typescript: '^5.0.0',
+        },
+      })
+    );
+
+    const techs = await detectTechStack(tempDir);
+    expect(techs).toEqual(['Next.js', 'React', 'Tailwind', 'TypeScript']);
+  });
+
+  it('adds Node.js when no framework is detected', async () => {
+    await writeFile(
+      'package.json',
+      JSON.stringify({ dependencies: { lodash: '^4.0.0' } })
+    );
+
+    const techs = await detectTechStack(tempDir);
+    expect(techs).toEqual(['Node.js']);
+  });
+
+  it('detects Python frameworks from pyproject', async () => {
+    await writeFile('pyproject.toml', 'fastapi\ndjango');
+
+    const techs = await detectTechStack(tempDir);
+    expect(techs[0]).toBe('Python');
+    expect(techs).toEqual(expect.arrayContaining(['FastAPI', 'Django']));
+  });
+
+  it('extracts description from package.json', async () => {
+    await writeFile('package.json', JSON.stringify({ description: 'Hello world' }));
+
+    const description = await extractDescription(tempDir);
+    expect(description).toBe('Hello world');
+  });
+
+  it('extracts description from README when missing in package.json', async () => {
+    await writeFile('README.md', '# Title\n\nFirst paragraph here.\n\nSecond.');
+
+    const description = await extractDescription(tempDir);
+    expect(description).toBe('First paragraph here.');
+  });
+
+  it('prefers VERSION over package.json for version detection', async () => {
+    await writeFile('VERSION', '1.2.3\n');
+    await writeFile('package.json', JSON.stringify({ version: '9.9.9' }));
+
+    const version = await getVersion(tempDir);
+    expect(version).toBe('1.2.3');
+  });
+
+  it('scans bug files and sorts newest first', async () => {
+    await writeFile('_bugs_open/2026-01-10-first-bug.md', '# First bug\nDetails');
+    await writeFile('_bugs_fixed/2026-01-12-fixed-bug.md', '# Fixed bug\nDetails');
+
+    const bugs = await scanBugs(tempDir);
+    expect(bugs?.openCount).toBe(1);
+    expect(bugs?.fixedCount).toBe(1);
+    expect(bugs?.bugs[0].filename).toBe('2026-01-12-fixed-bug.md');
+  });
+
+  it('reads rcodegen grades from .grades.json', async () => {
+    await writeFile(
+      '_rcodegen/.grades.json',
+      JSON.stringify({
+        grades: [
+          {
+            date: '2026-01-01T00:00:00.000Z',
+            tool: 'codex',
+            task: 'audit',
+            grade: 90,
+            reportFile: 'audit.md',
+          },
+          {
+            date: '2026-01-02T00:00:00.000Z',
+            tool: 'codex',
+            task: 'test',
+            grade: 80,
+            reportFile: 'test.md',
+          },
+        ],
+      })
+    );
+
+    const info = await scanRcodegen(tempDir);
+    expect(info?.latestGrade).toBe(80);
+    expect(info?.taskGrades.test[0]).toEqual({ grade: 80, tool: 'codex' });
+  });
+
+  it('falls back to parsing report files when .grades.json is missing', async () => {
+    await writeFile('_rcodegen/proj-codex-test-2026-01-05.md', 'TOTAL_SCORE: 75/100');
+
+    const info = await scanRcodegen(tempDir);
+    expect(info?.latestGrade).toBe(75);
+    expect(info?.taskGrades.test[0]).toEqual({ grade: 75, tool: 'codex' });
+  });
+
+  it('derives status from path segments', () => {
+    expect(determineStatus('/Users/cliff/Desktop/_code/_icebox/demo')).toBe('icebox');
+    expect(determineStatus('/Users/cliff/Desktop/_code/demo')).toBe('active');
+  });
+});
```

```diff
diff --git a/tests/api/projects.test.ts b/tests/api/projects.test.ts
new file mode 100644
--- /dev/null
+++ b/tests/api/projects.test.ts
@@ -0,0 +1,116 @@
+// @vitest-environment node
+import { beforeEach, describe, expect, it, vi } from 'vitest';
+import type { Project } from '@/lib/types';
+
+const scanAllProjects = vi.fn();
+const readConfig = vi.fn();
+
+vi.mock('@/lib/scanner', () => ({ scanAllProjects }));
+vi.mock('@/lib/config', () => ({ readConfig }));
+
+import { GET } from '@/app/api/projects/route';
+
+const baseConfig = {
+  projects: {},
+  settings: {
+    sidebarCollapsed: false,
+    defaultStatus: 'active',
+    terminalHeight: 300,
+  },
+};
+
+const projectA: Project = {
+  slug: 'alpha',
+  name: 'Alpha',
+  path: '/tmp/alpha',
+  status: 'active',
+  techStack: ['React'],
+  lastModified: new Date('2026-01-01T00:00:00.000Z').toISOString(),
+  hasGit: false,
+};
+
+const projectB: Project = {
+  slug: 'bravo',
+  name: 'Bravo',
+  path: '/tmp/bravo',
+  status: 'icebox',
+  techStack: ['Python'],
+  lastModified: new Date('2026-01-02T00:00:00.000Z').toISOString(),
+  hasGit: true,
+};
+
+describe('GET /api/projects', () => {
+  beforeEach(() => {
+    scanAllProjects.mockReset();
+    readConfig.mockReset();
+  });
+
+  it('returns 400 for invalid status', async () => {
+    const res = await GET(new Request('http://localhost/api/projects?status=bad'));
+    expect(res.status).toBe(400);
+  });
+
+  it('filters by status and search term', async () => {
+    scanAllProjects.mockResolvedValue([projectA, projectB]);
+    readConfig.mockResolvedValue(baseConfig);
+
+    const res = await GET(new Request('http://localhost/api/projects?status=active&search=react'));
+    const body = await res.json();
+
+    expect(body.projects).toHaveLength(1);
+    expect(body.projects[0].slug).toBe('alpha');
+  });
+
+  it('applies metadata overrides and updates counts', async () => {
+    scanAllProjects.mockResolvedValue([projectA, projectB]);
+    readConfig.mockResolvedValue({
+      ...baseConfig,
+      projects: {
+        alpha: {
+          customName: 'Alpha Prime',
+          status: 'icebox',
+        },
+      },
+    });
+
+    const res = await GET(new Request('http://localhost/api/projects'));
+    const body = await res.json();
+
+    expect(body.counts.icebox).toBe(2);
+    expect(body.projects.find((p: Project) => p.slug === 'alpha').name).toBe('Alpha Prime');
+  });
+});
```

```diff
diff --git a/tests/api/file.test.ts b/tests/api/file.test.ts
new file mode 100644
--- /dev/null
+++ b/tests/api/file.test.ts
@@ -0,0 +1,36 @@
+// @vitest-environment node
+import { describe, expect, it } from 'vitest';
+import path from 'path';
+import { GET } from '@/app/api/file/route';
+
+const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';
+
+describe('GET /api/file', () => {
+  it('returns 400 when path is missing', async () => {
+    const res = await GET(new Request('http://localhost/api/file'));
+    expect(res.status).toBe(400);
+  });
+
+  it('returns 403 for traversal paths', async () => {
+    const res = await GET(
+      new Request('http://localhost/api/file?path=' + encodeURIComponent('../../etc/passwd'))
+    );
+    expect(res.status).toBe(403);
+  });
+
+  it('returns 404 when file does not exist in base path', async () => {
+    const missingPath = path.join(CODE_BASE_PATH, `__missing_${Date.now()}__`);
+    const res = await GET(
+      new Request('http://localhost/api/file?path=' + encodeURIComponent(missingPath))
+    );
+    expect(res.status).toBe(404);
+  });
+});
```

```diff
diff --git a/tests/components/SearchBar.test.tsx b/tests/components/SearchBar.test.tsx
new file mode 100644
--- /dev/null
+++ b/tests/components/SearchBar.test.tsx
@@ -0,0 +1,25 @@
+import { describe, expect, it, vi } from 'vitest';
+import { fireEvent, render, screen } from '@testing-library/react';
+import { SearchBar } from '@/components/dashboard/SearchBar';
+
+describe('SearchBar', () => {
+  it('calls onChange when typing', () => {
+    const onChange = vi.fn();
+    render(<SearchBar value="" onChange={onChange} />);
+
+    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'alpha' } });
+    expect(onChange).toHaveBeenCalledWith('alpha');
+  });
+
+  it('clears when clicking the clear button', () => {
+    const onChange = vi.fn();
+    render(<SearchBar value="alpha" onChange={onChange} />);
+
+    fireEvent.click(screen.getByRole('button'));
+    expect(onChange).toHaveBeenCalledWith('');
+  });
+});
```

## Additional High-Value Tests (Not In Diff)
- `lib/scanner.ts`: `scanProject` (slug formatting, ignored folders), `scanAllProjects` (filters/sorting) via fs mocks.
- `app/api/projects/[slug]/route.ts`: 404 for missing project, PATCH writes metadata.
- `app/api/actions/*`: 400/403 guards and `execFile` invocation (mock child_process).
- `components/dashboard/ProjectCard.tsx`: menu open/close, action callbacks, date formatting.
- `components/project/CodeQualityCard.tsx`: grade badges, recent reports toggle.
- `components/project/BugsCard.tsx`: open/fixed toggle and modal fetch behavior.

## Suggested Test Commands
- `npm run test`
- `npm run test:watch`
