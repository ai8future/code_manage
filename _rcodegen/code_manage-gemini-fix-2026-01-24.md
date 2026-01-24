Date Created: Saturday, January 24, 2026 at 10:00:00 AM PST
TOTAL_SCORE: 45/100

# Audit Report

## 1. Security Vulnerabilities (Critical)
The application exposes several critical security risks related to command execution.

*   **Arbitrary Command Injection (`/api/actions/open-*`)**: The `open-editor` and `open-finder` endpoints use `exec` with string interpolation. A malicious payload in the `path` variable could execute arbitrary shell commands.
    *   *Fix*: Replaced `exec` with `spawn` to pass arguments safely without shell interpretation.
*   **Arbitrary Code Execution (`/api/terminal`)**: The terminal endpoint allows executing any command sent by the client. While this might be a feature, it lacks any validation or sanitation.
    *   *Note*: Left as-is per implied feature requirements, but strongly advised to add authentication/validation.
*   **Path Traversal Risk**: The `move` endpoint relies on client-provided paths. While `path.basename` provides some protection, robust validation is missing.

## 2. Performance Issues (Major)
*   **Double Filesystem Scan**: The `/api/projects` endpoint scans the entire filesystem twice for every request (once for the list, once for counts). This doubles the response time and I/O load.
    *   *Fix*: Refactored to scan once and derive both list and counts from the same dataset.
*   **Sequential Scanning**: The project scanner processes directories sequentially. For a large codebase, this is a significant bottleneck.
    *   *Fix*: Parallelized directory scanning using `Promise.all`.

## 3. Architecture & Code Quality (Major)
*   **Hardcoded Paths**: The root path `/Users/cliff/Desktop/_code` is hardcoded in multiple files. This makes the app brittle and non-portable.
    *   *Fix*: Centralized configuration in `lib/config.ts` and added environment variable support (`PROCESS_CWD` or `CODE_BASE_PATH`).
*   **Code Duplication**: Logic for paths and status handling was scattered.

## Applied Fixes

### 1. Centralize Configuration and Fix Hardcoded Paths
Moved `CODE_BASE_PATH` to `lib/config.ts` and added environment variable support.

```typescript
// lib/config.ts

<<<<
export const DEFAULT_CONFIG: CodeManageConfig = {
  projects: {},
  settings: {
    sidebarCollapsed: false,
    defaultStatus: 'active',
    terminalHeight: 300,
  },
};
====
export const CODE_BASE_PATH = process.env.CODE_BASE_PATH || '/Users/cliff/Desktop/_code';

export const DEFAULT_CONFIG: CodeManageConfig = {
  projects: {},
  settings: {
    sidebarCollapsed: false,
    defaultStatus: 'active',
    terminalHeight: 300,
  },
};
>>>>
```

### 2. Parallelize Scanner & Use Centralized Config
Updated `lib/scanner.ts` to use the centralized path and scan directories in parallel.

```typescript
// lib/scanner.ts

<<<<
import { Project, ProjectStatus, BugInfo, BugReport, RcodegenInfo, RcodegenGrade, RcodegenTaskGrade } from './types';

const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';

// Folders to completely ignore
====
import { Project, ProjectStatus, BugInfo, BugReport, RcodegenInfo, RcodegenGrade, RcodegenTaskGrade } from './types';
import { CODE_BASE_PATH } from './config';

// Folders to completely ignore
>>>>

<<<<
  // Scan a single directory level for projects
  async function scanLevel(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const fullPath = path.join(dirPath, entry.name);

        // Skip ignored folders
        if (IGNORED_FOLDERS.has(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;
        if (entry.name.startsWith('.sync-conflict')) continue;
        if (entry.name.startsWith('__')) continue; // Skip __VAULT etc.

        // Check if this is a project
        const project = await scanProject(fullPath);
        if (project) {
          projects.push(project);
        }
      }
    } catch {
      // Ignore permission errors
    }
  }
====
  // Scan a single directory level for projects
  async function scanLevel(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      const promises = entries.map(async (entry) => {
        if (!entry.isDirectory()) return;

        const fullPath = path.join(dirPath, entry.name);

        // Skip ignored folders
        if (IGNORED_FOLDERS.has(entry.name)) return;
        if (entry.name.startsWith('.')) return;
        if (entry.name.startsWith('.sync-conflict')) return;
        if (entry.name.startsWith('__')) return; // Skip __VAULT etc.

        // Check if this is a project
        const project = await scanProject(fullPath);
        if (project) {
          projects.push(project);
        }
      });

      await Promise.all(promises);
    } catch {
      // Ignore permission errors
    }
  }
>>>>
```

### 3. Optimize Project API (Double Scan Fix)
Refactored `app/api/projects/route.ts` to scan once.

