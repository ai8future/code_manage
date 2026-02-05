Date Created: 2026-01-28 18:39:15 CET
TOTAL_SCORE: 58/100

**Scope**
- Reviewed existing tests in tests/api and tests/lib
- Inspected lib and app/api modules for untested logic
- Skipped deep UI coverage (needs jsdom/testing-library); noted optional additions

**Score Rationale**
- Existing tests cover some API security paths and basic scanner status
- Large portions of config, utils, ports, and key API routes are untested
- No tests for docs endpoints, open-action route, or scanner helpers
- No client/hook/component tests

**Key Untested Areas**
- `lib/config.ts` (locking, merge semantics, persistence)
- `lib/ports.ts` and `lib/utils/*`
- `lib/api/createOpenActionRoute.ts` + open-editor/open-finder routes
- `app/api/projects` list and slug endpoints
- `app/api/projects/docs` list and per-file endpoints
- `lib/scanner.ts` helpers beyond determineStatus
- Client hooks/components (requires jsdom/testing-library)

**Proposed Unit Tests (High Value)**
- Config: defaults on missing/invalid, settings merge, metadata merge, lock usage
- Ports: deterministic mapping and bounds
- Utils: grade thresholds, relative date boundaries, short-date format
- Open action route: missing/invalid path, symlink escape, success path executes
- Projects list: invalid status, metadata overrides, counts, sorting, search
- Project slug: 404, metadata merge, PATCH validation & success
- Docs list: ignore README/hidden, preview extraction, date sorting
- Docs file: filename/path validation, GET existing/new, PUT writes front matter
- Scanner helpers: detectTechStack, extractDescription, getVersion, scanBugs, scanRcodegen, isProjectDirectory

**Patch-Ready Diffs**
```diff
diff --git a/tests/lib/config.test.ts b/tests/lib/config.test.ts
new file mode 100644
index 0000000..1c2d3e4
--- /dev/null
+++ b/tests/lib/config.test.ts
@@ -0,0 +1,98 @@
+import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
+import { promises as fs } from 'fs';
+import os from 'os';
+import path from 'path';
+import { DEFAULT_CONFIG } from '@/lib/types';
+import { readConfig, writeConfig, setProjectMetadata, updateSettings } from '@/lib/config';
+
+let baseDir = '';
+
+const lockMock = vi.fn().mockResolvedValue(async () => {});
+vi.mock('proper-lockfile', () => ({
+  default: { lock: lockMock },
+}));
+
+vi.mock('@/lib/scanner', () => ({
+  getCodeBasePath: () => baseDir,
+}));
+
+function getConfigPath() {
+  return path.join(baseDir, '.code-manage.json');
+}
+
+describe('config', () => {
+  let tempDir: string;
+
+  beforeEach(async () => {
+    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-manage-config-'));
+    baseDir = tempDir;
+    lockMock.mockClear();
+  });
+
+  afterEach(async () => {
+    await fs.rm(tempDir, { recursive: true, force: true });
+  });
+
+  it('returns defaults when config file is missing', async () => {
+    const config = await readConfig();
+    expect(config).toEqual(DEFAULT_CONFIG);
+  });
+
+  it('returns defaults when config file is invalid', async () => {
+    await fs.writeFile(getConfigPath(), '{not-json}', 'utf-8');
+    const config = await readConfig();
+    expect(config).toEqual(DEFAULT_CONFIG);
+  });
+
+  it('merges settings with defaults', async () => {
+    await fs.writeFile(
+      getConfigPath(),
+      JSON.stringify({ projects: {}, settings: { sidebarCollapsed: true } }),
+      'utf-8'
+    );
+
+    const config = await readConfig();
+    expect(config.settings.sidebarCollapsed).toBe(true);
+    expect(config.settings.defaultStatus).toBe(DEFAULT_CONFIG.settings.defaultStatus);
+    expect(config.settings.terminalHeight).toBe(DEFAULT_CONFIG.settings.terminalHeight);
+  });
+
+  it('writes config to disk', async () => {
+    const nextConfig = {
+      projects: { alpha: { customName: 'Alpha' } },
+      settings: { sidebarCollapsed: true, defaultStatus: 'icebox', terminalHeight: 420 },
+    };
+    await writeConfig(nextConfig);
+
+    const parsed = JSON.parse(await fs.readFile(getConfigPath(), 'utf-8'));
+    expect(parsed).toEqual(nextConfig);
+  });
+
+  it('setProjectMetadata merges and persists per project', async () => {
+    await setProjectMetadata('alpha', { customName: 'Alpha' });
+    await setProjectMetadata('alpha', { notes: 'Some notes' });
+
+    const parsed = JSON.parse(await fs.readFile(getConfigPath(), 'utf-8'));
+    expect(parsed.projects.alpha.customName).toBe('Alpha');
+    expect(parsed.projects.alpha.notes).toBe('Some notes');
+    expect(lockMock).toHaveBeenCalled();
+  });
+
+  it('updateSettings merges and persists settings', async () => {
+    await updateSettings({ terminalHeight: 512 });
+
+    const parsed = JSON.parse(await fs.readFile(getConfigPath(), 'utf-8'));
+    expect(parsed.settings.terminalHeight).toBe(512);
+    expect(parsed.settings.sidebarCollapsed).toBe(DEFAULT_CONFIG.settings.sidebarCollapsed);
+    expect(lockMock).toHaveBeenCalled();
+  });
+});
```

