Date Created: 2026-01-24 23:53:10 +0100
TOTAL_SCORE: 30/100

Scope
- Reviewed lib/ (scanner, config), app/api routes, and core UI components in components/.

Why the score
- No automated test tooling or test suites exist yet.
- Core behaviors rely on filesystem access and OS-level commands without coverage.
- Logic is testable, but coverage gaps leave regressions likely in scanning/filtering and UI state.

Proposed unit tests (priority order)
1) lib/scanner.ts
   - detectTechStack for JS/TS and Python inputs and priority order.
   - extractDescription for package.json fallback and README parsing rules.
   - getGitInfo parsing HEAD/config, getVersion precedence, scanBugs sorting/counts.
   - scanRcodegen for .grades.json and filename fallback.
   - determineStatus and scanProject composition.
2) lib/config.ts
   - readConfig default/merge behavior, writeConfig output, setProjectMetadata merge, updateSettings merge.
3) API routes
   - /api/projects invalid status, metadata override, search filtering, 500 paths.
   - /api/file path validation (400/403) and file read success.
   - /api/projects/readme path required and README selection.
   - /api/actions/move conflicts (409) and status move pathing.
4) Components
   - ProjectCard menu open/close and action callbacks.
   - SearchBar clear button behavior.
   - SidebarContext localStorage initialization and toggle behavior.
   - TerminalPanel history navigation and Ctrl+L/C handling.

