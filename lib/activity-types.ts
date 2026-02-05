/**
 * Shared types for activity-related APIs and components.
 */

export interface VelocityDataPoint {
  date: string;
  linesAdded: number;
  linesRemoved: number;
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
  project: string;
  projectSlug: string;
  linesAdded: number;
  linesRemoved: number;
}

export interface VelocityResponse {
  data: VelocityDataPoint[];
}

export interface CommitsResponse {
  commits: CommitInfo[];
}

export interface SearchResult {
  project: string;
  projectSlug: string;
  file: string;
  line: number;
  content: string;
}

export interface SearchResponse {
  query: string;
  totalResults: number;
  results: SearchResult[];
  grouped: Record<string, SearchResult[]>;
}

// API limits - centralized for consistency
export const API_LIMITS = {
  VELOCITY_DAYS_MIN: 1,
  VELOCITY_DAYS_MAX: 365,
  VELOCITY_DAYS_DEFAULT: 30,
  COMMITS_LIMIT_MIN: 1,
  COMMITS_LIMIT_MAX: 500,
  COMMITS_LIMIT_DEFAULT: 50,
  COMMITS_PER_PROJECT: 50,
  SEARCH_LIMIT_MIN: 1,
  SEARCH_LIMIT_MAX: 500,
  SEARCH_LIMIT_DEFAULT: 100,
  SEARCH_QUERY_MAX_LENGTH: 200,
  SEARCH_CONTENT_MAX_LENGTH: 300,
  PROJECT_NAME_MAX_LENGTH: 100,
  PROJECT_DESCRIPTION_MAX_LENGTH: 5000,
} as const;
