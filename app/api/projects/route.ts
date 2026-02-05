import { NextResponse } from 'next/server';
import { scanAllProjects } from '@/lib/scanner';
import { readConfig } from '@/lib/config';
import { Project, ProjectStatus } from '@/lib/types';
import { createRouteLogger } from '@/lib/logger';
import { ProjectStatusSchema } from '@/lib/schemas';

const log = createRouteLogger('projects');

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status');
  const search = searchParams.get('search')?.toLowerCase();

  // Validate status parameter using Zod
  let status: ProjectStatus | null = null;
  if (statusParam) {
    const parsed = ProjectStatusSchema.safeParse(statusParam);
    if (!parsed.success) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${ProjectStatusSchema.options.join(', ')}` },
        { status: 400 }
      );
    }
    status = parsed.data;
  }

  try {
    // Single scan - reuse for both filtering and counts
    const allProjects = await scanAllProjects();
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

    return NextResponse.json({
      projects: filteredProjects,
      counts,
    });
  } catch (error) {
    log.error({ err: error }, 'Error scanning projects');
    return NextResponse.json(
      { error: 'Failed to scan projects' },
      { status: 500 }
    );
  }
}
