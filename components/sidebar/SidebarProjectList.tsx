'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight, LucideIcon, Loader2, Star } from 'lucide-react';
import { useSidebar } from './SidebarContext';
import { Project, ProjectStatus } from '@/lib/types';
import { useProjects } from '@/lib/hooks/useProjects';

interface SidebarProjectListProps {
  href: string;
  icon: LucideIcon;
  label: string;
  status: ProjectStatus;
  badge?: number;
  expanded: boolean;
  onToggle: () => void;
}

export function SidebarProjectList({
  href,
  icon: Icon,
  label,
  status,
  badge,
  expanded,
  onToggle
}: SidebarProjectListProps) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const { projects: allProjects, loading, refresh } = useProjects();

  // Filter from shared dataset — no separate fetch needed
  const projects = useMemo(() =>
    allProjects.filter((p) => p.status === status),
    [allProjects, status]
  );

  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
  const isProjectActive = (slug: string) => pathname === `/project/${slug}`;

  const handleToggleStar = async (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const response = await fetch(`/api/projects/${project.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: !project.starred }),
      });
      if (response.ok) {
        refresh();
      }
    } catch {
      // Silently fail
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    if (collapsed) return;
    e.preventDefault();
    onToggle();
  };

  if (collapsed) {
    return (
      <Link
        href={href}
        className={`
          flex items-center justify-center px-3 py-2.5 rounded-lg
          transition-colors duration-150
          ${isActive
            ? 'bg-blue-500/10 text-blue-500'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }
        `}
        title={label}
      >
        <Icon size={20} className="flex-shrink-0" />
      </Link>
    );
  }

  return (
    <div className={`flex flex-col min-h-0 ${expanded ? 'flex-1' : 'flex-shrink-0'}`}>
      <div
        className={`
          flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer flex-shrink-0
          transition-colors duration-150
          ${isActive
            ? 'bg-blue-500/10 text-blue-500'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }
        `}
        onClick={handleToggle}
      >
        <button
          onClick={handleToggle}
          className="flex-shrink-0 p-0.5 -ml-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          {expanded ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </button>
        <Icon size={20} className="flex-shrink-0" />
        <Link href={href} className="flex-1 font-medium truncate hover:underline">
          {label}
        </Link>
        {badge !== undefined && badge > 0 && (
          <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 rounded-full">
            {badge}
          </span>
        )}
      </div>

      {expanded && (
        <div className="ml-6 mt-1 space-y-0.5 overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
              <Loader2 size={12} className="animate-spin" />
              Loading...
            </div>
          ) : projects.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-500">
              No projects
            </div>
          ) : (
            projects.map((project) => (
              <div
                key={project.slug}
                className={`
                  flex items-center gap-1 px-3 py-1.5 text-sm rounded
                  transition-colors duration-150
                  ${isProjectActive(project.slug)
                    ? 'bg-blue-500/10 text-blue-500 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }
                `}
              >
                <button
                  onClick={(e) => handleToggleStar(e, project)}
                  className="flex-shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  title={project.starred ? 'Unstar' : 'Star'}
                >
                  <Star
                    size={12}
                    className={project.starred
                      ? 'text-yellow-500 fill-yellow-500'
                      : 'text-gray-400 hover:text-yellow-500'
                    }
                  />
                </button>
                <Link
                  href={`/project/${project.slug}`}
                  className={`flex-1 truncate hover:underline ${project.starred ? 'font-semibold' : ''}`}
                  title={project.suite ? `${project.name} (${project.suite})` : project.name}
                >
                  {project.name}
                  {project.suite && (
                    <span className="ml-1 text-[10px] text-gray-400 dark:text-gray-500 font-normal">
                      {project.suite}
                    </span>
                  )}
                </Link>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
