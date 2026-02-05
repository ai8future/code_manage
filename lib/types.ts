export type ProjectStatus = 'active' | 'crawlers' | 'research' | 'tools' | 'icebox' | 'archived';

export interface BugReport {
  filename: string;
  title: string;
  date: string;
  status: 'open' | 'fixed';
}

export interface BugInfo {
  openCount: number;
  fixedCount: number;
  bugs: BugReport[];
}

export type RcodegenTask = 'audit' | 'test' | 'fix' | 'refactor' | 'quick';
export type RcodegenTool = 'claude' | 'gemini' | 'codex';

export interface RcodegenGrade {
  date: string;
  tool: RcodegenTool;
  task: RcodegenTask;
  grade: number;
  reportFile: string;
}

export interface RcodegenTaskGrade {
  grade: number;
  tool: string;
}

export interface RcodegenInfo {
  reportCount: number;
  lastRun: string | null;
  latestGrade: number | null;
  taskGrades: {
    audit: RcodegenTaskGrade[];
    test: RcodegenTaskGrade[];
    fix: RcodegenTaskGrade[];
    refactor: RcodegenTaskGrade[];
  };
  recentGrades: RcodegenGrade[];
}

export interface Project {
  slug: string;
  name: string;
  path: string;
  suite?: string;
  description?: string;
  status: ProjectStatus;
  techStack: string[];
  version?: string;
  lastModified: string;
  gitBranch?: string;
  gitRemote?: string;
  hasGit: boolean;
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  bugs?: BugInfo;
  rcodegen?: RcodegenInfo;
  starred?: boolean;
}

export interface ProjectMetadata {
  status?: ProjectStatus;
  customName?: string;
  customDescription?: string;
  tags?: string[];
  notes?: string;
  starred?: boolean;
}

export interface CodeManageConfig {
  projects: Record<string, ProjectMetadata>;
  settings: AppSettings;
}

export interface AppSettings {
  sidebarCollapsed: boolean;
  defaultStatus: ProjectStatus;
  terminalHeight: number;
}

export const DEFAULT_CONFIG: CodeManageConfig = {
  projects: {},
  settings: {
    sidebarCollapsed: false,
    defaultStatus: 'active',
    terminalHeight: 300,
  },
};
