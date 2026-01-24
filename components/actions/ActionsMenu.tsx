'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  MoreVertical,
  ExternalLink,
  FolderOpen,
  Copy,
  Snowflake,
  Archive,
  FolderInput,
} from 'lucide-react';
import { Project, ProjectStatus } from '@/lib/types';

interface ActionsMenuProps {
  project: Project;
  onRefresh?: () => void;
}

export function ActionsMenu({ project, onRefresh }: ActionsMenuProps) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [moving, setMoving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenInEditor = async () => {
    try {
      await fetch('/api/actions/open-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: project.path }),
      });
    } catch (err) {
      console.error('Failed to open in editor:', err);
    }
    setShowMenu(false);
  };

  const handleOpenInFinder = async () => {
    try {
      await fetch('/api/actions/open-finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: project.path }),
      });
    } catch (err) {
      console.error('Failed to open in Finder:', err);
    }
    setShowMenu(false);
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(project.path);
    setShowMenu(false);
  };

  const handleMoveToStatus = async (newStatus: ProjectStatus) => {
    if (project.status === newStatus) {
      setShowMenu(false);
      return;
    }

    setMoving(true);
    try {
      const response = await fetch('/api/actions/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: project.slug,
          projectPath: project.path,
          newStatus,
        }),
      });

      if (response.ok) {
        onRefresh?.();
        router.push(`/${newStatus}`);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to move project');
      }
    } catch (err) {
      console.error('Failed to move project:', err);
      alert('Failed to move project');
    } finally {
      setMoving(false);
      setShowMenu(false);
    }
  };

  const statusOptions: { status: ProjectStatus; label: string; icon: typeof FolderOpen }[] = [
    { status: 'active', label: 'Active', icon: FolderInput },
    { status: 'icebox', label: 'Icebox', icon: Snowflake },
    { status: 'archived', label: 'Archive', icon: Archive },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        disabled={moving}
      >
        <MoreVertical size={20} className="text-gray-600 dark:text-gray-400" />
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10">
          <button
            onClick={handleOpenInEditor}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <ExternalLink size={14} />
            Open in VS Code
          </button>
          <button
            onClick={handleOpenInFinder}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <FolderOpen size={14} />
            Open in Finder
          </button>
          <button
            onClick={handleCopyPath}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <Copy size={14} />
            Copy Path
          </button>

          <div className="my-1 border-t border-gray-200 dark:border-gray-700" />

          <div className="px-4 py-1 text-xs text-gray-500 uppercase tracking-wider">
            Move to
          </div>

          {statusOptions.map(({ status, label, icon: Icon }) => (
            <button
              key={status}
              onClick={() => handleMoveToStatus(status)}
              disabled={project.status === status || moving}
              className={`
                w-full px-4 py-2 text-left text-sm flex items-center gap-2
                ${
                  project.status === status
                    ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }
              `}
            >
              <Icon size={14} />
              {label}
              {project.status === status && (
                <span className="ml-auto text-xs text-gray-400">(current)</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