Patch-ready diffs
```diff
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@
   "scripts": {
     "dev": "next dev",
     "build": "next build",
     "start": "next start",
-    "lint": "next lint"
+    "lint": "next lint",
+    "test": "vitest run",
+    "test:watch": "vitest"
   },
@@
-    "tailwindcss": "^3.4.1",
-    "typescript": "^5"
+    "tailwindcss": "^3.4.1",
+    "typescript": "^5",
+    "@testing-library/jest-dom": "^6.4.2",
+    "@testing-library/react": "^14.3.1",
+    "@testing-library/user-event": "^14.5.2",
+    "@types/mock-fs": "^4.13.1",
+    "@vitejs/plugin-react": "^4.2.1",
+    "jsdom": "^24.0.0",
+    "mock-fs": "^5.2.0",
+    "vite": "^5.2.0",
+    "vite-tsconfig-paths": "^4.3.2",
+    "vitest": "^1.6.0"
   }
 }

diff --git a/vitest.config.ts b/vitest.config.ts
new file mode 100644
--- /dev/null
+++ b/vitest.config.ts
@@
+import { defineConfig } from 'vitest/config';
+import react from '@vitejs/plugin-react';
+import tsconfigPaths from 'vite-tsconfig-paths';
+
+export default defineConfig({
+  plugins: [react(), tsconfigPaths()],
+  test: {
+    environment: 'jsdom',
+    setupFiles: ['./tests/setup.ts'],
+    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
+    clearMocks: true,
+    restoreMocks: true,
+  },
+});

diff --git a/tests/setup.ts b/tests/setup.ts
new file mode 100644
--- /dev/null
+++ b/tests/setup.ts
@@
+import '@testing-library/jest-dom/vitest';

diff --git a/tests/lib/config.test.ts b/tests/lib/config.test.ts
new file mode 100644
--- /dev/null
+++ b/tests/lib/config.test.ts
@@
+// @vitest-environment node
+import { afterEach, describe, expect, it } from 'vitest';
+import mockFs from 'mock-fs';
+import path from 'path';
+import { promises as fs } from 'fs';
+import { DEFAULT_CONFIG } from '@/lib/types';
+import { readConfig, setProjectMetadata, updateSettings, writeConfig } from '@/lib/config';
+import { getCodeBasePath } from '@/lib/scanner';
+
+const basePath = getCodeBasePath();
+const configPath = path.join(basePath, '.code-manage.json');
+
+afterEach(() => {
+  mockFs.restore();
+});
+
+describe('config', () => {
+  it('returns defaults when config is missing', async () => {
+    mockFs({ [basePath]: {} });
+    const config = await readConfig();
+    expect(config).toEqual(DEFAULT_CONFIG);
+  });
+
+  it('merges settings with defaults', async () => {
+    mockFs({
+      [basePath]: {
+        '.code-manage.json': JSON.stringify({
+          projects: { alpha: { customName: 'Alpha' } },
+          settings: { sidebarCollapsed: true },
+        }),
+      },
+    });
+
+    const config = await readConfig();
+    expect(config.settings.sidebarCollapsed).toBe(true);
+    expect(config.settings.defaultStatus).toBe(DEFAULT_CONFIG.settings.defaultStatus);
+    expect(config.projects.alpha.customName).toBe('Alpha');
+  });
+
+  it('writes config to disk', async () => {
+    mockFs({ [basePath]: {} });
+    const config = {
+      ...DEFAULT_CONFIG,
+      settings: { ...DEFAULT_CONFIG.settings, sidebarCollapsed: true },
+    };
+
+    await writeConfig(config);
+    const raw = await fs.readFile(configPath, 'utf-8');
+    expect(JSON.parse(raw)).toEqual(config);
+  });
+
+  it('merges project metadata updates', async () => {
+    mockFs({
+      [basePath]: {
+        '.code-manage.json': JSON.stringify(DEFAULT_CONFIG),
+      },
+    });
+
+    await setProjectMetadata('beta', { customName: 'Beta' });
+    const raw = await fs.readFile(configPath, 'utf-8');
+    const stored = JSON.parse(raw);
+    expect(stored.projects.beta.customName).toBe('Beta');
+  });
+
+  it('updates settings without dropping fields', async () => {
+    mockFs({
+      [basePath]: {
+        '.code-manage.json': JSON.stringify(DEFAULT_CONFIG),
+      },
+    });
+
+    await updateSettings({ terminalHeight: 450 });
+    const config = await readConfig();
+    expect(config.settings.terminalHeight).toBe(450);
+    expect(config.settings.defaultStatus).toBe(DEFAULT_CONFIG.settings.defaultStatus);
+  });
+});

diff --git a/tests/lib/scanner.test.ts b/tests/lib/scanner.test.ts
new file mode 100644
--- /dev/null
+++ b/tests/lib/scanner.test.ts
@@
+// @vitest-environment node
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import mockFs from 'mock-fs';
+import path from 'path';
+import {
+  detectTechStack,
+  extractDescription,
+  getGitInfo,
+  getVersion,
+  scanBugs,
+  scanRcodegen,
+  determineStatus,
+  isProjectDirectory,
+  scanProject,
+  getCodeBasePath,
+} from '@/lib/scanner';
+
+const basePath = getCodeBasePath();
+
+afterEach(() => {
+  mockFs.restore();
+  vi.useRealTimers();
+});
+
+describe('scanner helpers', () => {
+  it('detects tech stack from package.json', async () => {
+    const projectPath = path.join(basePath, 'alpha');
+    mockFs({
+      [projectPath]: {
+        'package.json': JSON.stringify({
+          dependencies: { next: '1.0.0', react: '18.0.0', tailwindcss: '3.0.0' },
+          devDependencies: { typescript: '5.0.0' },
+        }),
+      },
+    });
+
+    const techs = await detectTechStack(projectPath);
+    expect(techs).toEqual(expect.arrayContaining(['Next.js', 'React', 'Tailwind', 'TypeScript']));
+    expect(techs[0]).toBe('Next.js');
+  });
+
+  it('detects python frameworks from pyproject.toml', async () => {
+    const projectPath = path.join(basePath, 'python');
+    mockFs({
+      [projectPath]: {
+        'pyproject.toml': 'fastapi\ndjango',
+      },
+    });
+
+    const techs = await detectTechStack(projectPath);
+    expect(techs).toEqual(expect.arrayContaining(['Python', 'FastAPI', 'Django']));
+  });
+
+  it('extracts description from README when package.json lacks it', async () => {
+    const projectPath = path.join(basePath, 'readme-project');
+    mockFs({
+      [projectPath]: {
+        'README.md': '# Title\n![badge](url)\nUseful tool for tracking projects.\nMore details here.\n\n## Usage\n',
+        'package.json': JSON.stringify({}),
+      },
+    });
+
+    const description = await extractDescription(projectPath);
+    expect(description).toBe('Useful tool for tracking projects. More details here.');
+  });
+
+  it('parses git branch and remote', async () => {
+    const projectPath = path.join(basePath, 'git-project');
+    mockFs({
+      [projectPath]: {
+        '.git': {
+          'HEAD': 'ref: refs/heads/main',
+          'config': '[remote "origin"]\n  url = git@github.com:org/repo.git\n',
+        },
+      },
+    });
+
+    const gitInfo = await getGitInfo(projectPath);
+    expect(gitInfo.hasGit).toBe(true);
+    expect(gitInfo.branch).toBe('main');
+    expect(gitInfo.remote).toBe('git@github.com:org/repo.git');
+  });
+
+  it('prefers VERSION file when resolving version', async () => {
+    const projectPath = path.join(basePath, 'versioned');
+    mockFs({
+      [projectPath]: {
+        'VERSION': '2.3.4\nextra',
+        'package.json': JSON.stringify({ version: '1.0.0' }),
+      },
+    });
+
+    const version = await getVersion(projectPath);
+    expect(version).toBe('2.3.4');
+  });
+
+  it('scans bug files and sorts by date', async () => {
+    const projectPath = path.join(basePath, 'bugs');
+    mockFs({
+      [projectPath]: {
+        '_bugs_open': {
+          '2026-01-02-sample.md': '# Open bug\nDetails',
+          '2026-01-01-older.md': '# Older bug',
+          '.gitkeep': '',
+        },
+        '_bugs_fixed': {
+          '2026-01-03-fixed.md': '# Fixed bug',
+        },
+      },
+    });
+
+    const bugs = await scanBugs(projectPath);
+    expect(bugs?.openCount).toBe(2);
+    expect(bugs?.fixedCount).toBe(1);
+    expect(bugs?.bugs[0].date).toBe('2026-01-03');
+    expect(bugs?.bugs[0].status).toBe('fixed');
+    expect(bugs?.bugs[0].title).toBe('Fixed bug');
+  });
+
+  it('reads rcodegen grades from .grades.json', async () => {
+    const projectPath = path.join(basePath, 'rcodegen');
+    mockFs({
+      [projectPath]: {
+        '_rcodegen': {
+          '.grades.json': JSON.stringify({
+            grades: [
+              {
+                date: '2026-01-04T00:00:00.000Z',
+                tool: 'codex',
+                task: 'test',
+                grade: 87,
+                reportFile: 'report.md',
+              },
+            ],
+          }),
+        },
+      },
+    });
+
+    const rcodegen = await scanRcodegen(projectPath);
+    expect(rcodegen?.reportCount).toBe(1);
+    expect(rcodegen?.latestGrade).toBe(87);
+    expect(rcodegen?.taskGrades.test[0]).toEqual({ grade: 87, tool: 'codex' });
+  });
+
+  it('falls back to scanning rcodegen report files', async () => {
+    const projectPath = path.join(basePath, 'rcodegen-fallback');
+    mockFs({
+      [projectPath]: {
+        '_rcodegen': {
+          'proj-codex-test-2026-01-05.md': 'TOTAL_SCORE: 75/100\n',
+        },
+      },
+    });
+
+    const rcodegen = await scanRcodegen(projectPath);
+    expect(rcodegen?.reportCount).toBe(1);
+    expect(rcodegen?.latestGrade).toBe(75);
+  });
+
+  it('detects project indicators and status', async () => {
+    const projectPath = path.join(basePath, 'active-project');
+    mockFs({
+      [projectPath]: {
+        'package.json': JSON.stringify({}),
+      },
+    });
+
+    expect(await isProjectDirectory(projectPath)).toBe(true);
+    expect(determineStatus(path.join(basePath, '_icebox', 'frozen'))).toBe('icebox');
+  });
+
+  it('scans a project into a Project record', async () => {
+    const projectPath = path.join(basePath, 'scan-target');
+    mockFs({
+      [projectPath]: {
+        'package.json': JSON.stringify({ dependencies: { react: '18.0.0' } }),
+        'README.md': 'Sample project',
+      },
+    });
+
+    const project = await scanProject(projectPath);
+    expect(project?.slug).toBe('scan-target');
+    expect(project?.status).toBe('active');
+    expect(project?.techStack).toContain('React');
+  });
+});

diff --git a/tests/api/projects.test.ts b/tests/api/projects.test.ts
new file mode 100644
--- /dev/null
+++ b/tests/api/projects.test.ts
@@
+// @vitest-environment node
+import { beforeEach, describe, expect, it, vi } from 'vitest';
+import { GET } from '@/app/api/projects/route';
+import { scanAllProjects } from '@/lib/scanner';
+import { readConfig } from '@/lib/config';
+import { DEFAULT_CONFIG, Project } from '@/lib/types';
+
+vi.mock('@/lib/scanner', () => ({
+  scanAllProjects: vi.fn(),
+}));
+
+vi.mock('@/lib/config', () => ({
+  readConfig: vi.fn(),
+}));
+
+const scanAllProjectsMock = vi.mocked(scanAllProjects);
+const readConfigMock = vi.mocked(readConfig);
+
+const baseProjects: Project[] = [
+  {
+    slug: 'alpha',
+    name: 'Alpha',
+    path: '/Users/cliff/Desktop/_code/alpha',
+    status: 'active',
+    techStack: ['React'],
+    lastModified: '2026-01-01T00:00:00.000Z',
+    hasGit: false,
+  },
+  {
+    slug: 'beta',
+    name: 'Beta',
+    path: '/Users/cliff/Desktop/_code/beta',
+    status: 'archived',
+    techStack: ['Go'],
+    lastModified: '2026-01-02T00:00:00.000Z',
+    hasGit: true,
+    gitBranch: 'main',
+  },
+];
+
+beforeEach(() => {
+  scanAllProjectsMock.mockResolvedValue(baseProjects);
+  readConfigMock.mockResolvedValue({
+    ...DEFAULT_CONFIG,
+    projects: {},
+  });
+});
+
+describe('GET /api/projects', () => {
+  it('rejects invalid status', async () => {
+    const res = await GET(new Request('http://localhost/api/projects?status=bad'));
+    expect(res.status).toBe(400);
+    const body = await res.json();
+    expect(body.error).toMatch('Invalid status');
+  });
+
+  it('applies metadata overrides and computes counts', async () => {
+    readConfigMock.mockResolvedValue({
+      ...DEFAULT_CONFIG,
+      projects: {
+        alpha: {
+          status: 'icebox',
+          customName: 'Alpha Override',
+          customDescription: 'Custom description',
+        },
+      },
+    });
+
+    const res = await GET(new Request('http://localhost/api/projects?status=icebox'));
+    const body = await res.json();
+
+    expect(res.status).toBe(200);
+    expect(body.projects).toHaveLength(1);
+    expect(body.projects[0].status).toBe('icebox');
+    expect(body.projects[0].name).toBe('Alpha Override');
+    expect(body.counts.icebox).toBe(1);
+    expect(body.counts.active).toBe(0);
+  });
+
+  it('filters by search term across name, description, and tech stack', async () => {
+    scanAllProjectsMock.mockResolvedValue([
+      ...baseProjects,
+      {
+        slug: 'gamma',
+        name: 'Gamma',
+        path: '/Users/cliff/Desktop/_code/gamma',
+        status: 'active',
+        techStack: ['Python'],
+        description: 'Data pipeline',
+        lastModified: '2026-01-03T00:00:00.000Z',
+        hasGit: false,
+      },
+    ]);
+
+    const res = await GET(new Request('http://localhost/api/projects?search=python'));
+    const body = await res.json();
+
+    expect(body.projects).toHaveLength(1);
+    expect(body.projects[0].slug).toBe('gamma');
+  });
+
+  it('returns 500 when scan fails', async () => {
+    scanAllProjectsMock.mockRejectedValue(new Error('boom'));
+    const res = await GET(new Request('http://localhost/api/projects'));
+    expect(res.status).toBe(500);
+  });
+});

diff --git a/tests/api/file.test.ts b/tests/api/file.test.ts
new file mode 100644
--- /dev/null
+++ b/tests/api/file.test.ts
@@
+// @vitest-environment node
+import { afterEach, describe, expect, it } from 'vitest';
+import mockFs from 'mock-fs';
+import { GET } from '@/app/api/file/route';
+
+const basePath = '/Users/cliff/Desktop/_code';
+
+afterEach(() => {
+  mockFs.restore();
+});
+
+describe('GET /api/file', () => {
+  it('requires a path parameter', async () => {
+    const res = await GET(new Request('http://localhost/api/file'));
+    expect(res.status).toBe(400);
+  });
+
+  it('rejects paths outside the code base', async () => {
+    const res = await GET(new Request('http://localhost/api/file?path=/etc/passwd'));
+    expect(res.status).toBe(403);
+  });
+
+  it('returns file contents for valid paths', async () => {
+    mockFs({
+      [basePath]: {
+        project: {
+          'notes.txt': 'hello',
+        },
+      },
+    });
+
+    const res = await GET(
+      new Request(`http://localhost/api/file?path=${basePath}/project/notes.txt`)
+    );
+    const body = await res.json();
+    expect(res.status).toBe(200);
+    expect(body.content).toBe('hello');
+  });
+});

