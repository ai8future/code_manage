import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { ProjectStatus } from '@/lib/types';
import { setProjectMetadata } from '@/lib/config';

const CODE_BASE_PATH = '/Users/cliff/Desktop/_code';

const STATUS_FOLDERS: Record<ProjectStatus, string | null> = {
  active: null, // Root level
  icebox: '_icebox',
  archived: '_old',
};

export async function POST(request: Request) {
  try {
    const { slug, projectPath, newStatus } = await request.json();

    if (!slug || !projectPath || !newStatus) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const projectName = path.basename(projectPath);

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
    await fs.rename(projectPath, targetPath);

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
