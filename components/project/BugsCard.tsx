'use client';

import { useState } from 'react';
import { Bug, CheckCircle, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { BugInfo, BugReport } from '@/lib/types';

interface BugsCardProps {
  bugs: BugInfo;
  projectPath: string;
}

export function BugsCard({ bugs, projectPath }: BugsCardProps) {
  const [showOpen, setShowOpen] = useState(true);
  const [showFixed, setShowFixed] = useState(false);

  const openBugs = bugs.bugs.filter(b => b.status === 'open');
  const fixedBugs = bugs.bugs.filter(b => b.status === 'fixed');

  const handleOpenBugFile = async (bug: BugReport) => {
    const folder = bug.status === 'open' ? '_bugs_open' : '_bugs_fixed';
    const filePath = `${projectPath}/${folder}/${bug.filename}`;

    try {
      await fetch('/api/actions/open-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
    } catch (err) {
      console.error('Failed to open bug file:', err);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Bug size={18} className="text-red-500" />
        <h3 className="font-semibold text-gray-900 dark:text-white">Bug Tracking</h3>
        <div className="flex items-center gap-2 ml-auto">
          {bugs.openCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
              {bugs.openCount} open
            </span>
          )}
          {bugs.fixedCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
              {bugs.fixedCount} fixed
            </span>
          )}
        </div>
      </div>

      {/* Open Bugs */}
      {openBugs.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setShowOpen(!showOpen)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white w-full"
          >
            {showOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Bug size={14} className="text-red-500" />
            Open ({openBugs.length})
          </button>
          {showOpen && (
            <div className="mt-2 space-y-1 ml-6">
              {openBugs.map((bug) => (
                <BugItem key={bug.filename} bug={bug} onOpen={handleOpenBugFile} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fixed Bugs */}
      {fixedBugs.length > 0 && (
        <div>
          <button
            onClick={() => setShowFixed(!showFixed)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white w-full"
          >
            {showFixed ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <CheckCircle size={14} className="text-green-500" />
            Fixed ({fixedBugs.length})
          </button>
          {showFixed && (
            <div className="mt-2 space-y-1 ml-6">
              {fixedBugs.map((bug) => (
                <BugItem key={bug.filename} bug={bug} onOpen={handleOpenBugFile} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BugItem({ bug, onOpen }: { bug: BugReport; onOpen: (bug: BugReport) => void }) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer group"
      onClick={() => onOpen(bug)}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 dark:text-white truncate">
          {bug.title}
        </p>
        {bug.date && (
          <p className="text-xs text-gray-500">{bug.date}</p>
        )}
      </div>
      <ExternalLink size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </div>
  );
}
