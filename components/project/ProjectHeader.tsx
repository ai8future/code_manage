'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Terminal, Bot } from 'lucide-react';
import { Project } from '@/lib/types';
import { ActionsMenu } from '@/components/actions/ActionsMenu';
import { MarkdownEditor } from '@/components/editor/MarkdownEditor';

interface ProjectHeaderProps {
  project: Project;
  onOpenTerminal?: () => void;
  onRefresh?: () => void;
}

export function ProjectHeader({ project, onOpenTerminal, onRefresh }: ProjectHeaderProps) {
  const router = useRouter();
  const [showAgentsEditor, setShowAgentsEditor] = useState(false);

  return (
    <>
    <div className="flex items-center gap-4 mb-6">
      <button
        onClick={() => router.back()}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <ArrowLeft size={20} className="text-gray-600 dark:text-gray-400" />
      </button>

      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">
          {project.name}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate font-mono">
          {project.path}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {/* Status badge */}
        <span className={`
          px-2 py-1 rounded text-xs font-medium capitalize
          ${project.status === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : ''}
          ${project.status === 'icebox' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : ''}
          ${project.status === 'archived' ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' : ''}
        `}>
          {project.status}
        </span>

        <button
          onClick={() => setShowAgentsEditor(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Edit AGENTS.md"
        >
          <Bot size={16} />
          <span className="hidden sm:inline text-sm">AGENTS.md</span>
        </button>

        {onOpenTerminal && (
          <button
            onClick={onOpenTerminal}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
          >
            <Terminal size={16} />
            <span className="hidden sm:inline">Terminal</span>
          </button>
        )}

        <ActionsMenu project={project} onRefresh={onRefresh} />
      </div>
    </div>

    {/* AGENTS.md Editor Modal */}
    {showAgentsEditor && (
      <MarkdownEditor
        projectPath={project.path}
        filename="AGENTS.md"
        onClose={() => setShowAgentsEditor(false)}
        onSave={() => setShowAgentsEditor(false)}
      />
    )}
    </>
  );
}
