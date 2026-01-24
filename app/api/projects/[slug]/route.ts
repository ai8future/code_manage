import { NextResponse } from 'next/server';
import { scanAllProjects, scanProject } from '@/lib/scanner';
import { getProjectMetadata, setProjectMetadata } from '@/lib/config';
import { ProjectMetadata } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const projects = await scanAllProjects();
    const project = projects.find((p) => p.slug === slug);

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Apply custom metadata
    const metadata = await getProjectMetadata(slug);
    if (metadata) {
      return NextResponse.json({
        ...project,
        status: metadata.status || project.status,
        name: metadata.customName || project.name,
        description: metadata.customDescription || project.description,
        tags: metadata.tags,
        notes: metadata.notes,
      });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const body = await request.json();
    const metadata: Partial<ProjectMetadata> = {};

    if (body.status) metadata.status = body.status;
    if (body.customName !== undefined) metadata.customName = body.customName;
    if (body.customDescription !== undefined) metadata.customDescription = body.customDescription;
    if (body.tags !== undefined) metadata.tags = body.tags;
    if (body.notes !== undefined) metadata.notes = body.notes;

    await setProjectMetadata(slug, metadata);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
}