```diff
diff --git a/tests/lib/ports.test.ts b/tests/lib/ports.test.ts
new file mode 100644
index 0000000..abcd123
--- /dev/null
+++ b/tests/lib/ports.test.ts
@@ -0,0 +1,29 @@
+import { describe, it, expect } from 'vitest';
+import { getPortFromDirectory, getPortConfig } from '@/lib/ports';
+
+describe('ports', () => {
+  it('returns deterministic port for the same directory', () => {
+    const first = getPortFromDirectory('alpha');
+    const second = getPortFromDirectory('alpha');
+    expect(first).toBe(second);
+  });
+
+  it('returns a port within the configured range', () => {
+    const { MIN_PORT, MAX_PORT } = getPortConfig();
+    const port = getPortFromDirectory('alpha');
+    expect(port).toBeGreaterThanOrEqual(MIN_PORT);
+    expect(port).toBeLessThanOrEqual(MAX_PORT);
+  });
+
+  it('returns different ports for different directory names (smoke test)', () => {
+    const alpha = getPortFromDirectory('alpha');
+    const beta = getPortFromDirectory('beta');
+    expect(alpha).not.toBe(beta);
+  });
+
+  it('exposes port configuration constants', () => {
+    const { MIN_PORT, MAX_PORT } = getPortConfig();
+    expect(MIN_PORT).toBe(5000);
+    expect(MAX_PORT).toBe(49000);
+  });
+});
```

```diff
diff --git a/tests/lib/utils/grades.test.ts b/tests/lib/utils/grades.test.ts
new file mode 100644
index 0000000..1234abc
--- /dev/null
+++ b/tests/lib/utils/grades.test.ts
@@ -0,0 +1,33 @@
+import { describe, it, expect } from 'vitest';
+import { getGradeBgColor, getGradeClasses, getGradeColor } from '@/lib/utils/grades';
+
+describe('grade utils', () => {
+  it('returns green styles for grades >= 80', () => {
+    expect(getGradeColor(80)).toContain('green');
+    expect(getGradeBgColor(95)).toContain('green');
+    expect(getGradeClasses(100)).toContain('green');
+  });
+
+  it('returns yellow styles for grades >= 60 and < 80', () => {
+    expect(getGradeColor(60)).toContain('yellow');
+    expect(getGradeBgColor(79)).toContain('yellow');
+    expect(getGradeClasses(70)).toContain('yellow');
+  });
+
+  it('returns red styles for grades below 60', () => {
+    expect(getGradeColor(59)).toContain('red');
+    expect(getGradeBgColor(0)).toContain('red');
+    expect(getGradeClasses(10)).toContain('red');
+  });
+});
```

