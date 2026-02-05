import { promises as fs } from 'fs';
import path from 'path';
import { Project, ProjectStatus, BugInfo, BugReport, RcodegenInfo, RcodegenGrade } from './types';
import { CODE_BASE_PATH, FOLDER_TO_STATUS } from './constants';

// Folders to completely ignore
const IGNORED_FOLDERS = new Set([
  'node_modules',
  '.git',
  '__pycache__',
  '.next',
  'dist',
  'build',
  '.obsidian',
  '.stfolder',
  '.pytest_cache',
  '.codemachine',
  '.claude',
]);


// Files that indicate this is a project root
const PROJECT_INDICATORS = [
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'Makefile',
  '.git',
  'VERSION',
];

interface TechDetection {
  tech: string;
  priority: number;
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function detectTechStack(projectPath: string): Promise<string[]> {
  const techs: TechDetection[] = [];

  // Check package.json for JavaScript/TypeScript ecosystem
  const packageJson = await readJsonFile<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(path.join(projectPath, 'package.json'));

  if (packageJson) {
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // Detect frameworks
    if (allDeps['next']) techs.push({ tech: 'Next.js', priority: 10 });
    if (allDeps['react']) techs.push({ tech: 'React', priority: 9 });
    if (allDeps['vue']) techs.push({ tech: 'Vue', priority: 9 });
    if (allDeps['svelte']) techs.push({ tech: 'Svelte', priority: 9 });
    if (allDeps['express']) techs.push({ tech: 'Express', priority: 8 });
    if (allDeps['fastify']) techs.push({ tech: 'Fastify', priority: 8 });
    if (allDeps['electron']) techs.push({ tech: 'Electron', priority: 9 });
    if (allDeps['tailwindcss']) techs.push({ tech: 'Tailwind', priority: 7 });
    if (allDeps['typescript']) techs.push({ tech: 'TypeScript', priority: 6 });

    // If no specific framework detected, add Node.js
    if (techs.length === 0) {
      techs.push({ tech: 'Node.js', priority: 5 });
    }
  }

  // Check for Python
  if (await fileExists(path.join(projectPath, 'pyproject.toml'))) {
    techs.push({ tech: 'Python', priority: 10 });

    const pyproject = await readTextFile(path.join(projectPath, 'pyproject.toml'));
    if (pyproject) {
      if (pyproject.includes('fastapi')) techs.push({ tech: 'FastAPI', priority: 8 });
      if (pyproject.includes('django')) techs.push({ tech: 'Django', priority: 8 });
      if (pyproject.includes('flask')) techs.push({ tech: 'Flask', priority: 8 });
    }
  } else if (await fileExists(path.join(projectPath, 'requirements.txt'))) {
    techs.push({ tech: 'Python', priority: 10 });

    const reqs = await readTextFile(path.join(projectPath, 'requirements.txt'));
    if (reqs) {
      if (reqs.includes('fastapi')) techs.push({ tech: 'FastAPI', priority: 8 });
      if (reqs.includes('django')) techs.push({ tech: 'Django', priority: 8 });
      if (reqs.includes('flask')) techs.push({ tech: 'Flask', priority: 8 });
    }
  }

  // Check for Rust
  if (await fileExists(path.join(projectPath, 'Cargo.toml'))) {
    techs.push({ tech: 'Rust', priority: 10 });
  }

  // Check for Go
  if (await fileExists(path.join(projectPath, 'go.mod'))) {
    techs.push({ tech: 'Go', priority: 10 });
  }

  // Sort by priority and return unique techs
  return [...new Set(
    techs
      .sort((a, b) => b.priority - a.priority)
      .map(t => t.tech)
  )].slice(0, 5);
}

export async function extractDescription(projectPath: string): Promise<string | undefined> {
  // Try package.json description first
  const packageJson = await readJsonFile<{ description?: string }>(
    path.join(projectPath, 'package.json')
  );
  if (packageJson?.description) {
    return packageJson.description;
  }

  // Try README
  const readmePaths = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];
  for (const readmePath of readmePaths) {
    const readme = await readTextFile(path.join(projectPath, readmePath));
    if (readme) {
      // Extract first paragraph (skip header lines starting with #)
      const lines = readme.split('\n');
      let description = '';
      let foundContent = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          if (foundContent) break;
          continue;
        }
        if (trimmed.startsWith('#')) continue;
        if (trimmed.startsWith('![')) continue; // Skip images
        if (trimmed.startsWith('[')) continue; // Skip badges

        foundContent = true;
        description += (description ? ' ' : '') + trimmed;

        if (description.length > 200) break;
      }