diff --git a/tests/components/ProjectCard.test.tsx b/tests/components/ProjectCard.test.tsx
new file mode 100644
--- /dev/null
+++ b/tests/components/ProjectCard.test.tsx
@@
+import type { ReactNode } from 'react';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { fireEvent, render, screen } from '@testing-library/react';
+import { ProjectCard } from '@/components/dashboard/ProjectCard';
+import { Project } from '@/lib/types';
+
+vi.mock('next/link', () => ({
+  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
+    <a href={href} {...props}>{children}</a>
+  ),
+}));
+
+const baseProject: Project = {
+  slug: 'alpha',
+  name: 'Alpha',
+  path: '/Users/cliff/Desktop/_code/alpha',
+  status: 'active',
+  techStack: ['React'],
+  lastModified: '2026-01-24T00:00:00.000Z',
+  hasGit: true,
+  gitBranch: 'main',
+  version: '1.2.3',
+  bugs: { openCount: 2, fixedCount: 0, bugs: [] },
+  rcodegen: {
+    reportCount: 1,
+    lastRun: null,
+    latestGrade: 85,
+    taskGrades: { audit: [], test: [], fix: [], refactor: [] },
+    recentGrades: [],
+  },
+};
+
+beforeEach(() => {
+  vi.useFakeTimers();
+  vi.setSystemTime(new Date('2026-01-24T12:00:00.000Z'));
+});
+
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+describe('ProjectCard', () => {
+  it('renders badges and relative time', () => {
+    render(<ProjectCard project={baseProject} />);
+
+    expect(screen.getByText('Alpha')).toBeInTheDocument();
+    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
+    expect(screen.getByTitle('2 open bugs')).toBeInTheDocument();
+    expect(screen.getByText('85')).toBeInTheDocument();
+    expect(screen.getByText('Today')).toBeInTheDocument();
+  });
+
+  it('invokes menu actions and closes the menu', () => {
+    const onOpenInEditor = vi.fn();
+    const { container } = render(
+      <ProjectCard project={baseProject} onOpenInEditor={onOpenInEditor} />
+    );
+
+    const toggle = container.querySelector('button');
+    expect(toggle).not.toBeNull();
+    if (!toggle) return;
+
+    fireEvent.click(toggle);
+    const action = screen.getByText('Open in VS Code');
+    fireEvent.click(action);
+
+    expect(onOpenInEditor).toHaveBeenCalledWith(baseProject);
+    expect(screen.queryByText('Open in VS Code')).not.toBeInTheDocument();
+
+    fireEvent.click(toggle);
+    fireEvent.mouseDown(document.body);
+    expect(screen.queryByText('Open in VS Code')).not.toBeInTheDocument();
+  });
+});

