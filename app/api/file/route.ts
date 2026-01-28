import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { CODE_BASE_PATH } from '@/lib/constants';

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

  // Security: Resolve path to prevent traversal attacks (e.g., ../../etc/passwd)
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(CODE_BASE_PATH + '/')) {
    return NextResponse.json(
      { error: 'Invalid path' },
      { status: 403 }
    );
  }

  // Security: Check real path to prevent symlink attacks
  try {
    const realPath = await fs.realpath(resolvedPath);
    if (!realPath.startsWith(CODE_BASE_PATH + '/') && realPath !== CODE_BASE_PATH) {
      return NextResponse.json(
        { error: 'Invalid path: symlink outside allowed directory' },
        { status: 403 }
      );
    }
  } catch {
    // File doesn't exist - will fail on read anyway
  }

  try {
    const content = await fs.readFile(resolvedPath, 'utf-8');
    return NextResponse.json({ content });
  } catch (error) {
    console.error('Error reading file:', error);
    return NextResponse.json(
      { error: 'Failed to read file' },
      { status: 404 }
    );
  }
}
