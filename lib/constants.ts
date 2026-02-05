import { ProjectStatus } from './types';
import { env } from './env';

// CODE_BASE_PATH: Zod-validated from lib/env.ts
export const CODE_BASE_PATH = env.CODE_BASE_PATH;

// Status folder mappings: status → folder name (null for root level)
export const STATUS_FOLDERS: Record<ProjectStatus, string | null> = {
  active: null,           // Root level (no subfolder)
  crawlers: '_crawlers',
  research: '_research_and_demos',
  tools: '_tools',
  icebox: '_icebox',
  archived: '_old',
};

// Reverse mapping: folder name → status
export const FOLDER_TO_STATUS: Record<string, ProjectStatus> = {
  '_crawlers': 'crawlers',
  '_research_and_demos': 'research',
  '_tools': 'tools',
  '_icebox': 'icebox',
  '_old': 'archived',
};
