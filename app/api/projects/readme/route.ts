import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

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

  try {
    for (const filename of README_FILES) {
      const filePath = path.join(projectPath, filename);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
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
    console.error('Error reading README:', error);
    return NextResponse.json(
      { error: 'Failed to read README' },
      { status: 500 }
    );
  }
}
