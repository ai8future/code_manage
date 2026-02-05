import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRouteLogger } from '@/lib/logger';
import { validatePath } from '@/lib/api/pathSecurity';

const execFileAsync = promisify(execFile);

export function createOpenActionRoute(command: string, commandArgs: string[] = []) {
  const log = createRouteLogger(`open/${command}`);
  return async function POST(request: Request) {
    try {
      const { path: targetPath } = await request.json();

      if (!targetPath || typeof targetPath !== 'string') {
        return NextResponse.json({ error: 'Path is required' }, { status: 400 });
      }

      const pathResult = await validatePath(targetPath);
      if (!pathResult.valid) {
        return NextResponse.json({ error: pathResult.error }, { status: pathResult.status });
      }

      await execFileAsync(command, [...commandArgs, pathResult.resolvedPath]);
      return NextResponse.json({ success: true });
    } catch (error) {
      log.error({ err: error }, `Failed to execute ${command}`);
      return NextResponse.json(
        { error: `Failed to execute ${command}` },
        { status: 500 }
      );
    }
  };
}