```diff
diff --git a/tests/lib/utils/dates.test.ts b/tests/lib/utils/dates.test.ts
new file mode 100644
index 0000000..5678def
--- /dev/null
+++ b/tests/lib/utils/dates.test.ts
@@ -0,0 +1,34 @@
+import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
+import { formatRelativeDate, formatShortDate } from '@/lib/utils/dates';
+
+describe('date utils', () => {
+  beforeEach(() => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date('2025-01-10T12:00:00'));
+  });
+
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('formats relative dates across ranges', () => {
+    expect(formatRelativeDate('2025-01-10T00:00:00')).toBe('Today');
+    expect(formatRelativeDate('2025-01-09T12:00:00')).toBe('Yesterday');
+    expect(formatRelativeDate('2025-01-04T12:00:00')).toBe('6 days ago');
+    expect(formatRelativeDate('2024-12-31T12:00:00')).toBe('1 weeks ago');
+    expect(formatRelativeDate('2024-12-01T12:00:00')).toBe('1 months ago');
+    expect(formatRelativeDate('2024-01-01T12:00:00')).toBe('1 years ago');
+  });
+
+  it('formats short dates in en-US format', () => {
+    expect(formatShortDate('2025-01-10T12:00:00')).toBe('Jan 10, 2025');
+  });
+});
```

```diff
diff --git a/tests/lib/api/createOpenActionRoute.test.ts b/tests/lib/api/createOpenActionRoute.test.ts
new file mode 100644
index 0000000..89abcde
--- /dev/null
+++ b/tests/lib/api/createOpenActionRoute.test.ts
@@ -0,0 +1,130 @@
+import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
+import { promises as fs } from 'fs';
+import os from 'os';
+import path from 'path';
+
+let baseDir = '';
+
+const execFileMock = vi.fn((command: string, args: string[], options: unknown, callback?: (err: Error | null, stdout: string, stderr: string) => void) => {
+  if (typeof options === 'function') {
+    (options as (err: Error | null, stdout: string, stderr: string) => void)(null, '', '');
+    return;
+  }
+  if (callback) {
+    callback(null, '', '');
+  }
+});
+
+vi.mock('child_process', () => ({
+  execFile: execFileMock,
+}));
+
+vi.mock('@/lib/constants', () => ({
+  CODE_BASE_PATH: baseDir,
+}));
+
+async function loadPost() {
+  vi.resetModules();
+  const { createOpenActionRoute } = await import('@/lib/api/createOpenActionRoute');
+  return createOpenActionRoute('open');
+}
+
+describe('createOpenActionRoute', () => {
+  let tempDir: string;
+
+  beforeEach(async () => {
+    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-manage-open-'));
+    baseDir = tempDir;
+    execFileMock.mockClear();
+  });
+
+  afterEach(async () => {
+    await fs.rm(tempDir, { recursive: true, force: true });
+  });
+
+  it('returns 400 when path is missing', async () => {
+    const POST = await loadPost();
+    const request = new Request('http://localhost/api/actions/open', {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({}),
+    });
+    const response = await POST(request);
+
+    expect(response.status).toBe(400);
+    expect(execFileMock).not.toHaveBeenCalled();
+  });
+
+  it('returns 403 for paths outside CODE_BASE_PATH', async () => {
+    const POST = await loadPost();
+    const request = new Request('http://localhost/api/actions/open', {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({ path: '/etc/passwd' }),
+    });
+    const response = await POST(request);
+
+    expect(response.status).toBe(403);
+    expect(execFileMock).not.toHaveBeenCalled();
+  });
+
+  it('returns 404 when target path does not exist', async () => {
+    const POST = await loadPost();
+    const missingPath = path.join(tempDir, 'missing');
+    const request = new Request('http://localhost/api/actions/open', {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({ path: missingPath }),
+    });
+    const response = await POST(request);
+
+    expect(response.status).toBe(404);
+    expect(execFileMock).not.toHaveBeenCalled();
+  });
+
+  it('returns 403 for symlinks that resolve outside CODE_BASE_PATH', async () => {
+    const POST = await loadPost();
+    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-manage-outside-'));
+    const outsideFile = path.join(outsideDir, 'outside.txt');
+    await fs.writeFile(outsideFile, 'outside', 'utf-8');
+    const linkPath = path.join(tempDir, 'link.txt');
+    await fs.symlink(outsideFile, linkPath);
+
+    const request = new Request('http://localhost/api/actions/open', {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({ path: linkPath }),
+    });
+    const response = await POST(request);
+
+    expect(response.status).toBe(403);
+    expect(execFileMock).not.toHaveBeenCalled();
+    await fs.rm(outsideDir, { recursive: true, force: true });
+  });
+
+  it('executes command for valid paths', async () => {
+    const POST = await loadPost();
+    const targetDir = path.join(tempDir, 'project');
+    await fs.mkdir(targetDir);
+
+    const request = new Request('http://localhost/api/actions/open', {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({ path: targetDir }),
+    });
+    const response = await POST(request);
+
+    expect(response.status).toBe(200);
+    expect(execFileMock).toHaveBeenCalled();
+    const callArgs = execFileMock.mock.calls[0];
+    expect(callArgs[0]).toBe('open');
+    expect(callArgs[1]).toContain(targetDir);
+  });
+});
```

