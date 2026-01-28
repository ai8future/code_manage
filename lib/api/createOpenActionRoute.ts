import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { CODE_BASE_PATH } from '@/lib/constants';

const execFileAsync = promisify(execFile);

export function createOpenActionRoute(command: string, commandArgs: string[] = []) {
  return async function POST(request: Request) {
    try {
      const { path: targetPath } = await request.json();

      if (!targetPath || typeof targetPath !== 'string') {
        return NextResponse.json({ error: 'Path is required' }, { status: 400 });
      }

      // Security: Resolve path and validate it's within allowed directory
      const resolvedPath = path.resolve(targetPath);
      if (!resolvedPath.startsWith(CODE_BASE_PATH + '/') && resolvedPath !== CODE_BASE_PATH) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
      }

      await execFileAsync(command, [...commandArgs, resolvedPath]);
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error(`Failed to execute ${command}:`, error);
      return NextResponse.json(
        { error: `Failed to execute ${command}` },
        { status: 500 }
      );
    }
  };
}
