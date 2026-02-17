import { NextResponse } from 'next/server';
import { getCachedProjects, invalidateProjectCache } from '@/lib/scan-cache';
import { getProjectMetadata, setProjectMetadata } from '@/lib/config';
import { createRequestLogger } from '@/lib/logger';
import { UpdateProjectSchema } from '@/lib/schemas';
import { parseSecureBody } from '@/lib/api/validate';
import { notFoundError } from '@/lib/chassis/errors';
import { errorResponse, handleRouteError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const log = createRequestLogger('projects/[slug]', request);
  const { slug } = await params;

  try {
    const projects = await getCachedProjects();
    const project = projects.find((p) => p.slug === slug);

    if (!project) {
      return errorResponse(notFoundError('Project not found'));
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
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const log = createRequestLogger('projects/[slug]', request);
  const { slug } = await params;

  try {
    const rawBody = await request.text();
    const result = parseSecureBody(UpdateProjectSchema, rawBody);
    if (!result.success) return result.response;

    await setProjectMetadata(slug, result.data);
    invalidateProjectCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error({ err: error }, 'Error updating project');
    return handleRouteError(error);
  }
}
