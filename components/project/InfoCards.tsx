'use client';

import { Code2, GitBranch, Package } from 'lucide-react';
import { Project } from '@/lib/types';
import { TechBadge } from '@/components/dashboard/TechBadge';

interface InfoCardsProps {
  project: Project;
}

export function InfoCards({ project }: InfoCardsProps) {
  const hasTechStack = project.techStack.length > 0;
  const hasGit = project.hasGit;
  const hasDependencies = project.dependencies && Object.keys(project.dependencies).length > 0;

  // Don't render anything if no cards would be shown
  if (!hasTechStack && !hasGit && !hasDependencies) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-4 mb-6">
      {/* Tech Stack Card */}
      {hasTechStack && (
        <div className="flex-1 min-w-[280px] bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700/50 border-l-4 border-l-blue-500 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Code2 size={18} className="text-blue-500" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Tech Stack</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {project.techStack.map((tech) => (
              <TechBadge key={tech} tech={tech} />
            ))}
          </div>
          {project.chassisVersion && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 flex items-center gap-2">
              <span className="text-sm text-gray-500">Chassis:</span>
              <span className="text-sm font-mono text-purple-600 dark:text-purple-400">{project.chassisVersion}</span>
            </div>
          )}
        </div>
      )}

      {/* Git Info Card */}
      {hasGit && (
        <div className="flex-1 min-w-[280px] bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700/50 border-l-4 border-l-orange-500 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <GitBranch size={18} className="text-green-500" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Git Status</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Branch:</span>
              <span className="text-sm font-mono text-gray-900 dark:text-white">
                {project.gitBranch || 'unknown'}
              </span>
            </div>
            {project.gitRemote && (
              <div className="text-xs text-gray-500 truncate" title={project.gitRemote}>
                {project.gitRemote}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dependencies Card */}
      {hasDependencies && (
        <div className="flex-1 min-w-[280px] bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700/50 border-l-4 border-l-green-500 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Package size={18} className="text-purple-500" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Dependencies</h3>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {Object.entries(project.dependencies!).slice(0, 10).map(([name, version]) => (
              <div key={name} className="flex items-center justify-between text-sm">
                <span className="truncate text-gray-900 dark:text-white">{name}</span>
                <span className="text-gray-500 font-mono text-xs ml-2">{version}</span>
              </div>
            ))}
            {Object.keys(project.dependencies!).length > 10 && (
              <p className="text-xs text-gray-500">
                +{Object.keys(project.dependencies!).length - 10} more
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
