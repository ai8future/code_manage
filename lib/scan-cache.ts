import { Project } from './types';
import { scanAllProjects } from './scanner';

const CACHE_TTL_MS = 10_000; // 10 seconds

interface CacheEntry {
  projects: Project[];
  timestamp: number;
}

let cached: CacheEntry | null = null;
let inflight: Promise<Project[]> | null = null;

/**
 * Returns cached project list, or runs a single scan shared across
 * all concurrent callers. Prevents the "5 components mount and each
 * triggers a full filesystem scan" problem.
 */
export async function getCachedProjects(): Promise<Project[]> {
  // Return cached data if still fresh
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.projects;
  }

  // If a scan is already in progress, wait for it instead of starting another
  if (inflight) {
    return inflight;
  }

  // Start a new scan and share the promise
  inflight = scanAllProjects()
    .then((projects) => {
      cached = { projects, timestamp: Date.now() };
      inflight = null;
      return projects;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });

  return inflight;
}

/**
 * Invalidate the cache so the next request triggers a fresh scan.
 * Call this after mutations (star, status change, etc).
 */
export function invalidateProjectCache(): void {
  cached = null;
}