```diff
diff --git a/tests/api/projects.test.ts b/tests/api/projects.test.ts
new file mode 100644
index 0000000..2345bcd
--- /dev/null
+++ b/tests/api/projects.test.ts
@@ -0,0 +1,118 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+import { GET } from '@/app/api/projects/route';
+import { Project } from '@/lib/types';
+
+const scanAllProjectsMock = vi.fn();
+const readConfigMock = vi.fn();
+
+vi.mock('@/lib/scanner', () => ({
+  scanAllProjects: scanAllProjectsMock,
+}));
+
+vi.mock('@/lib/config', () => ({
+  readConfig: readConfigMock,
+}));
+
+function makeProject(overrides: Partial<Project>): Project {
+  return {
+    slug: 'alpha',
+    name: 'Alpha',
+    path: '/tmp/alpha',
+    description: 'Alpha project',
+    status: 'active',
+    techStack: ['React'],
+    version: undefined,
+    lastModified: '2025-01-01T00:00:00.000Z',
+    hasGit: false,
+    ...overrides,
+  };
+}
+
+describe('GET /api/projects', () => {
+  beforeEach(() => {
+    scanAllProjectsMock.mockReset();
+    readConfigMock.mockReset();
+  });
+
+  it('rejects invalid status values', async () => {
+    const request = new Request('http://localhost/api/projects?status=invalid');
+    const response = await GET(request);
+
+    expect(response.status).toBe(400);
+    expect(scanAllProjectsMock).not.toHaveBeenCalled();
+  });
+
+  it('applies metadata overrides, counts, and sorting', async () => {
+    scanAllProjectsMock.mockResolvedValue([
+      makeProject({ slug: 'alpha', name: 'Alpha', status: 'active' }),
+      makeProject({ slug: 'beta', name: 'Beta', status: 'icebox', techStack: ['Go'] }),
+    ]);
+    readConfigMock.mockResolvedValue({
+      projects: {
+        beta: {
+          customName: 'Bee',
+          customDescription: 'Bee desc',
+          status: 'active',
+          starred: true,
+        },
+      },
+      settings: { sidebarCollapsed: false, defaultStatus: 'active', terminalHeight: 300 },
+    });
+
+    const request = new Request('http://localhost/api/projects');
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(200);
+    expect(data.counts.active).toBe(2);
+    expect(data.counts.icebox).toBe(0);
+    expect(data.projects[0].slug).toBe('beta');
+    expect(data.projects[0].name).toBe('Bee');
+  });
+
+  it('filters by search term', async () => {
+    scanAllProjectsMock.mockResolvedValue([
+      makeProject({ slug: 'alpha', name: 'Alpha', techStack: ['React'] }),
+      makeProject({ slug: 'beta', name: 'Beta', techStack: ['Go'] }),
+    ]);
+    readConfigMock.mockResolvedValue({
+      projects: {},
+      settings: { sidebarCollapsed: false, defaultStatus: 'active', terminalHeight: 300 },
+    });
+
+    const request = new Request('http://localhost/api/projects?search=react');
+    const response = await GET(request);
+    const data = await response.json();
+
+    expect(response.status).toBe(200);
+    expect(data.projects).toHaveLength(1);
+    expect(data.projects[0].slug).toBe('alpha');
+  });
+});
```

