import { NextResponse } from 'next/server';
import { scanAllProjects } from '@/lib/scanner';
import { getProjectMetadata, setProjectMetadata } from '@/lib/config';
import { createRouteLogger } from '@/lib/logger';
import { UpdateProjectSchema } from '@/lib/schemas';
import { parseBody } from '@/lib/api/validate';

const log = createRouteLogger('projects/[slug]');

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
        starred: metadata.starred || false,
      });
    }

    return NextResponse.json({ ...project, starred: false });
  } catch (error) {
    log.error({ err: error }, 'Error fetching project');
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
    const result = parseBody(UpdateProjectSchema, body);
    if (!result.success) return result.response;

    await setProjectMetadata(slug, result.data);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error({ err: error }, 'Error updating project');
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
}
