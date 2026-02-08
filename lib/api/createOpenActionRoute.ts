import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { createRequestLogger } from '@/lib/logger';
import { validatePath } from '@/lib/api/pathSecurity';
import { parseSecureBody } from '@/lib/api/validate';
import { handleRouteError, pathErrorResponse } from '@/lib/api/errors';

const execFileAsync = promisify(execFile);

const openActionSchema = z.object({
  path: z.string().min(1, 'Path is required'),
});

export function createOpenActionRoute(command: string, commandArgs: string[] = []) {
  return async function POST(request: Request) {
    const log = createRequestLogger(`open/${command}`, request);
    try {
      const rawBody = await request.text();
      const result = parseSecureBody(openActionSchema, rawBody);
      if (!result.success) return result.response;
      const { path: targetPath } = result.data;

      const pathResult = await validatePath(targetPath);
      if (!pathResult.valid) {
        return pathErrorResponse(pathResult.error, pathResult.status);
      }

      await execFileAsync(command, [...commandArgs, pathResult.resolvedPath]);
      return NextResponse.json({ success: true });
    } catch (error) {
      log.error({ err: error }, `Failed to execute ${command}`);
      return handleRouteError(error);
    }
  };
}
