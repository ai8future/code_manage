'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { ProjectStatus } from '@/lib/types';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (projectPath: string) => void;
}

type CategoryOption = Extract<ProjectStatus, 'active' | 'tools' | 'research' | 'crawlers'>;

const CATEGORY_OPTIONS: { value: CategoryOption; label: string; description: string }[] = [
  { value: 'active', label: 'Active', description: 'Main active project' },
  { value: 'tools', label: 'Tools', description: 'Developer tools and utilities' },
  { value: 'research', label: 'Research', description: 'Research and demo projects' },
  { value: 'crawlers', label: 'Crawlers', description: 'Web crawlers and scrapers' },
];

export function NewProjectModal({ isOpen, onClose, onSuccess }: NewProjectModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CategoryOption>('active');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string | null>(null);

  const validateName = (value: string): boolean => {
    // Project names: lowercase letters, numbers, hyphens only
    return /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/.test(value);
  };

  const formatName = (value: string): string => {
    // Auto-format: lowercase, replace spaces/underscores with hyphens
    return value
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatName(e.target.value);
    setName(formatted);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOutput(null);

    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    if (!validateName(name)) {
      setError('Project name must be lowercase, start with a letter, and contain only letters, numbers, and hyphens');
      return;
    }

    if (!description.trim()) {
      setError('Description is required for ralph to generate the project');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, category }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Failed to create project');
        return;
      }

      setOutput(data.output || 'Project created successfully');
      onSuccess?.(data.path);

      // Reset form after short delay to show success
      setTimeout(() => {
        setName('');
        setCategory('active');
        setDescription('');
        setOutput(null);
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setName('');
      setCategory('active');
      setDescription('');
      setError(null);
      setOutput(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            New Project
          </h2>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Project Name */}
          <div>
            <label
              htmlFor="projectName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Project Name
            </label>
            <input
              id="projectName"
              type="text"
              value={name}
              onChange={handleNameChange}
              placeholder="my-project"
              className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-gray-500">
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCategory(option.value)}
                  disabled={loading}
                  className={`px-3 py-2 text-left rounded-lg border transition-colors ${
                    category === option.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {option.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Design Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what the project should do. This will be passed to ralph to generate the initial project structure..."
              rows={4}
              className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400 resize-none"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-gray-500">
              Be descriptive - this is used by ralph CLI to scaffold your project
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Success Output */}
          {output && (
            <div className="p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-300">
              {output}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim() || !description.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
