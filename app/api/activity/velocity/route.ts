import { NextResponse } from 'next/server';
import { getCachedProjects } from '@/lib/scan-cache';
import { spawnGit, parseNumstatLine } from '@/lib/git';
import { VelocityDataPoint, API_LIMITS } from '@/lib/activity-types';
import { createTrackedRequestLogger } from '@/lib/logger';
import { handleRouteError } from '@/lib/api/errors';
import { workMap } from '@/lib/chassis/work';

export const dynamic = 'force-dynamic';

// Cache keyed by days parameter
const velocityCache = new Map<number, { data: VelocityDataPoint[]; ts: number }>();
const VELOCITY_CACHE_TTL = 60_000; // 60s — velocity data changes slowly
const VELOCITY_CACHE_MAX_ENTRIES = 10; // FIFO eviction prevents unbounded growth

export async function GET(request: Request) {
  const { log, done } = createTrackedRequestLogger('activity/velocity', request);
  const { searchParams } = new URL(request.url);
  const daysParam = searchParams.get('days');
  const days = daysParam
    ? Math.min(Math.max(parseInt(daysParam, 10), API_LIMITS.VELOCITY_DAYS_MIN), API_LIMITS.VELOCITY_DAYS_MAX)
    : API_LIMITS.VELOCITY_DAYS_DEFAULT;

  try {
    // Return cached if fresh
    const cached = velocityCache.get(days);
    if (cached && Date.now() - cached.ts < VELOCITY_CACHE_TTL) {
      done();
      return NextResponse.json({ data: cached.data });
    }

    const projects = await getCachedProjects();
    const velocityMap = new Map<string, { added: number; removed: number }>();

    // Initialize all dates in the range
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      velocityMap.set(dateStr, { added: 0, removed: 0 });
    }

    // Collect git stats from each project with bounded concurrency (3 workers, not 8)
    const gitProjects = projects.filter((p) => p.hasGit);
    const results = await workMap(
      gitProjects,
      async (project) => {
        try {
          const stdout = await spawnGit([
            'log',
            '--numstat',
            `--since=${days} days ago`,
            '--pretty=format:%ad',
            '--date=short',
          ], { cwd: project.path, timeoutMs: 15_000 });

          const localMap = new Map<string, { added: number; removed: number }>();
          let currentDate = '';
          for (const line of stdout.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Date line (YYYY-MM-DD)
            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
              currentDate = trimmed;
              continue;
            }

            // Numstat line
            const stats = parseNumstatLine(trimmed);
            if (stats && currentDate) {
              const existing = localMap.get(currentDate) ?? { added: 0, removed: 0 };
              existing.added += stats.added;
              existing.removed += stats.removed;
              localMap.set(currentDate, existing);
            }
          }
          return localMap;
        } catch {
          // Skip projects whose git log fails or times out
          return new Map<string, { added: number; removed: number }>();
        }
      },
      { workers: 3 },
    );

    // Merge per-project results sequentially (no concurrent mutation)
    for (const result of results) {
      if (!result.value) continue;
      for (const [date, stats] of result.value) {
        const existing = velocityMap.get(date);
        if (existing) {
          existing.added += stats.added;
          existing.removed += stats.removed;
        }
      }
    }

    // Convert map to sorted array
    const data: VelocityDataPoint[] = Array.from(velocityMap.entries())
      .map(([date, stats]) => ({
        date,
        linesAdded: stats.added,
        linesRemoved: stats.removed,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Evict oldest entries if cache exceeds max size (FIFO)
    if (velocityCache.size >= VELOCITY_CACHE_MAX_ENTRIES) {
      const oldest = velocityCache.keys().next().value;
      if (oldest !== undefined) velocityCache.delete(oldest);
    }

    // Cache result
    velocityCache.set(days, { data, ts: Date.now() });

    done();
    return NextResponse.json({ data });
  } catch (error) {
    done();
    log.error({ err: error }, 'Error fetching velocity data');
    return handleRouteError(error);
  }
}
