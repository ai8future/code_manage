'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight, LucideIcon, Loader2 } from 'lucide-react';
import { useSidebar } from './SidebarContext';
import { Project, ProjectStatus } from '@/lib/types';

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
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
  const isProjectActive = (slug: string) => pathname === `/project/${slug}`;

  useEffect(() => {
    if (expanded && !loaded) {
      setLoading(true);
      fetch(`/api/projects?status=${status}`)
        .then((res) => res.json())
        .then((data) => {
          const sorted = [...data.projects].sort((a: Project, b: Project) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
          );
          setProjects(sorted);
          setLoaded(true);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [expanded, loaded, status]);

  useEffect(() => {
    if (isActive && loaded) {
      fetch(`/api/projects?status=${status}`)
        .then((res) => res.json())
        .then((data) => {
          const sorted = [...data.projects].sort((a: Project, b: Project) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
          );
          setProjects(sorted);
        })
        .catch(() => {});
    }
  }, [isActive]);

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
              <Link
                key={project.slug}
                href={`/project/${project.slug}`}
                className={`
                  block px-3 py-1.5 text-sm rounded truncate
                  transition-colors duration-150
                  ${isProjectActive(project.slug)
                    ? 'bg-blue-500/10 text-blue-500 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }
                `}
                title={project.name}
              >
                {project.name}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