diff --git a/tests/components/SearchBar.test.tsx b/tests/components/SearchBar.test.tsx
new file mode 100644
--- /dev/null
+++ b/tests/components/SearchBar.test.tsx
@@
+import { describe, expect, it, vi } from 'vitest';
+import { fireEvent, render, screen } from '@testing-library/react';
+import { SearchBar } from '@/components/dashboard/SearchBar';
+
+describe('SearchBar', () => {
+  it('calls onChange when typing', () => {
+    const onChange = vi.fn();
+    render(<SearchBar value="" onChange={onChange} />);
+
+    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'react' } });
+    expect(onChange).toHaveBeenCalledWith('react');
+  });
+
+  it('clears input when clear button is clicked', () => {
+    const onChange = vi.fn();
+    render(<SearchBar value="vite" onChange={onChange} />);
+
+    const clearButton = screen.getByRole('button');
+    fireEvent.click(clearButton);
+    expect(onChange).toHaveBeenCalledWith('');
+  });
+});
```

Additional recommended tests (not in diff)
- app/api/projects/[slug]: 404 path, metadata merge, PATCH body validation.
- app/api/projects/readme: missing path (400), README selection order, not found (404).
- app/api/actions/open-editor/open-finder: invalid path (403), exec failures (500).
- app/api/actions/move: existing target (409) and metadata update on success.
- TerminalPanel: ArrowUp/ArrowDown command history and Ctrl+L/C behavior.
- SidebarProjectList: lazy load on expand, refresh on active route.

Notes
- Use mock-fs (as in diffs) to avoid touching real disk paths.
- For node-only tests, keep the // @vitest-environment node pragma.
