import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CODE_BASE_PATH } from '@/lib/constants';
import { createRouteLogger } from '@/lib/logger';
import { validatePath } from '@/lib/api/pathSecurity';

const log = createRouteLogger('projects/readme');

export const dynamic = 'force-dynamic';

const README_FILES = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get('path');

  if (!projectPath) {
    return NextResponse.json(
      { error: 'Path is required' },
      { status: 400 }
    );
  }

  const pathResult = await validatePath(projectPath, { requireExists: false });
  if (!pathResult.valid) {
    return NextResponse.json({ error: pathResult.error }, { status: pathResult.status });
  }

  try {
    for (const filename of README_FILES) {
      const filePath = path.join(pathResult.resolvedPath, filename);
      try {
        // Also check realpath of the file itself
        const realFilePath = await fs.realpath(filePath);
        if (!realFilePath.startsWith(CODE_BASE_PATH + '/')) {
          continue; // Skip symlinks pointing outside
        }
        const content = await fs.readFile(realFilePath, 'utf-8');
        return NextResponse.json({ content, filename });
      } catch {
        // File doesn't exist, try next one
      }
    }

    return NextResponse.json(
      { error: 'README not found' },
      { status: 404 }
    );
  } catch (error) {
    log.error({ err: error }, 'Error reading README');
    return NextResponse.json(
      { error: 'Failed to read README' },
      { status: 500 }
    );
  }
}
