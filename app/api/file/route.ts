import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { createRequestLogger } from '@/lib/logger';
import { validatePath } from '@/lib/api/pathSecurity';
import { validationError, notFoundError } from '@/lib/chassis/errors';
import { errorResponse, handleRouteError, pathErrorResponse } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const log = createRequestLogger('file', request);
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');

  if (!filePath || typeof filePath !== 'string') {
    return errorResponse(validationError('Path is required'));
  }

  const pathResult = await validatePath(filePath, { requireExists: false });
  if (!pathResult.valid) {
    return pathErrorResponse(pathResult.error, pathResult.status);
  }

  try {
    const content = await fs.readFile(pathResult.resolvedPath, 'utf-8');
    return NextResponse.json({ content });
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return errorResponse(notFoundError('File not found'));
    }
    log.error({ err: error }, 'Error reading file');
    return handleRouteError(error);
  }
}