```diff
diff --git a/tests/api/projects-slug.test.ts b/tests/api/projects-slug.test.ts
new file mode 100644
index 0000000..3456cde
--- /dev/null
+++ b/tests/api/projects-slug.test.ts
@@ -0,0 +1,128 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+import { GET, PATCH } from '@/app/api/projects/[slug]/route';
+import { Project } from '@/lib/types';
+
+const scanAllProjectsMock = vi.fn();
+const getProjectMetadataMock = vi.fn();
+const setProjectMetadataMock = vi.fn();
+
+vi.mock('@/lib/scanner', () => ({
+  scanAllProjects: scanAllProjectsMock,
+}));
+
+vi.mock('@/lib/config', () => ({
+  getProjectMetadata: getProjectMetadataMock,
+  setProjectMetadata: setProjectMetadataMock,
+}));
+
+function makeProject(overrides: Partial<Project>): Project {
+  return {
+    slug: 'alpha',
+    name: 'Alpha',
+    path: '/tmp/alpha',
+    description: 'Alpha project',
+    status: 'active',
+    techStack: ['React'],
+    version: undefined,
+    lastModified: '2025-01-01T00:00:00.000Z',
+    hasGit: false,
+    ...overrides,
+  };
+}
+
+describe('GET /api/projects/[slug]', () => {
+  beforeEach(() => {
+    scanAllProjectsMock.mockReset();
+    getProjectMetadataMock.mockReset();
+    setProjectMetadataMock.mockReset();
+  });
+
+  it('returns 404 when project is missing', async () => {
+    scanAllProjectsMock.mockResolvedValue([]);
+    const response = await GET(new Request('http://localhost'), {
+      params: Promise.resolve({ slug: 'missing' }),
+    });
+
+    expect(response.status).toBe(404);
+  });
+
+  it('applies project metadata', async () => {
+    scanAllProjectsMock.mockResolvedValue([makeProject({ slug: 'alpha' })]);
+    getProjectMetadataMock.mockResolvedValue({
+      customName: 'Alpha Custom',
+      customDescription: 'Custom desc',
+      tags: ['tag1'],
+      notes: 'Notes',
+      status: 'icebox',
+      starred: true,
+    });
+
+    const response = await GET(new Request('http://localhost'), {
+      params: Promise.resolve({ slug: 'alpha' }),
+    });
+    const data = await response.json();
+
+    expect(response.status).toBe(200);
+    expect(data.name).toBe('Alpha Custom');
+    expect(data.description).toBe('Custom desc');
+    expect(data.status).toBe('icebox');
+    expect(data.tags).toEqual(['tag1']);
+    expect(data.starred).toBe(true);
+  });
+});
+
+describe('PATCH /api/projects/[slug]', () => {
+  beforeEach(() => {
+    scanAllProjectsMock.mockReset();
+    getProjectMetadataMock.mockReset();
+    setProjectMetadataMock.mockReset();
+  });
+
+  it('validates status field', async () => {
+    const request = new Request('http://localhost', {
+      method: 'PATCH',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({ status: 'nope' }),
+    });
+    const response = await PATCH(request, {
+      params: Promise.resolve({ slug: 'alpha' }),
+    });
+
+    expect(response.status).toBe(400);
+  });
+
+  it('accepts valid updates and persists metadata', async () => {
+    const request = new Request('http://localhost', {
+      method: 'PATCH',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({ customName: 'New Name', tags: ['a'], starred: true }),
+    });
+    const response = await PATCH(request, {
+      params: Promise.resolve({ slug: 'alpha' }),
+    });
+
+    expect(response.status).toBe(200);
+    expect(setProjectMetadataMock).toHaveBeenCalledWith('alpha', {
+      customName: 'New Name',
+      tags: ['a'],
+      starred: true,
+    });
+  });
+});
```

