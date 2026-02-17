'use client';

import { useState, useEffect } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { useProjects } from '@/lib/hooks/useProjects';

interface Settings {
  sidebarCollapsed: boolean;
  defaultStatus: 'active' | 'icebox' | 'archived';
  terminalHeight: number;
}

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings>({
    sidebarCollapsed: false,
    defaultStatus: 'active',
    terminalHeight: 300,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { counts, refresh } = useProjects();
  const projectCount = counts.active + counts.crawlers + counts.research + counts.tools + counts.icebox + counts.archived;

  useEffect(() => {
    // Load sidebar collapsed state from localStorage
    const sidebarCollapsed = localStorage.getItem('code-manage-sidebar-collapsed') === 'true';
    setSettings((prev) => ({ ...prev, sidebarCollapsed }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save sidebar state
      localStorage.setItem('code-manage-sidebar-collapsed', String(settings.sidebarCollapsed));

      // In a real app, you'd save other settings to the config file here
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleRescan = () => {
    refresh();
  };

  return (
    <div className="space-y-6">
      {/* General Settings */}
      <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          General Settings
        </h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-white">
                Sidebar Default State
              </label>
              <p className="text-sm text-gray-500">
                Whether the sidebar starts collapsed on load
              </p>
            </div>
            <select
              value={settings.sidebarCollapsed ? 'collapsed' : 'expanded'}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  sidebarCollapsed: e.target.value === 'collapsed',
                }))
              }
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="expanded">Expanded</option>
              <option value="collapsed">Collapsed</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-white">
                Default Project Status
              </label>
              <p className="text-sm text-gray-500">
                Default status for new projects
              </p>
            </div>
            <select
              value={settings.defaultStatus}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  defaultStatus: e.target.value as Settings['defaultStatus'],
                }))
              }
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="active">Active</option>
              <option value="icebox">Icebox</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-white">
                Terminal Height
              </label>
              <p className="text-sm text-gray-500">
                Default height of the terminal panel (pixels)
              </p>
            </div>
            <input
              type="number"
              min={150}
              max={600}
              step={50}
              value={settings.terminalHeight}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  terminalHeight: parseInt(e.target.value) || 300,
                }))
              }
              className="w-24 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            <Save size={16} />
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </section>

      {/* Project Scanner */}
      <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Project Scanner
        </h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Scan Directory
              </p>
              <p className="text-sm text-gray-500 font-mono">
                ~/Desktop/_code/
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              {projectCount} projects
            </span>
          </div>

          <button
            onClick={handleRescan}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <RefreshCw size={16} />
            Rescan Projects
          </button>
        </div>
      </section>

      {/* About */}
      <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          About
        </h2>

        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p><strong>Code Manager</strong></p>
          <p>A local tool to manage codebases in ~/Desktop/_code/</p>
          <p className="mt-4">
            Built with Next.js, Tailwind CSS, and Lucide icons.
          </p>
        </div>
      </section>
    </div>
  );
}
