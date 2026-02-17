import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { CODE_BASE_PATH } from '@/lib/constants';
import { SearchResult, API_LIMITS } from '@/lib/activity-types';
import { createRequestLogger } from '@/lib/logger';
import { validationError } from '@/lib/chassis/errors';
import { errorResponse, handleRouteError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

interface RgMatch {
  type: string;
  data: {
    path?: { text: string };
    lines?: { text: string };
    line_number?: number;
    submatches?: Array<{ match: { text: string }; start: number; end: number }>;
  };
}

export async function GET(request: Request) {
  const log = createRequestLogger('search', request);
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const limitParam = searchParams.get('limit');
  const limit = limitParam
    ? Math.min(Math.max(parseInt(limitParam, 10), API_LIMITS.SEARCH_LIMIT_MIN), API_LIMITS.SEARCH_LIMIT_MAX)
    : API_LIMITS.SEARCH_LIMIT_DEFAULT;

  if (!query || query.trim().length === 0) {
    return errorResponse(validationError('Search query is required'));
  }

  // Limit query length to prevent abuse
  const sanitizedQuery = query.slice(0, API_LIMITS.SEARCH_QUERY_MAX_LENGTH);

  try {
    // Use spawn with array args to prevent shell injection (no shell interpretation)
    const excludePatterns = [
      '--glob=!node_modules',
      '--glob=!.git',
      '--glob=!dist',
      '--glob=!build',
      '--glob=!.next',
      '--glob=!__pycache__',
      '--glob=!*.lock',
      '--glob=!package-lock.json',
      '--glob=!yarn.lock',
      '--glob=!pnpm-lock.yaml',
      '--glob=!.env*',
      '--glob=!_old',
      '--glob=!_icebox',
    ];

    // Build args array - spawn doesn't use shell, so args are safe from injection
    const args = [
      '--json',
      '--max-count=10',
      '--max-filesize=1M',
      ...excludePatterns,
      '--',
      sanitizedQuery,
    ];

    const stdout = await new Promise<string>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (!settled) { settled = true; fn(); }
      };

      const rg = spawn('rg', args, {
        cwd: CODE_BASE_PATH,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Array-based buffering instead of string concatenation
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let errorOutput = '';
      const MAX_OUTPUT = 5 * 1024 * 1024; // 5MB (down from 20MB)

      // 30-second timeout
      const timer = setTimeout(() => {
        rg.kill('SIGKILL');
        settle(() => reject(new Error('Search timed out')));
      }, 30_000);

      rg.stdout.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_OUTPUT) {
          rg.kill();
          settle(() => reject(new Error('Output too large')));
          return;
        }
        chunks.push(chunk);
      });

      rg.stderr.on('data', (data: Buffer) => {
        if (errorOutput.length < 4096) {
          errorOutput += data.toString();
        }
      });

      rg.on('close', (code) => {
        clearTimeout(timer);
        const output = Buffer.concat(chunks).toString();
        settle(() => {
          // ripgrep returns 1 for no matches, 0 for matches, 2 for errors
          if (code === 0 || code === 1) {
            resolve(output);
          } else {
            reject(new Error(`rg exited with code ${code}: ${errorOutput.slice(0, 500)}`));
          }
        });
      });

      rg.on('error', (err) => {
        clearTimeout(timer);
        settle(() => reject(err));
      });
    });

    const results: SearchResult[] = [];
    const lines = stdout.split('\n').filter(Boolean);

    for (const line of lines) {
      if (results.length >= limit) break;

      try {
        const parsed: RgMatch = JSON.parse(line);

        if (parsed.type === 'match' && parsed.data.path?.text && parsed.data.lines?.text) {
          const filePath = parsed.data.path.text;
          const lineNumber = parsed.data.line_number || 0;
          const content = parsed.data.lines.text.trim();

          // Extract project name from path
          const pathParts = filePath.split(path.sep);
          let projectName = pathParts[0];

          // Handle status folders like _crawlers, _research_and_demos, etc.
          if (projectName.startsWith('_') && pathParts.length > 1) {
            projectName = pathParts[1];
          }

          const projectSlug = projectName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

          // Get file path relative to project
          let fileInProject = filePath;
          const projectIdx = pathParts.indexOf(projectName);
          if (projectIdx >= 0) {
            fileInProject = pathParts.slice(projectIdx + 1).join(path.sep);
          }

          results.push({
            project: projectName,
            projectSlug,
            file: fileInProject,
            line: lineNumber,
            content: content.length > API_LIMITS.SEARCH_CONTENT_MAX_LENGTH
              ? content.slice(0, API_LIMITS.SEARCH_CONTENT_MAX_LENGTH) + '...'
              : content,
          });
        }
      } catch {
        // Skip malformed JSON lines
      }
    }

    // Group results by project
    const grouped = results.reduce((acc, result) => {
      if (!acc[result.project]) {
        acc[result.project] = [];
      }
      acc[result.project].push(result);
      return acc;
    }, {} as Record<string, SearchResult[]>);

    return NextResponse.json({
      query: sanitizedQuery,
      totalResults: results.length,
      results,
      grouped,
    });
  } catch (error) {
    log.error({ err: error }, 'Search error');
    return handleRouteError(error);
  }
}
