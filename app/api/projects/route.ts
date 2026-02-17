import { NextResponse } from 'next/server';
import { getCachedProjects } from '@/lib/scan-cache';
import { readConfig } from '@/lib/config';
import { Project, ProjectStatus } from '@/lib/types';
import { createTrackedRequestLogger } from '@/lib/logger';
import { ProjectStatusSchema } from '@/lib/schemas';
import { validationError } from '@/lib/chassis/errors';
import { errorResponse, handleRouteError } from '@/lib/api/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { log, done } = createTrackedRequestLogger('projects', request);
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status');
  const search = searchParams.get('search')?.toLowerCase();

  // Validate status parameter using Zod
  let status: ProjectStatus | null = null;
  if (statusParam) {
    const parsed = ProjectStatusSchema.safeParse(statusParam);
    if (!parsed.success) {
      done();
      return errorResponse(
        validationError(`Invalid status. Must be one of: ${ProjectStatusSchema.options.join(', ')}`)
      );
    }
    status = parsed.data;
  }

  try {
    // Uses cached + coalesced scan to avoid redundant concurrent scans
    const allProjects = await getCachedProjects();
    const config = await readConfig();

    // Apply custom metadata from config to all projects
    const projectsWithMetadata: Project[] = allProjects.map((project) => {
      const metadata = config.projects[project.slug];
      if (metadata) {
        return {
          ...project,
          status: metadata.status || project.status,
          name: metadata.customName || project.name,
          description: metadata.customDescription || project.description,
          starred: metadata.starred || false,
        };
      }
      return { ...project, starred: false };
    });

    // Calculate counts from the already-processed list
    const counts = {
      active: projectsWithMetadata.filter((p) => p.status === 'active').length,
      crawlers: projectsWithMetadata.filter((p) => p.status === 'crawlers').length,
      research: projectsWithMetadata.filter((p) => p.status === 'research').length,
      tools: projectsWithMetadata.filter((p) => p.status === 'tools').length,
      icebox: projectsWithMetadata.filter((p) => p.status === 'icebox').length,
      archived: projectsWithMetadata.filter((p) => p.status === 'archived').length,
    };

    // Filter by status
    let filteredProjects = projectsWithMetadata;
    if (status) {
      filteredProjects = filteredProjects.filter((p) => p.status === status);
    }

    // Filter by search term
    if (search) {
      filteredProjects = filteredProjects.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.description?.toLowerCase().includes(search) ||
          p.techStack.some((t) => t.toLowerCase().includes(search))
      );
    }

    // Sort: starred first, then by name
    filteredProjects.sort((a, b) => {
      if (a.starred && !b.starred) return -1;
      if (!a.starred && b.starred) return 1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    done();
    return NextResponse.json({
      projects: filteredProjects,
      counts,
    });
  } catch (error) {
    done();
    log.error({ err: error }, 'Error scanning projects');
    return handleRouteError(error);
  }
}
