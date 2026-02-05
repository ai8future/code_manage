'use client';

import { useState, useCallback } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Search, File, ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useDebouncedCallback } from 'use-debounce';
import type { SearchResponse } from '@/lib/activity-types';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults(null);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=100`);
      if (res.ok) {
        const data: SearchResponse = await res.json();
        setResults(data);
        // Auto-expand all projects
        setExpandedProjects(new Set(Object.keys(data.grouped)));
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedSearch = useDebouncedCallback(performSearch, 300);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    debouncedSearch(value);
  };

  const toggleProject = (project: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(project)) {
        next.delete(project);
      } else {
        next.add(project);
      }
      return next;
    });
  };

  const highlightMatch = (content: string, searchQuery: string) => {
    if (!searchQuery.trim()) return content;

    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = content.split(new RegExp(`(${escaped})`, 'gi'));

    return parts.map((part, i) => {
      // Case-insensitive comparison for highlighting
      const isMatch = part.toLowerCase() === searchQuery.toLowerCase();
      return isMatch ? (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 text-inherit rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      );
    });
  };

  return (
    <div className="p-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Search' },
        ]}
        title="Global Search"
      />

      {/* Search Input */}
      <div className="mb-6">
        <div className="relative">
          <Search
            size={20}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder="Search across all projects..."
            className="w-full pl-12 pr-4 py-3 text-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400"
            autoFocus
          />
          {loading && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {results.totalResults} result{results.totalResults !== 1 ? 's' : ''} for &ldquo;{results.query}&rdquo;
          </p>

          {Object.entries(results.grouped).length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No results found. Try a different search term.
            </div>
          ) : (
            Object.entries(results.grouped).map(([project, projectResults]) => (
              <div
                key={project}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                <button
                  onClick={() => toggleProject(project)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {expandedProjects.has(project) ? (
                      <ChevronDown size={18} className="text-gray-400" />
                    ) : (
                      <ChevronRight size={18} className="text-gray-400" />
                    )}
                    <Link
                      href={`/project/${projectResults[0]?.projectSlug || project.toLowerCase()}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {project}
                    </Link>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      ({projectResults.length} match{projectResults.length !== 1 ? 'es' : ''})
                    </span>
                  </div>
                </button>

                {expandedProjects.has(project) && (
                  <div className="border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50">
                    {projectResults.map((result, idx) => (
                      <div
                        key={`${result.file}-${result.line}-${idx}`}
                        className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <File size={14} className="text-gray-400" />
                          <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                            {result.file}
                          </span>
                          <span className="text-xs text-gray-400">:{result.line}</span>
                        </div>
                        <pre className="text-sm text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap break-all overflow-hidden bg-gray-50 dark:bg-gray-900/50 p-2 rounded">
                          {highlightMatch(result.content, query)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {!results && !loading && (
        <div className="text-center py-12 text-gray-500">
          Enter a search term to search across all project codebases.
        </div>
      )}
    </div>
  );
}
