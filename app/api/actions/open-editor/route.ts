import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileAsync = promisify(execFile);

const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';

export async function POST(request: Request) {
  try {
    const { path: filePath } = await request.json();

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json(
        { error: 'Path is required' },
        { status: 400 }
      );
    }

    // Security: Resolve path and validate it's within allowed directory
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(CODE_BASE_PATH + '/') && resolvedPath !== CODE_BASE_PATH) {
      return NextResponse.json(
        { error: 'Invalid path' },
        { status: 403 }
      );
    }

    // Open in VS Code using execFile (prevents shell injection)
    await execFileAsync('code', [resolvedPath]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to open in editor:', error);
    return NextResponse.json(
      { error: 'Failed to open in editor' },
      { status: 500 }
    );
  }
}
