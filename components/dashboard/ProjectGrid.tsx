'use client';

import { useState, useMemo } from 'react';
import { Project, ProjectStatus } from '@/lib/types';
import { ProjectCard } from './ProjectCard';
import { SearchBar } from './SearchBar';
import { SkeletonGrid } from '@/components/layout/SkeletonCard';
import { FolderX } from 'lucide-react';
import { useProjectActions } from '@/lib/hooks/useProjectActions';
import { useProjects } from '@/lib/hooks/useProjects';

interface ProjectGridProps {
  status?: ProjectStatus;
  title?: string;
  showSearch?: boolean;
}

export function ProjectGrid({ status, title, showSearch = true }: ProjectGridProps) {
  const { projects: allProjects, loading, error, refresh } = useProjects();
  const [search, setSearch] = useState('');

  // Filter from shared dataset
  const projects = useMemo(() => {
    let filtered = allProjects;
    if (status) filtered = filtered.filter((p) => p.status === status);
    return filtered;
  }, [allProjects, status]);

  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects;
    const searchLower = search.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower) ||
        p.techStack.some((t) => t.toLowerCase().includes(searchLower))
    );
  }, [projects, search]);

  const { openInEditor, openInFinder, copyPath } = useProjectActions();

  const handleOpenInEditor = (project: Project) => openInEditor(project.path);
  const handleOpenInFinder = (project: Project) => openInFinder(project.path);
  const handleCopyPath = (project: Project) => copyPath(project.path);

  const handleToggleStar = async (project: Project) => {
    try {
      const response = await fetch(`/api/projects/${project.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: !project.starred }),
      });

      if (!response.ok) throw new Error('Failed to update project');
      refresh();
    } catch (err) {
      console.error('Failed to toggle star:', err);
    }
  };

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
                onToggleStar={handleToggleStar}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
