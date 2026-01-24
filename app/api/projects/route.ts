import { NextResponse } from 'next/server';
import { scanAllProjects } from '@/lib/scanner';
import { readConfig } from '@/lib/config';
import { Project, ProjectStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: ProjectStatus[] = ['active', 'crawlers', 'icebox', 'archived'];

function isValidStatus(status: string): status is ProjectStatus {
  return VALID_STATUSES.includes(status as ProjectStatus);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status');
  const search = searchParams.get('search')?.toLowerCase();

  // Validate status parameter
  const status: ProjectStatus | null = statusParam && isValidStatus(statusParam) ? statusParam : null;
  if (statusParam && !status) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    );
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
        };
      }
      return project;
    });

    // Calculate counts from the already-processed list
    const counts = {
      active: projectsWithMetadata.filter((p) => p.status === 'active').length,
      crawlers: projectsWithMetadata.filter((p) => p.status === 'crawlers').length,
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

    return NextResponse.json({
      projects: filteredProjects,
      counts,
    });
  } catch (error) {
    console.error('Error scanning projects:', error);
    return NextResponse.json(
      { error: 'Failed to scan projects' },
      { status: 500 }
    );
  }
}
