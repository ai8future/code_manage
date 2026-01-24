'use client';

import Link from 'next/link';
import { GitBranch, Clock, MoreVertical, ExternalLink, FolderOpen, Copy, Bug, Award } from 'lucide-react';
import { Project } from '@/lib/types';
import { TechBadge } from './TechBadge';
import { useState, useRef, useEffect } from 'react';

interface ProjectCardProps {
  project: Project;
  onOpenInEditor?: (project: Project) => void;
  onOpenInFinder?: (project: Project) => void;
  onCopyPath?: (project: Project) => void;
}

export function ProjectCard({ project, onOpenInEditor, onOpenInFinder, onCopyPath }: ProjectCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors group">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <Link
          href={`/project/${project.slug}`}
          className="flex-1 min-w-0 flex items-center gap-2"
        >
          <h3 className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-blue-500 transition-colors">
            {project.name}
          </h3>
          {project.bugs && project.bugs.openCount > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded" title={`${project.bugs.openCount} open bug${project.bugs.openCount > 1 ? 's' : ''}`}>
              <Bug size={12} />
              {project.bugs.openCount}
            </span>
          )}
          {project.rcodegen?.latestGrade != null && (
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded ${
                project.rcodegen.latestGrade >= 80
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : project.rcodegen.latestGrade >= 60
                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              }`}
              title={`Code quality grade: ${project.rcodegen.latestGrade}`}
            >
              <Award size={12} />
              {project.rcodegen.latestGrade}
            </span>
          )}
        </Link>
        <div className="relative ml-2" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <MoreVertical size={16} className="text-gray-500" />
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10">
              <button
                onClick={() => {
                  onOpenInEditor?.(project);
                  setShowMenu(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <ExternalLink size={14} />
                Open in VS Code
              </button>
              <button
                onClick={() => {
                  onOpenInFinder?.(project);
                  setShowMenu(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <FolderOpen size={14} />
                Open in Finder
              </button>
              <button
                onClick={() => {
                  onCopyPath?.(project);
                  setShowMenu(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <Copy size={14} />
                Copy Path
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
          {project.description}
        </p>
      )}

      {/* Tech Stack */}
      {project.techStack.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {project.techStack.slice(0, 4).map((tech) => (
            <TechBadge key={tech} tech={tech} />
          ))}
          {project.techStack.length > 4 && (
            <span className="text-xs text-gray-500">+{project.techStack.length - 4}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
        {project.version && (
          <span className="font-mono">v{project.version}</span>
        )}
        {project.hasGit && project.gitBranch && (
          <span className="flex items-center gap-1">
            <GitBranch size={12} />
            {project.gitBranch}
          </span>
        )}
        <span className="flex items-center gap-1 ml-auto">
          <Clock size={12} />
          {formatDate(project.lastModified)}
        </span>
      </div>
    </div>
  );
}
