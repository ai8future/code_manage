import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { CODE_BASE_PATH, STATUS_FOLDERS } from '@/lib/constants';
import { API_LIMITS } from '@/lib/activity-types';
import { createRequestLogger } from '@/lib/logger';
import { CreateProjectSchema } from '@/lib/schemas';
import { parseSecureBody } from '@/lib/api/validate';
import { validationError, conflictError, internalError } from '@/lib/chassis/errors';
import { errorResponse, handleRouteError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const log = createRequestLogger('projects/create', request);

  try {
    const rawBody = await request.text();
    const parsed = parseSecureBody(CreateProjectSchema, rawBody);
    if (!parsed.success) return parsed.response;
    const { name, description, category } = parsed.data;

    // Validate name length (filesystem limit ~255, but keep reasonable)
    if (name.length > API_LIMITS.PROJECT_NAME_MAX_LENGTH) {
      return errorResponse(
        validationError(`Project name must be ${API_LIMITS.PROJECT_NAME_MAX_LENGTH} characters or less`)
      );
    }

    // Limit description length
    if (description.length > API_LIMITS.PROJECT_DESCRIPTION_MAX_LENGTH) {
      return errorResponse(
        validationError(`Description must be ${API_LIMITS.PROJECT_DESCRIPTION_MAX_LENGTH} characters or less`)
      );
    }

    // Determine target directory
    const statusFolder = STATUS_FOLDERS[category];
    const targetDir = statusFolder
      ? path.join(CODE_BASE_PATH, statusFolder, name)
      : path.join(CODE_BASE_PATH, name);

    // Check if directory already exists
    try {
      await fs.access(targetDir);
      return errorResponse(
        conflictError('A project with this name already exists in this category')
      );
    } catch {
      // Directory doesn't exist, which is what we want
    }

    // Create the directory
    await fs.mkdir(targetDir, { recursive: true });

    // Run ralph CLI with the description using spawn (no shell injection possible)
    try {
      const output = await new Promise<string>((resolve, reject) => {
        // Use spawn with array args - no shell interpretation
        const ralph = spawn('ralph', [description], {
          cwd: targetDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin`,
          },
        });

        let stdout = '';
        let stderr = '';
        const timeout = setTimeout(() => {
          ralph.kill();
          reject(new Error('Project generation timed out after 5 minutes'));
        }, 300000);

        ralph.stdout.on('data', (data) => {
          stdout += data.toString();
          if (stdout.length > 10 * 1024 * 1024) {
            ralph.kill();
            reject(new Error('Output too large'));
          }
        });

        ralph.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        ralph.on('close', (code) => {
          clearTimeout(timeout);
          if (code === 0) {
            resolve(stdout + (stderr ? `\n${stderr}` : ''));
          } else {
            reject(new Error(`ralph exited with code ${code}: ${stderr || stdout}`));
          }
        });

        ralph.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      return NextResponse.json({
        success: true,
        path: targetDir,
        output: output.slice(0, 2000),
      });
    } catch (error) {
      // If ralph fails, clean up the directory
      try {
        await fs.rm(targetDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }

      const errorMessage = error instanceof Error ? error.message : 'ralph command failed';

      // Check if ralph is not installed
      if (errorMessage.includes('ENOENT') || errorMessage.includes('spawn ralph')) {
        return errorResponse(
          internalError('ralph CLI is not installed or not in PATH')
        );
      }

      return errorResponse(
        internalError(`Project generation failed: ${errorMessage.slice(0, 500)}`)
      );
    }
  } catch (error) {
    log.error({ err: error }, 'Error creating project');
    return handleRouteError(error);
  }
}
