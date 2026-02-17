import { NextResponse } from 'next/server';
import { getCachedProjects } from '@/lib/scan-cache';
import { spawnGit, parseNumstatLine } from '@/lib/git';
import { CommitInfo, API_LIMITS } from '@/lib/activity-types';
import { createRequestLogger } from '@/lib/logger';
import { handleRouteError } from '@/lib/api/errors';
import { workMap } from '@/lib/chassis/work';

export const dynamic = 'force-dynamic';

// Simple cache: commits don't change that fast
let commitsCache: { data: CommitInfo[]; ts: number } | null = null;
const COMMITS_CACHE_TTL = 30_000; // 30s

export async function GET(request: Request) {
  const log = createRequestLogger('activity/commits', request);
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const limit = limitParam
    ? Math.min(Math.max(parseInt(limitParam, 10), API_LIMITS.COMMITS_LIMIT_MIN), API_LIMITS.COMMITS_LIMIT_MAX)
    : API_LIMITS.COMMITS_LIMIT_DEFAULT;

  try {
    // Return cached commits if fresh (then just re-slice for limit)
    if (commitsCache && Date.now() - commitsCache.ts < COMMITS_CACHE_TTL) {
      return NextResponse.json({ commits: commitsCache.data.slice(0, limit) });
    }

    const projects = await getCachedProjects();
    const allCommits: CommitInfo[] = [];

    // Collect commits from each project with bounded concurrency (3 workers, not 8)
    const gitProjects = projects.filter((p) => p.hasGit);
    await workMap(
      gitProjects,
      async (project) => {
        try {
          const stdout = await spawnGit([
            'log',
            '--numstat',
            '-n', String(API_LIMITS.COMMITS_PER_PROJECT),
            '--pretty=format:COMMIT_START%n%H%n%s%n%an%n%aI',
            '--no-merges',
          ], { cwd: project.path, timeoutMs: 15_000 });

          const commits = stdout.split('COMMIT_START').filter(Boolean);

          for (const commitBlock of commits) {
            const lines = commitBlock.trim().split('\n');
            if (lines.length < 4) continue;

            const [hash, message, author, date] = lines.map((l) => l.trim());

            // Sum numstat lines
            let linesAdded = 0;
            let linesRemoved = 0;
            for (let i = 4; i < lines.length; i++) {
              const stats = parseNumstatLine(lines[i]);
              if (stats) {
                linesAdded += stats.added;
                linesRemoved += stats.removed;
              }
            }

            allCommits.push({
              hash,
              message,
              author,
              date,
              project: project.name,
              projectSlug: project.slug,
              linesAdded,
              linesRemoved,
            });
          }
        } catch {
          // Skip projects whose git log fails or times out
        }
      },
      { workers: 3 },
    );

    // Sort by date (newest first)
    const sortedCommits = allCommits
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Cache the full sorted list
    commitsCache = { data: sortedCommits, ts: Date.now() };

    return NextResponse.json({ commits: sortedCommits.slice(0, limit) });
  } catch (error) {
    log.error({ err: error }, 'Error fetching commits');
    return handleRouteError(error);
  }
}
