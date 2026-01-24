import { NextResponse } from 'next/server';
import { scanAllProjects } from '@/lib/scanner';
import { readConfig, getProjectMetadata } from '@/lib/config';
import { Project, ProjectStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as ProjectStatus | null;
  const search = searchParams.get('search')?.toLowerCase();

  try {
    let projects = await scanAllProjects();
    const config = await readConfig();

    // Apply custom metadata from config
    projects = await Promise.all(
      projects.map(async (project) => {
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
      })
    );

    // Filter by status
    if (status) {
      projects = projects.filter((p) => p.status === status);
    }

    // Filter by search term
    if (search) {
      projects = projects.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.description?.toLowerCase().includes(search) ||
          p.techStack.some((t) => t.toLowerCase().includes(search))
      );
    }

    // Get counts by status
    const allProjects = await scanAllProjects();
    const counts = {
      active: allProjects.filter((p) => {
        const meta = config.projects[p.slug];
        return (meta?.status || p.status) === 'active';
      }).length,
      icebox: allProjects.filter((p) => {
        const meta = config.projects[p.slug];
        return (meta?.status || p.status) === 'icebox';
      }).length,
      archived: allProjects.filter((p) => {
        const meta = config.projects[p.slug];
        return (meta?.status || p.status) === 'archived';
      }).length,
    };

    return NextResponse.json({
      projects,
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
