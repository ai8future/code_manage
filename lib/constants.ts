import { ProjectStatus } from './types';

// Centralized configuration constants
export const CODE_BASE_PATH = process.env.CODE_BASE_PATH || '/Users/cliff/Desktop/_code';

// Status folder mappings: status → folder name (null for root level)
export const STATUS_FOLDERS: Record<ProjectStatus, string | null> = {
  active: null,           // Root level (no subfolder)
  crawlers: '_crawlers',
  icebox: '_icebox',
  archived: '_old',
};

// Reverse mapping: folder name → status
export const FOLDER_TO_STATUS: Record<string, ProjectStatus> = {
  '_crawlers': 'crawlers',
  '_icebox': 'icebox',
  '_old': 'archived',
};
