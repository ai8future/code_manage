'use client';

import { useState, useEffect } from 'react';
import { Project, ProjectStatus } from '@/lib/types';
import { ProjectCard } from './ProjectCard';
import { SearchBar } from './SearchBar';
import { SkeletonGrid } from '@/components/layout/SkeletonCard';
import { FolderX } from 'lucide-react';
import { useProjectActions } from '@/lib/hooks/useProjectActions';

interface ProjectGridProps {
  status?: ProjectStatus;
  title?: string;
  showSearch?: boolean;
}

interface ProjectsResponse {
  projects: Project[];
  counts: {
    active: number;
    crawlers: number;
    icebox: number;
    archived: number;
  };
}

export function ProjectGrid({ status, title, showSearch = true }: ProjectGridProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);

      const response = await fetch(`/api/projects?${params}`);
      if (!response.ok) throw new Error('Failed to fetch projects');

      const data: ProjectsResponse = await response.json();
      setProjects(data.projects);
      setFilteredProjects(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [status]);

  useEffect(() => {
    if (!search.trim()) {
      setFilteredProjects(projects);
      return;
    }

    const searchLower = search.toLowerCase();
    setFilteredProjects(
      projects.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.description?.toLowerCase().includes(searchLower) ||
          p.techStack.some((t) => t.toLowerCase().includes(searchLower))
      )
    );
  }, [search, projects]);

  const { openInEditor, openInFinder, copyPath } = useProjectActions();

  const handleOpenInEditor = (project: Project) => openInEditor(project.path);
  const handleOpenInFinder = (project: Project) => openInFinder(project.path);
  const handleCopyPath = (project: Project) => copyPath(project.path);

  if (loading) {
    return (
      <div>
        {(title || showSearch) && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
            {title && (
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {title}
              </h2>
            )}
            {showSearch && (
              <div className="sm:ml-auto w-full sm:w-72">
                <SearchBar value="" onChange={() => {}} />
              </div>
            )}
          </div>
        )}
        <SkeletonGrid count={8} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div>
      {(title || showSearch) && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          {title && (
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {title}
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({filteredProjects.length})
              </span>
            </h2>
          )}
          {showSearch && (
            <div className="sm:ml-auto w-full sm:w-72">
              <SearchBar value={search} onChange={setSearch} />
            </div>
          )}
        </div>
      )}

      {filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <FolderX size={64} className="mb-4 opacity-40" />
          <p className="text-lg font-medium mb-1">
            {search ? 'No projects match your search' : 'No projects found'}
          </p>
          <p className="text-sm text-gray-400">
            {search ? 'Try adjusting your search terms' : 'Projects will appear here when added'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProjects.map((project, index) => (
            <div
              key={project.slug}
              className="animate-fade-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <ProjectCard
                project={project}
                onOpenInEditor={handleOpenInEditor}
                onOpenInFinder={handleOpenInFinder}
                onCopyPath={handleCopyPath}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
