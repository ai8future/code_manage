import { NextResponse } from 'next/server';
import { scanAllProjects } from '@/lib/scanner';
import { spawnGit, parseNumstatLine } from '@/lib/git';
import { VelocityDataPoint, API_LIMITS } from '@/lib/activity-types';
import { createRouteLogger } from '@/lib/logger';

const log = createRouteLogger('activity/velocity');

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const daysParam = searchParams.get('days');
  const days = daysParam
    ? Math.min(Math.max(parseInt(daysParam, 10), API_LIMITS.VELOCITY_DAYS_MIN), API_LIMITS.VELOCITY_DAYS_MAX)
    : API_LIMITS.VELOCITY_DAYS_DEFAULT;

  try {
    const projects = await scanAllProjects();
    const velocityMap = new Map<string, { added: number; removed: number }>();

    // Initialize all dates in the range
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      velocityMap.set(dateStr, { added: 0, removed: 0 });
    }

    // Collect git stats from each project
    const gitPromises = projects
      .filter((p) => p.hasGit)
      .map(async (project) => {
        try {
          const stdout = await spawnGit([
            'log',
            '--numstat',
            `--since=${days} days ago`,
            '--pretty=format:%ad',
            '--date=short',
          ], { cwd: project.path });

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
              const existing = velocityMap.get(currentDate);
              if (existing) {
                existing.added += stats.added;
                existing.removed += stats.removed;
              }
            }
          }
        } catch {
          // Skip projects where git command fails
        }
      });

    await Promise.all(gitPromises);

    // Convert map to sorted array
    const data: VelocityDataPoint[] = Array.from(velocityMap.entries())
      .map(([date, stats]) => ({
        date,
        linesAdded: stats.added,
        linesRemoved: stats.removed,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ data });
  } catch (error) {
    log.error({ err: error }, 'Error fetching velocity data');
    return NextResponse.json(
      { error: 'Failed to fetch velocity data' },
      { status: 500 }
    );
  }
}
