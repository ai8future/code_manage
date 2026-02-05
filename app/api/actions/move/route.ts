import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { ProjectStatus } from '@/lib/types';
import { setProjectMetadata } from '@/lib/config';
import { CODE_BASE_PATH, STATUS_FOLDERS } from '@/lib/constants';
import { isSuiteDirectory } from '@/lib/scanner';
import { createRouteLogger } from '@/lib/logger';
import { MoveProjectSchema } from '@/lib/schemas';
import { parseBody } from '@/lib/api/validate';
import { validatePath } from '@/lib/api/pathSecurity';

const log = createRouteLogger('actions/move');

/**
 * Detect the suite directory a project lives in, if any.
 * e.g. "/Users/cliff/Desktop/_code/builder_suite/code_manage" → "builder_suite"
 */
function detectSuiteFromPath(projectPath: string): string | null {
  const relativePath = path.relative(CODE_BASE_PATH, projectPath);
  const parts = relativePath.split(path.sep);
  // If path is suite_dir/project_name, the first part is the suite
  if (parts.length >= 2 && isSuiteDirectory(parts[0])) {
    return parts[0];
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = parseBody(MoveProjectSchema, body);
    if (!parsed.success) return parsed.response;
    const { slug, projectPath, newStatus } = parsed.data;

    const pathResult = await validatePath(projectPath);
    if (!pathResult.valid) {
      return NextResponse.json({ error: pathResult.error }, { status: pathResult.status });
    }
    const resolvedSourcePath = pathResult.resolvedPath;

    const projectName = path.basename(resolvedSourcePath);
    const suiteName = detectSuiteFromPath(resolvedSourcePath);

    // Determine target directory, preserving suite affiliation
    const statusFolder = STATUS_FOLDERS[newStatus as ProjectStatus];
    let targetDir: string;
    if (statusFolder) {
      // Moving to a status folder (icebox, archived, etc.)
      targetDir = path.join(CODE_BASE_PATH, statusFolder);
    } else if (suiteName) {
      // Moving back to "active" - return to the original suite
      targetDir = path.join(CODE_BASE_PATH, suiteName);
    } else {
      targetDir = CODE_BASE_PATH;
    }

    const targetPath = path.join(targetDir, projectName);

    // Ensure target directory exists
    if (statusFolder) {
      await fs.mkdir(targetDir, { recursive: true });
    }

    // Move the project - handle EEXIST atomically to avoid TOCTOU race
    try {
      // First check if target exists (for better error message)
      // but handle race condition in the rename error handler
      const targetExists = await fs.access(targetPath).then(() => true).catch(() => false);
      if (targetExists) {
        return NextResponse.json(
          { error: 'A project with this name already exists in the target location' },
          { status: 409 }
        );
      }
      await fs.rename(resolvedSourcePath, targetPath);
    } catch (renameError) {
      // Handle race condition: target was created between check and rename
      if ((renameError as NodeJS.ErrnoException).code === 'EEXIST' ||
          (renameError as NodeJS.ErrnoException).code === 'ENOTEMPTY') {
        return NextResponse.json(
          { error: 'A project with this name already exists in the target location' },
          { status: 409 }
        );
      }
      throw renameError;
    }

    // Update metadata
    await setProjectMetadata(slug, { status: newStatus as ProjectStatus });

    return NextResponse.json({
      success: true,
      newPath: targetPath,
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to move project');
    return NextResponse.json(
      { error: 'Failed to move project' },
      { status: 500 }
    );
  }
}
