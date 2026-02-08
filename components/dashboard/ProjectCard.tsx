'use client';

import Link from 'next/link';
import { GitBranch, Clock, MoreVertical, ExternalLink, FolderOpen, Copy, Bug, Award, Star } from 'lucide-react';
import { Project } from '@/lib/types';
import { TechBadge } from './TechBadge';
import { useState, useRef, useCallback } from 'react';
import { useClickOutside } from '@/lib/hooks/useClickOutside';
import { getGradeColor, getGradeBgColor } from '@/lib/utils/grades';
import { formatRelativeDate } from '@/lib/utils/dates';

interface ProjectCardProps {
  project: Project;
  onOpenInEditor?: (project: Project) => void;
  onOpenInFinder?: (project: Project) => void;
  onCopyPath?: (project: Project) => void;
  onToggleStar?: (project: Project) => void;
}

export function ProjectCard({ project, onOpenInEditor, onOpenInFinder, onCopyPath, onToggleStar }: ProjectCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, useCallback(() => setShowMenu(false), []));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700/50 p-4 shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200 ease-out group">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <button
            onClick={(e) => {
              e.preventDefault();
              onToggleStar?.(project);
            }}
            className="flex-shrink-0 p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={project.starred ? 'Unstar project' : 'Star project'}
          >
            <Star
              size={16}
              className={project.starred
                ? 'text-yellow-500 fill-yellow-500'
                : 'text-gray-400 hover:text-yellow-500'
              }
            />
          </button>
          <Link
            href={`/project/${project.slug}`}
            className="flex-1 min-w-0 flex items-center gap-2"
          >
            <h3 className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-blue-500 transition-colors">
              {project.name}
            </h3>
          {project.suite && (
            <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
              {project.suite}
            </span>
          )}
          {project.bugs && project.bugs.openCount > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded" title={`${project.bugs.openCount} open bug${project.bugs.openCount > 1 ? 's' : ''}`}>
              <Bug size={12} />
              {project.bugs.openCount}
            </span>
          )}
          {project.rcodegen?.latestGrade != null && (
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded ${getGradeBgColor(project.rcodegen.latestGrade)} ${getGradeColor(project.rcodegen.latestGrade)}`}
              title={`Code quality grade: ${project.rcodegen.latestGrade}`}
            >
              <Award size={12} />
              {project.rcodegen.latestGrade}
            </span>
          )}
          </Link>
        </div>
        <div className="relative ml-2" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <MoreVertical size={16} className="text-gray-500" />
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700/50 py-1 z-10">
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
        {project.chassisVersion && (
          <span className="font-mono text-purple-600 dark:text-purple-400">chassis {project.chassisVersion}</span>
        )}
        {project.hasGit && project.gitBranch && (
          <span className="flex items-center gap-1">
            <GitBranch size={12} />
            {project.gitBranch}
          </span>
        )}
        <span className="flex items-center gap-1 ml-auto">
          <Clock size={12} />
          {formatRelativeDate(project.lastModified)}
        </span>
      </div>
    </div>
  );
}
