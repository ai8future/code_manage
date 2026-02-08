import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CODE_BASE_PATH } from '@/lib/constants';
import { createRequestLogger } from '@/lib/logger';
import { validatePath } from '@/lib/api/pathSecurity';
import { validationError, notFoundError } from '@/lib/chassis/errors';
import { errorResponse, handleRouteError, pathErrorResponse } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

const README_FILES = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];

export async function GET(request: Request) {
  const log = createRequestLogger('projects/readme', request);
  const { searchParams } = new URL(request.url);
  const projectPath = searchParams.get('path');

  if (!projectPath) {
    return errorResponse(validationError('Path is required'));
  }

  const pathResult = await validatePath(projectPath, { requireExists: false });
  if (!pathResult.valid) {
    return pathErrorResponse(pathResult.error, pathResult.status);
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

    return errorResponse(notFoundError('README not found'));
  } catch (error) {
    log.error({ err: error }, 'Error reading README');
    return handleRouteError(error);
  }
}
