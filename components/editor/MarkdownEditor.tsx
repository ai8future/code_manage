'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { X, Save, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import './markdown-editor.css';

// Dynamic import to avoid SSR issues with the editor
const MDEditor = dynamic(() => import('@uiw/react-md-editor'), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg">
      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
    </div>
  ),
});

interface FrontMatter {
  title?: string;
  description?: string;
  date?: string;
  [key: string]: string | undefined;
}

interface MarkdownEditorProps {
  projectPath: string;
  filename: string;
  onClose: () => void;
  onSave?: () => void;
}

export function MarkdownEditor({ projectPath, filename, onClose, onSave }: MarkdownEditorProps) {
  const [content, setContent] = useState<string>('');
  const [frontMatter, setFrontMatter] = useState<FrontMatter>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [showFrontMatter, setShowFrontMatter] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  // Load file content
  useEffect(() => {
    let cancelled = false;

    const loadFile = async () => {
      try {
        const response = await fetch(
          `/api/projects/docs/${encodeURIComponent(filename)}?path=${encodeURIComponent(projectPath)}`
        );
        const data = await response.json();

        // Avoid state updates if component unmounted
        if (cancelled) return;

        if (data.detail && !data.isNew) {
          setError(data.detail);
          return;
        }

        setContent(data.content || '');
        setFrontMatter(data.frontMatter || {});
        setIsNew(data.isNew || false);

        // For new AGENTS.md files, provide a template
        if (data.isNew && filename === 'AGENTS.md') {
          setContent(`# Agent Instructions

## Overview
Brief description of this project for AI assistants.

## Key Files
- \`src/\` - Source code
- \`tests/\` - Test files

## Coding Standards
- Follow existing patterns
- Write tests for new features

## Common Tasks
- **Build**: \`npm run build\`
- **Test**: \`npm test\`
`);
          setFrontMatter({
            title: 'Agent Instructions',
            description: 'Instructions for AI assistants working on this project',
          });
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load file');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadFile();

    return () => {
      cancelled = true;
    };
  }, [projectPath, filename]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/projects/docs/${encodeURIComponent(filename)}?path=${encodeURIComponent(projectPath)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frontMatter, content }),
        }
      );

      const data = await response.json();

      if (!response.ok || data.detail) {
        throw new Error(data.detail || 'Failed to save');
      }

      setHasChanges(false);
      setIsNew(false);
      onSave?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const updateFrontMatter = (key: string, value: string) => {
    setFrontMatter(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleContentChange = (value?: string) => {
    setContent(value || '');
    setHasChanges(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700/50 w-[80%] h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        data-color-mode="light"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white ml-2">
              {isNew ? 'Create' : 'Edit'}: <span className="text-indigo-600 dark:text-indigo-400">{filename}</span>
            </h3>
            {hasChanges && (
              <span className="px-2.5 py-1 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                Unsaved changes
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              Save
            </button>
            <button
              onClick={onClose}
              className="p-2.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <X size={18} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Front-matter form (collapsible) */}
            <div className="border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-gray-800 dark:to-gray-750">
              <button
                onClick={() => setShowFrontMatter(!showFrontMatter)}
                className="flex items-center gap-2 w-full px-5 py-3 text-sm font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-white/50 dark:hover:bg-gray-700/50 transition-colors"
              >
                {showFrontMatter ? <ChevronDown size={16} className="text-indigo-500" /> : <ChevronRight size={16} className="text-indigo-500" />}
                Front Matter
              </button>
              {showFrontMatter && (
                <div className="px-5 pb-4 grid grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1.5 uppercase tracking-wide">
                      Title
                    </label>
                    <input
                      type="text"
                      value={frontMatter.title || ''}
                      onChange={e => updateFrontMatter('title', e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      placeholder="Document title"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-purple-600 dark:text-purple-400 mb-1.5 uppercase tracking-wide">
                      Description
                    </label>
                    <input
                      type="text"
                      value={frontMatter.description || ''}
                      onChange={e => updateFrontMatter('description', e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                      placeholder="Brief description"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-pink-600 dark:text-pink-400 mb-1.5 uppercase tracking-wide">
                      Date
                    </label>
                    <input
                      type="date"
                      value={frontMatter.date || ''}
                      onChange={e => updateFrontMatter('date', e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 transition-all"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Markdown editor */}
            <div className="flex-1 overflow-hidden p-4 bg-gray-50 dark:bg-gray-900">
              <MDEditor
                value={content}
                onChange={handleContentChange}
                height="100%"
                preview="live"
                hideToolbar={false}
                enableScroll={true}
                toolbarHeight={56}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