      if (description) {
        return description.slice(0, 200) + (description.length > 200 ? '...' : '');
      }
    }
  }

  return undefined;
}

export async function getGitInfo(projectPath: string): Promise<{
  hasGit: boolean;
  branch?: string;
  remote?: string;
}> {
  const gitPath = path.join(projectPath, '.git');
  if (!(await fileExists(gitPath))) {
    return { hasGit: false };
  }

  // Handle worktrees/submodules where .git is a file pointing to gitdir
  let gitDir = gitPath;
  try {
    const gitStat = await fs.stat(gitPath);
    if (gitStat.isFile()) {
      const gitFile = await readTextFile(gitPath);
      const match = gitFile?.match(/^gitdir:\s*(.+)\s*$/m);
      if (match) {
        gitDir = path.resolve(projectPath, match[1].trim());
      }
    }
  } catch {
    return { hasGit: false };
  }

  let branch: string | undefined;
  let remote: string | undefined;

  // Read current branch from HEAD
  const headContent = await readTextFile(path.join(gitDir, 'HEAD'));
  if (headContent) {
    const match = headContent.match(/ref: refs\/heads\/(.+)/);
    if (match) {
      branch = match[1].trim();
    }
  }

  // Read remote URL
  const configContent = await readTextFile(path.join(gitDir, 'config'));
  if (configContent) {
    const remoteMatch = configContent.match(/\[remote "origin"\][^\[]*url\s*=\s*(.+)/);
    if (remoteMatch) {
      remote = remoteMatch[1].trim();
    }
  }

  return { hasGit: true, branch, remote };
}

export async function getVersion(projectPath: string): Promise<string | undefined> {
  // Check VERSION file first
  const versionFile = await readTextFile(path.join(projectPath, 'VERSION'));
  if (versionFile) {
    return versionFile.trim().split('\n')[0];
  }

  // Check package.json
  const packageJson = await readJsonFile<{ version?: string }>(
    path.join(projectPath, 'package.json')
  );
  if (packageJson?.version) {
    return packageJson.version;
  }

  // Check pyproject.toml
  const pyproject = await readTextFile(path.join(projectPath, 'pyproject.toml'));
  if (pyproject) {
    const match = pyproject.match(/version\s*=\s*["']([^"']+)["']/);
    if (match) {
      return match[1];
    }
  }

  // Check Cargo.toml
  const cargo = await readTextFile(path.join(projectPath, 'Cargo.toml'));
  if (cargo) {
    const match = cargo.match(/version\s*=\s*["']([^"']+)["']/);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

export async function getScripts(projectPath: string): Promise<Record<string, string> | undefined> {
  const packageJson = await readJsonFile<{ scripts?: Record<string, string> }>(
    path.join(projectPath, 'package.json')
  );
  return packageJson?.scripts;
}

export async function getDependencies(projectPath: string): Promise<Record<string, string> | undefined> {
  const packageJson = await readJsonFile<{
    dependencies?: Record<string, string>;
  }>(path.join(projectPath, 'package.json'));
  return packageJson?.dependencies;
}

export async function getLastModified(projectPath: string): Promise<string> {
  try {
    const stats = await fs.stat(projectPath);
    return stats.mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

export async function scanBugs(projectPath: string): Promise<BugInfo | undefined> {
  const openDir = path.join(projectPath, '_bugs_open');
  const fixedDir = path.join(projectPath, '_bugs_fixed');

  const bugs: BugReport[] = [];
  let openCount = 0;
  let fixedCount = 0;

  // Scan open bugs
  try {
    const openFiles = await fs.readdir(openDir);
    for (const file of openFiles) {
      if (!file.endsWith('.md') || file === '.gitkeep') continue;
      openCount++;

      const bug = await parseBugFile(path.join(openDir, file), 'open');
      if (bug) bugs.push(bug);
    }
  } catch {
    // Directory doesn't exist
  }

  // Scan fixed bugs
  try {
    const fixedFiles = await fs.readdir(fixedDir);
    for (const file of fixedFiles) {
      if (!file.endsWith('.md') || file === '.gitkeep') continue;
      fixedCount++;

      const bug = await parseBugFile(path.join(fixedDir, file), 'fixed');
      if (bug) bugs.push(bug);
    }
  } catch {
    // Directory doesn't exist
  }

  // Only return bug info if there are any bugs
  if (openCount === 0 && fixedCount === 0) {
    return undefined;
  }

  // Sort bugs by date (newest first)
  bugs.sort((a, b) => b.date.localeCompare(a.date));

  return { openCount, fixedCount, bugs };
}

async function parseBugFile(filePath: string, status: 'open' | 'fixed'): Promise<BugReport | null> {
  try {
    const filename = path.basename(filePath);
    const content = await fs.readFile(filePath, 'utf-8');

    // Extract title from first # heading or filename
    let title = filename.replace('.md', '');
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1];
    }

    // Extract date from filename (format: YYYY-MM-DD-title.md)
    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : '';

    return { filename, title, date, status };
  } catch {
    return null;
  }
}

export async function scanRcodegen(projectPath: string): Promise<RcodegenInfo | undefined> {
  const rcodegenDir = path.join(projectPath, '_rcodegen');
  const gradesPath = path.join(rcodegenDir, '.grades.json');

  // Check if _rcodegen directory exists
  if (!(await fileExists(rcodegenDir))) {
    return undefined;
  }

  let grades: RcodegenGrade[] = [];

  // Try to load grades from .grades.json
  try {
    const content = await fs.readFile(gradesPath, 'utf-8');
    const data = JSON.parse(content);
    if (data.grades && Array.isArray(data.grades)) {
      grades = data.grades.map((g: { date: string; tool: string; task: string; grade: number; reportFile: string }) => ({
        date: g.date,
        tool: g.tool,
        task: g.task,
        grade: g.grade,
        reportFile: g.reportFile,
      }));
    }
  } catch {
    // .grades.json doesn't exist or is invalid, try scanning files
    try {
      const files = await fs.readdir(rcodegenDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        // Parse filename: {project}-{tool}-{task}-{timestamp}.md
        const match = file.match(/^.+-([a-z]+)-([a-z]+)-(\d{4}-\d{2}-\d{2})/);
        if (!match) continue;

        const [, tool, task, dateStr] = match;
        const filePath = path.join(rcodegenDir, file);

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          // Limit content search to first 10KB to prevent ReDoS on large files
          const searchContent = content.slice(0, 10240);
          const gradeMatch = searchContent.match(/TOTAL_SCORE:\s*(\d+(?:\.\d+)?)\s*\/\s*100/i);
          if (gradeMatch) {
            grades.push({
              date: new Date(dateStr).toISOString(),
              tool: tool as RcodegenGrade['tool'],
              task: task as RcodegenGrade['task'],
              grade: parseFloat(gradeMatch[1]),
              reportFile: file,
            });
          }
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      return undefined;
    }
  }

  if (grades.length === 0) {
    return undefined;
  }

  // Sort by date descending
  grades.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Get latest grade
  const latestGrade = grades[0]?.grade ?? null;

  // Get last run date
  const lastRun = grades[0]?.date ?? null;

  // Compute per-task grades (latest for each tool)
  const taskGrades: RcodegenInfo['taskGrades'] = {
    audit: [],
    test: [],
    fix: [],
    refactor: [],
  };

  const primaryTasks = ['audit', 'test', 'fix', 'refactor'] as const;
  for (const task of primaryTasks) {
    const seenTools = new Set<string>();
    for (const grade of grades) {
      if (grade.task === task && !seenTools.has(grade.tool)) {
        seenTools.add(grade.tool);
        taskGrades[task].push({ grade: grade.grade, tool: grade.tool });
      }
    }
  }

  return {
    reportCount: grades.length,
    lastRun,
    latestGrade,
    taskGrades,
    recentGrades: grades.slice(0, 10), // Keep last 10 grades
  };
}

export async function isProjectDirectory(dirPath: string): Promise<boolean> {
  for (const indicator of PROJECT_INDICATORS) {
    if (await fileExists(path.join(dirPath, indicator))) {
      return true;
    }
  }
  return false;
}

export function determineStatus(projectPath: string): ProjectStatus {
  const relativePath = path.relative(CODE_BASE_PATH, projectPath);
  const parts = relativePath.split(path.sep);

  for (const part of parts) {
    if (FOLDER_TO_STATUS[part]) {
      return FOLDER_TO_STATUS[part];
    }
  }

  return 'active';
}

export function isSuiteDirectory(name: string): boolean {
  return name.endsWith('_suite');
}

export function formatSuiteName(dirName: string): string {
  // "builder_suite" -> "Builder", "app_email4ai_suite" -> "App Email4ai"
  return dirName
    .replace(/_suite$/, '')
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export async function scanProject(projectPath: string, requireIndicators: boolean = true, suite?: string): Promise<Project | null> {
  const name = path.basename(projectPath);

  // Skip ignored folders
  if (IGNORED_FOLDERS.has(name) || name.startsWith('.sync-conflict')) {
    return null;
  }

  // Skip if not a directory
  try {
    const stats = await fs.stat(projectPath);
    if (!stats.isDirectory()) {
      return null;
    }
  } catch {
    return null;
  }

  // Check if this is a project (only required for active projects)
  if (requireIndicators && !(await isProjectDirectory(projectPath))) {
    return null;
  }

  const [techStack, description, gitInfo, version, scripts, dependencies, lastModified, bugs, rcodegen] =
    await Promise.all([
      detectTechStack(projectPath),
      extractDescription(projectPath),
      getGitInfo(projectPath),
      getVersion(projectPath),
      getScripts(projectPath),
      getDependencies(projectPath),
      getLastModified(projectPath),
      scanBugs(projectPath),
      scanRcodegen(projectPath),
    ]);

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return {
    slug,
    name,
    path: projectPath,
    suite,
    description,
    status: determineStatus(projectPath),
    techStack,
    version,
    lastModified,
    gitBranch: gitInfo.branch,
    gitRemote: gitInfo.remote,
    hasGit: gitInfo.hasGit,
    dependencies,
    scripts,
    bugs,
    rcodegen,
  };
}

export async function scanAllProjects(): Promise<Project[]> {
  const projects: Project[] = [];
  const seenSlugs = new Set<string>();

  // Scan a single directory level for projects
  async function scanLevel(dirPath: string, requireIndicators: boolean, suite?: string): Promise<void> {
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
        if (isSuiteDirectory(entry.name)) continue; // Suites scanned separately

        // Check if it's a project
        const project = await scanProject(fullPath, requireIndicators, suite);
        if (project) {
          // Handle slug collisions by prefixing with suite name
          if (seenSlugs.has(project.slug)) {
            // Retroactively prefix the first project if it's also in a suite
            const existing = projects.find(p => p.slug === project.slug);
            if (existing?.suite) {
              const existingPrefix = existing.suite.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
              seenSlugs.delete(existing.slug);
              existing.slug = `${existingPrefix}--${existing.slug}`;
              seenSlugs.add(existing.slug);
            }
            // Prefix the new project if it's in a suite
            if (suite) {
              const suitePrefix = suite.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
              project.slug = `${suitePrefix}--${project.slug}`;
            }
          }
          seenSlugs.add(project.slug);
          projects.push(project);
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  // Scan root level (direct children of _code) - require project indicators
  // This picks up any projects still at the root level (not in suites)
  await scanLevel(CODE_BASE_PATH, true);

  // Scan suite directories (*_suite) - require project indicators
  try {
    const rootEntries = await fs.readdir(CODE_BASE_PATH, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (!entry.isDirectory()) continue;
      if (!isSuiteDirectory(entry.name)) continue;

      const suitePath = path.join(CODE_BASE_PATH, entry.name);
      const suiteName = formatSuiteName(entry.name);
      await scanLevel(suitePath, true, suiteName);
    }
  } catch {
    // Ignore permission errors
  }

  // Scan status folders (_crawlers, _icebox, _old, _research_and_demos) - no indicators required
  for (const folderName of Object.keys(FOLDER_TO_STATUS)) {
    const statusPath = path.join(CODE_BASE_PATH, folderName);
    try {
      await fs.access(statusPath);
      await scanLevel(statusPath, false);
    } catch {
      // Folder doesn't exist, skip
    }
  }

  // Sort by last modified (most recent first)
  return projects.sort((a, b) =>
    new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  );
}

export function getCodeBasePath(): string {
  return CODE_BASE_PATH;
}
