import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { ProjectStatus } from '@/lib/types';
import { setProjectMetadata } from '@/lib/config';
import { CODE_BASE_PATH, STATUS_FOLDERS } from '@/lib/constants';

export async function POST(request: Request) {
  try {
    const { slug, projectPath, newStatus } = await request.json();

    if (!slug || !projectPath || !newStatus) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Security: Validate source path is within allowed directory
    const resolvedSourcePath = path.resolve(projectPath);
    if (!resolvedSourcePath.startsWith(CODE_BASE_PATH + '/')) {
      return NextResponse.json(
        { error: 'Invalid source path' },
        { status: 403 }
      );
    }

    // Validate newStatus is a valid status
    if (!Object.prototype.hasOwnProperty.call(STATUS_FOLDERS, newStatus)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    const projectName = path.basename(resolvedSourcePath);

    // Determine target directory
    const statusFolder = STATUS_FOLDERS[newStatus as ProjectStatus];
    const targetDir = statusFolder
      ? path.join(CODE_BASE_PATH, statusFolder)
      : CODE_BASE_PATH;

    const targetPath = path.join(targetDir, projectName);

    // Check if target already exists
    try {
      await fs.access(targetPath);
      return NextResponse.json(
        { error: 'A project with this name already exists in the target location' },
        { status: 409 }
      );
    } catch {
      // Target doesn't exist, good to proceed
    }

    // Ensure target directory exists
    if (statusFolder) {
      await fs.mkdir(targetDir, { recursive: true });
    }

    // Move the project
    await fs.rename(resolvedSourcePath, targetPath);

    // Update metadata
    await setProjectMetadata(slug, { status: newStatus as ProjectStatus });

    return NextResponse.json({
      success: true,
      newPath: targetPath,
    });
  } catch (error) {
    console.error('Failed to move project:', error);
    return NextResponse.json(
      { error: 'Failed to move project' },
      { status: 500 }
    );
  }
}