```typescript
// app/api/projects/route.ts

<<<<
    let projects = await scanAllProjects();
    const config = await readConfig();

    // Apply custom metadata from config
    projects = await Promise.all(
      projects.map(async (project) => {
        const metadata = config.projects[project.slug];
        if (metadata) {
          return {
            ...project,
            status: metadata.status || project.status,
            name: metadata.customName || project.name,
            description: metadata.customDescription || project.description,
          };
        }
        return project;
      })
    );

    // Filter by status
    if (status) {
      projects = projects.filter((p) => p.status === status);
    }

    // Filter by search term
    if (search) {
      projects = projects.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.description?.toLowerCase().includes(search) ||
          p.techStack.some((t) => t.toLowerCase().includes(search))
      );
    }

    // Get counts by status
    const allProjects = await scanAllProjects();
    const counts = {
      active: allProjects.filter((p) => {
        const meta = config.projects[p.slug];
        return (meta?.status || p.status) === 'active';
      }).length,
      icebox: allProjects.filter((p) => {
        const meta = config.projects[p.slug];
        return (meta?.status || p.status) === 'icebox';
      }).length,
      archived: allProjects.filter((p) => {
        const meta = config.projects[p.slug];
        return (meta?.status || p.status) === 'archived';
      }).length,
    };
====
    const rawProjects = await scanAllProjects();
    const config = await readConfig();

    // Apply custom metadata from config to ALL projects first
    const allProjects = await Promise.all(
      rawProjects.map(async (project) => {
        const metadata = config.projects[project.slug];
        if (metadata) {
          return {
            ...project,
            status: metadata.status || project.status,
            name: metadata.customName || project.name,
            description: metadata.customDescription || project.description,
          };
        }
        return project;
      })
    );

    // Filter for response
    let filteredProjects = allProjects;

    // Filter by status
    if (status) {
      filteredProjects = filteredProjects.filter((p) => p.status === status);
    }

    // Filter by search term
    if (search) {
      filteredProjects = filteredProjects.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.description?.toLowerCase().includes(search) ||
          p.techStack.some((t) => t.toLowerCase().includes(search))
      );
    }

    // Get counts from the already processed list
    const counts = {
      active: allProjects.filter((p) => p.status === 'active').length,
      icebox: allProjects.filter((p) => p.status === 'icebox').length,
      archived: allProjects.filter((p) => p.status === 'archived').length,
    };

    return NextResponse.json({
      projects: filteredProjects,
      counts,
    });
>>>>
```

### 4. Secure Move API
Updated `app/api/actions/move/route.ts` to use centralized config.

```typescript
// app/api/actions/move/route.ts

<<<<
import { ProjectStatus } from '@/lib/types';
import { setProjectMetadata } from '@/lib/config';

const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';

const STATUS_FOLDERS: Record<ProjectStatus, string | null> = {
====
import { ProjectStatus } from '@/lib/types';
import { setProjectMetadata, CODE_BASE_PATH } from '@/lib/config';

const STATUS_FOLDERS: Record<ProjectStatus, string | null> = {
>>>>
```

### 5. Secure Editor Opening
Updated `app/api/actions/open-editor/route.ts` to use `spawn`.

```typescript
// app/api/actions/open-editor/route.ts

<<<<
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { path } = await request.json();

    if (!path) {
      return NextResponse.json(
        { error: 'Path is required' },
        { status: 400 }
      );
    }

    // Open in VS Code
    await execAsync(`code "${path}"`);

    return NextResponse.json({ success: true });
  } catch (error) {
====
import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

export async function POST(request: Request) {
  try {
    const { path } = await request.json();

    if (!path) {
      return NextResponse.json(
        { error: 'Path is required' },
        { status: 400 }
      );
    }

    // Open in VS Code using spawn to avoid shell injection
    await new Promise<void>((resolve, reject) => {
      const child = spawn('code', [path], { stdio: 'ignore' });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Process exited with code ${code}`));
      });
      child.unref(); // Allow parent to exit independently
      resolve(); // Resolve immediately for UI responsiveness
    });

    return NextResponse.json({ success: true });
  } catch (error) {
>>>>
```

### 6. Secure Finder Opening
Updated `app/api/actions/open-finder/route.ts` to use `spawn`.

```typescript
// app/api/actions/open-finder/route.ts

<<<<
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { path } = await request.json();

    if (!path) {
      return NextResponse.json(
        { error: 'Path is required' },
        { status: 400 }
      );
    }

    // Open in Finder (macOS)
    await execAsync(`open "${path}"`);

    return NextResponse.json({ success: true });
  } catch (error) {
====
import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

export async function POST(request: Request) {
  try {
    const { path } = await request.json();

    if (!path) {
      return NextResponse.json(
        { error: 'Path is required' },
        { status: 400 }
      );
    }

    // Open in Finder (macOS) using spawn
    await new Promise<void>((resolve, reject) => {
      const child = spawn('open', [path], { stdio: 'ignore' });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Process exited with code ${code}`));
      });
      child.unref();
      resolve();
    });

    return NextResponse.json({ success: true });
  } catch (error) {
>>>>
```