```diff
diff --git a/tests/api/projects-docs.test.ts b/tests/api/projects-docs.test.ts
new file mode 100644
index 0000000..4567def
--- /dev/null
+++ b/tests/api/projects-docs.test.ts
@@ -0,0 +1,120 @@
+import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
+import { promises as fs } from 'fs';
+import os from 'os';
+import path from 'path';
+
+let baseDir = '';
+
+vi.mock('@/lib/constants', () => ({
+  CODE_BASE_PATH: baseDir,
+}));
+
+async function loadGet() {
+  vi.resetModules();
+  const mod = await import('@/app/api/projects/docs/route');
+  return mod.GET;
+}
+
+describe('GET /api/projects/docs', () => {
+  let tempDir: string;
+  let projectDir: string;
+
+  beforeEach(async () => {
+    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-manage-docs-'));
+    baseDir = tempDir;
+    projectDir = path.join(tempDir, 'project');
+    await fs.mkdir(projectDir);
+  });
+
+  afterEach(async () => {
+    await fs.rm(tempDir, { recursive: true, force: true });
+  });
+
+  it('returns 400 when path is missing', async () => {
+    const GET = await loadGet();
+    const response = await GET(new Request('http://localhost/api/projects/docs'));
+    expect(response.status).toBe(400);
+  });
+
+  it('returns 403 for paths outside CODE_BASE_PATH', async () => {
+    const GET = await loadGet();
+    const response = await GET(new Request('http://localhost/api/projects/docs?path=/etc'));
+    expect(response.status).toBe(403);
+  });
+
+  it('lists docs with previews and ignores README/hidden files', async () => {
+    await fs.writeFile(
+      path.join(projectDir, 'alpha.md'),
+      '---\ntitle: Alpha Doc\ndescription: Alpha Desc\ndate: 2025-01-05\n---\nAlpha content',
+      'utf-8'
+    );
+    await fs.writeFile(
+      path.join(projectDir, 'beta.md'),
+      '# Heading\n\nFirst paragraph line.\n\nSecond paragraph',
+      'utf-8'
+    );
+    await fs.writeFile(path.join(projectDir, 'README.md'), 'Ignore me', 'utf-8');
+    await fs.writeFile(path.join(projectDir, '.hidden.md'), 'Ignore me', 'utf-8');
+
+    const GET = await loadGet();
+    const response = await GET(new Request(`http://localhost/api/projects/docs?path=${encodeURIComponent(projectDir)}`));
+    const data = await response.json();
+
+    expect(response.status).toBe(200);
+    expect(data.docs).toHaveLength(2);
+    expect(data.docs[0].filename).toBe('alpha.md');
+    expect(data.docs[0].title).toBe('Alpha Doc');
+    expect(data.docs[0].preview).toBe('Alpha Desc');
+    expect(data.docs[0].date).toBe('2025-01-05');
+    expect(data.docs[1].title).toBe('Beta');
+    expect(data.docs[1].preview).toBe('First paragraph line.');
+  });
+});
```

```diff
diff --git a/tests/api/projects-docs-file.test.ts b/tests/api/projects-docs-file.test.ts
new file mode 100644
index 0000000..5678ef0
--- /dev/null
+++ b/tests/api/projects-docs-file.test.ts
@@ -0,0 +1,154 @@
+import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
+import { promises as fs } from 'fs';
+import os from 'os';
+import path from 'path';
+
+let baseDir = '';
+
+vi.mock('@/lib/constants', () => ({
+  CODE_BASE_PATH: baseDir,
+}));
+
+async function loadRoutes() {
+  vi.resetModules();
+  const mod = await import('@/app/api/projects/docs/[filename]/route');
+  return { GET: mod.GET, PUT: mod.PUT };
+}
+
+describe('GET/PUT /api/projects/docs/[filename]', () => {
+  let tempDir: string;
+  let projectDir: string;
+
+  beforeEach(async () => {
+    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-manage-doc-file-'));
+    baseDir = tempDir;
+    projectDir = path.join(tempDir, 'project');
+    await fs.mkdir(projectDir);
+  });
+
+  afterEach(async () => {
+    await fs.rm(tempDir, { recursive: true, force: true });
+  });
+
+  it('returns 400 when path is missing', async () => {
+    const { GET } = await loadRoutes();
+    const response = await GET(new Request('http://localhost/api/projects/docs/file.md'), {
+      params: Promise.resolve({ filename: 'file.md' }),
+    });
+    expect(response.status).toBe(400);
+  });
+
+  it('returns 400 for invalid filenames', async () => {
+    const { GET } = await loadRoutes();
+    const response = await GET(new Request(`http://localhost/api/projects/docs/../evil?path=${encodeURIComponent(projectDir)}`), {
+      params: Promise.resolve({ filename: '../evil' }),
+    });
+    expect(response.status).toBe(400);
+  });
+
+  it('returns 403 for paths outside CODE_BASE_PATH', async () => {
+    const { GET } = await loadRoutes();
+    const response = await GET(new Request('http://localhost/api/projects/docs/file.md?path=/etc'), {
+      params: Promise.resolve({ filename: 'file.md' }),
+    });
+    expect(response.status).toBe(403);
+  });
+
+  it('returns content and front matter for existing files', async () => {
+    await fs.writeFile(
+      path.join(projectDir, 'note.md'),
+      '---\ntitle: Note\n---\nHello world',
+      'utf-8'
+    );
+
+    const { GET } = await loadRoutes();
+    const response = await GET(new Request(`http://localhost/api/projects/docs/note.md?path=${encodeURIComponent(projectDir)}`), {
+      params: Promise.resolve({ filename: 'note.md' }),
+    });
+    const data = await response.json();
+
+    expect(response.status).toBe(200);
+    expect(data.frontMatter.title).toBe('Note');
+    expect(data.content).toBe('Hello world');
+    expect(data.rawContent).toContain('title: Note');
+  });
+
+  it('returns isNew for missing files', async () => {
+    const { GET } = await loadRoutes();
+    const response = await GET(new Request(`http://localhost/api/projects/docs/missing.md?path=${encodeURIComponent(projectDir)}`), {
+      params: Promise.resolve({ filename: 'missing.md' }),
+    });
+    const data = await response.json();
+
+    expect(response.status).toBe(200);
+    expect(data.isNew).toBe(true);
+    expect(data.content).toBe('');
+  });
+
+  it('writes files with front matter on PUT', async () => {
+    const { PUT } = await loadRoutes();
+    const request = new Request(`http://localhost/api/projects/docs/new.md?path=${encodeURIComponent(projectDir)}`, {
+      method: 'PUT',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({ frontMatter: { title: 'New Doc' }, content: 'Body text' }),
+    });
+    const response = await PUT(request, {
+      params: Promise.resolve({ filename: 'new.md' }),
+    });
+
+    expect(response.status).toBe(200);
+    const written = await fs.readFile(path.join(projectDir, 'new.md'), 'utf-8');
+    expect(written).toContain('title: New Doc');
+    expect(written).toContain('Body text');
+  });
+});
```

```diff
diff --git a/tests/lib/scanner-extra.test.ts b/tests/lib/scanner-extra.test.ts
new file mode 100644
index 0000000..6789f01
--- /dev/null
+++ b/tests/lib/scanner-extra.test.ts
@@ -0,0 +1,171 @@
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { promises as fs } from 'fs';
+import os from 'os';
+import path from 'path';
+import {
+  detectTechStack,
+  extractDescription,
+  getVersion,
+  scanBugs,
+  scanRcodegen,
+  isProjectDirectory,
+} from '@/lib/scanner';
+
+describe('scanner helpers', () => {
+  let tempDir: string;
+
+  beforeEach(async () => {
+    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-manage-scan-'));
+  });
+
+  afterEach(async () => {
+    await fs.rm(tempDir, { recursive: true, force: true });
+  });
+
+  it('detects JS/TS tech stack from package.json', async () => {
+    const projectDir = path.join(tempDir, 'js-project');
+    await fs.mkdir(projectDir);
+    await fs.writeFile(
+      path.join(projectDir, 'package.json'),
+      JSON.stringify({
+        dependencies: {
+          next: '1.0.0',
+          react: '18.0.0',
+          tailwindcss: '3.0.0',
+          typescript: '5.0.0',
+        },
+      }),
+      'utf-8'
+    );
+
+    const techs = await detectTechStack(projectDir);
+    expect(techs[0]).toBe('Next.js');
+    expect(techs).toContain('React');
+    expect(techs).toContain('Tailwind');
+    expect(techs).toContain('TypeScript');
+  });
+
+  it('falls back to Node.js when no framework is detected', async () => {
+    const projectDir = path.join(tempDir, 'node-project');
+    await fs.mkdir(projectDir);
+    await fs.writeFile(path.join(projectDir, 'package.json'), JSON.stringify({}), 'utf-8');
+
+    const techs = await detectTechStack(projectDir);
+    expect(techs).toEqual(['Node.js']);
+  });
+
+  it('detects Python stack from requirements.txt', async () => {
+    const projectDir = path.join(tempDir, 'py-project');
+    await fs.mkdir(projectDir);
+    await fs.writeFile(path.join(projectDir, 'requirements.txt'), 'fastapi==0.1.0', 'utf-8');
+
+    const techs = await detectTechStack(projectDir);
+    expect(techs).toContain('Python');
+    expect(techs).toContain('FastAPI');
+  });
+
+  it('extracts description from package.json when present', async () => {
+    const projectDir = path.join(tempDir, 'desc-project');
+    await fs.mkdir(projectDir);
+    await fs.writeFile(
+      path.join(projectDir, 'package.json'),
+      JSON.stringify({ description: 'My project' }),
+      'utf-8'
+    );
+
+    const description = await extractDescription(projectDir);
+    expect(description).toBe('My project');
+  });
+
+  it('extracts description from README when package.json is missing', async () => {
+    const projectDir = path.join(tempDir, 'readme-project');
+    await fs.mkdir(projectDir);
+    await fs.writeFile(
+      path.join(projectDir, 'README.md'),
+      '# Title\n\n[![Badge]]\n\nFirst paragraph.\n\nSecond paragraph',
+      'utf-8'
+    );
+
+    const description = await extractDescription(projectDir);
+    expect(description).toBe('First paragraph.');
+  });
+
+  it('reads version from VERSION file before other sources', async () => {
+    const projectDir = path.join(tempDir, 'version-project');
+    await fs.mkdir(projectDir);
+    await fs.writeFile(path.join(projectDir, 'VERSION'), '2.3.4\nextra', 'utf-8');
+
+    const version = await getVersion(projectDir);
+    expect(version).toBe('2.3.4');
+  });
+
+  it('falls back to package.json version when VERSION is missing', async () => {
+    const projectDir = path.join(tempDir, 'pkg-version-project');
+    await fs.mkdir(projectDir);
+    await fs.writeFile(
+      path.join(projectDir, 'package.json'),
+      JSON.stringify({ version: '0.0.1' }),
+      'utf-8'
+    );
+
+    const version = await getVersion(projectDir);
+    expect(version).toBe('0.0.1');
+  });
+
+  it('scans bugs and sorts newest first', async () => {
+    const projectDir = path.join(tempDir, 'bugs-project');
+    await fs.mkdir(path.join(projectDir, '_bugs_open'), { recursive: true });
+    await fs.mkdir(path.join(projectDir, '_bugs_fixed'), { recursive: true });
+
+    await fs.writeFile(
+      path.join(projectDir, '_bugs_open', '2026-01-02-sample.md'),
+      '# Sample Bug\nDetails',
+      'utf-8'
+    );
+    await fs.writeFile(
+      path.join(projectDir, '_bugs_fixed', '2026-01-01-fixed.md'),
+      '# Fixed Bug\nDetails',
+      'utf-8'
+    );
+
+    const bugInfo = await scanBugs(projectDir);
+    expect(bugInfo?.openCount).toBe(1);
+    expect(bugInfo?.fixedCount).toBe(1);
+    expect(bugInfo?.bugs[0].date).toBe('2026-01-02');
+    expect(bugInfo?.bugs[0].title).toBe('Sample Bug');
+    expect(bugInfo?.bugs[0].status).toBe('open');
+  });
+
+  it('parses rcodegen grades from .grades.json', async () => {
+    const projectDir = path.join(tempDir, 'rcodegen-project');
+    const rcodegenDir = path.join(projectDir, '_rcodegen');
+    await fs.mkdir(rcodegenDir, { recursive: true });
+    await fs.writeFile(
+      path.join(rcodegenDir, '.grades.json'),
+      JSON.stringify({
+        grades: [
+          {
+            date: '2026-01-02T00:00:00.000Z',
+            tool: 'codex',
+            task: 'test',
+            grade: 85,
+            reportFile: 'report1.md',
+          },
+          {
+            date: '2025-12-31T00:00:00.000Z',
+            tool: 'claude',
+            task: 'test',
+            grade: 70,
+            reportFile: 'report2.md',
+          },
+        ],
+      }),
+      'utf-8'
+    );
+
+    const info = await scanRcodegen(projectDir);
+    expect(info?.reportCount).toBe(2);
+    expect(info?.latestGrade).toBe(85);
+    expect(info?.lastRun).toBe('2026-01-02T00:00:00.000Z');
+    expect(info?.taskGrades.test[0].tool).toBe('codex');
+  });
+
+  it('detects project indicators', async () => {
+    const projectDir = path.join(tempDir, 'indicator-project');
+    await fs.mkdir(projectDir);
+
+    expect(await isProjectDirectory(projectDir)).toBe(false);
+    await fs.writeFile(path.join(projectDir, 'package.json'), '{}', 'utf-8');
+    expect(await isProjectDirectory(projectDir)).toBe(true);
+  });
+});
```

**Optional (Not Included in Diffs)**
- UI/hook coverage for `useClickOutside`, `useProjectActions`, and `ProjectGrid` filtering/star toggling requires jsdom + @testing-library/react setup.

**Notes**
- No code changes were applied; this report only proposes test additions.
