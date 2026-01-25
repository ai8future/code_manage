'use client';

import { useState, useEffect } from 'react';
import { Bug, CheckCircle, ChevronDown, ChevronRight, ExternalLink, X, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { BugInfo, BugReport } from '@/lib/types';

interface BugsCardProps {
  bugs: BugInfo;
  projectPath: string;
}

interface BugModalProps {
  bug: BugReport;
  projectPath: string;
  onClose: () => void;
  onOpenInEditor: () => void;
}

function BugModal({ bug, projectPath, onClose, onOpenInEditor }: BugModalProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const folder = bug.status === 'open' ? '_bugs_open' : '_bugs_fixed';
    const filePath = `${projectPath}/${folder}/${bug.filename}`;

    fetch(`/api/file?path=${encodeURIComponent(filePath)}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setContent(data.content);
        }
      })
      .catch(() => setError('Failed to load file'))
      .finally(() => setLoading(false));
  }, [bug, projectPath]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Bug size={18} className={bug.status === 'open' ? 'text-red-500' : 'text-green-500'} />
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
              {bug.title}
            </h3>
            {bug.date && (
              <span className="text-xs text-gray-500 ml-2">{bug.date}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenInEditor}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Open in VS Code"
            >
              <ExternalLink size={16} className="text-gray-500" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X size={16} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          )}
          {error && (
            <div className="text-red-500 text-center py-12">{error}</div>
          )}
          {content && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                components={{
                  code: ({ className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !match && !className;

                    if (isInline) {
                      return (
                        <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono text-pink-600 dark:text-pink-400">
                          {children}
                        </code>
                      );
                    }

                    const language = match ? match[1] : 'text';
                    return (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={language}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          borderRadius: '0.5rem',
                          fontSize: '0.875rem',
                        }}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    );
                  },
                  pre: ({ children }) => <div className="mb-4 overflow-hidden rounded-lg">{children}</div>,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function BugsCard({ bugs, projectPath }: BugsCardProps) {
  const [showOpen, setShowOpen] = useState(true);
  const [showFixed, setShowFixed] = useState(false);
  const [selectedBug, setSelectedBug] = useState<BugReport | null>(null);

  const openBugs = bugs.bugs.filter(b => b.status === 'open');
  const fixedBugs = bugs.bugs.filter(b => b.status === 'fixed');

  const handleOpenInEditor = async (bug: BugReport) => {
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
    <>
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
                  <BugItem key={bug.filename} bug={bug} onOpen={() => setSelectedBug(bug)} />
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
                  <BugItem key={bug.filename} bug={bug} onOpen={() => setSelectedBug(bug)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bug Modal */}
      {selectedBug && (
        <BugModal
          bug={selectedBug}
          projectPath={projectPath}
          onClose={() => setSelectedBug(null)}
          onOpenInEditor={() => {
            handleOpenInEditor(selectedBug);
            setSelectedBug(null);
          }}
        />
      )}
    </>
  );
}

function BugItem({ bug, onOpen }: { bug: BugReport; onOpen: () => void }) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer group"
      onClick={onOpen}
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
