import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { createRouteLogger } from '@/lib/logger';
import { validatePath } from '@/lib/api/pathSecurity';

const log = createRouteLogger('file');

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');

  if (!filePath || typeof filePath !== 'string') {
    return NextResponse.json(
      { error: 'Path is required' },
      { status: 400 }
    );
  }

  const pathResult = await validatePath(filePath, { requireExists: false });
  if (!pathResult.valid) {
    return NextResponse.json({ error: pathResult.error }, { status: pathResult.status });
  }

  try {
    const content = await fs.readFile(pathResult.resolvedPath, 'utf-8');
    return NextResponse.json({ content });
  } catch (error) {
    log.error({ err: error }, 'Error reading file');
    return NextResponse.json(
      { error: 'Failed to read file' },
      { status: 404 }
    );
  }
}
