import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';

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
