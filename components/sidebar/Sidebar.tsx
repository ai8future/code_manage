'use client';

import { useState } from 'react';
import {
  FolderOpen,
  Archive,
  Snowflake,
  Settings,
  PanelLeftClose,
  PanelLeft,
  LayoutDashboard,
  Bug
} from 'lucide-react';
import { useSidebar } from './SidebarContext';
import { SidebarItem } from './SidebarItem';
import { SidebarProjectList } from './SidebarProjectList';
import { ProjectStatus } from '@/lib/types';

interface ProjectCounts {
  active: number;
  crawlers: number;
  icebox: number;
  archived: number;
}

interface SidebarProps {
  counts?: ProjectCounts;
}

export function Sidebar({ counts = { active: 0, crawlers: 0, icebox: 0, archived: 0 } }: SidebarProps) {
  const { collapsed, toggleCollapsed } = useSidebar();
  const [expandedStatus, setExpandedStatus] = useState<ProjectStatus | null>(null);

  const handleToggle = (status: ProjectStatus) => {
    setExpandedStatus(expandedStatus === status ? null : status);
  };

  return (
    <aside
      className={`
        h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700/50
        flex flex-col shadow-[2px_0_8px_rgba(0,0,0,0.04)] dark:shadow-[2px_0_8px_rgba(0,0,0,0.2)]
        transition-[width] duration-200 ease-out
        ${collapsed ? 'w-16' : 'w-64'}
      `}
    >
      {/* Header */}
      <div className={`
        flex items-center h-14 px-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0
        ${collapsed ? 'justify-center' : 'justify-between'}
      `}>
        {!collapsed && (
          <h1 className="font-semibold text-lg text-gray-900 dark:text-white truncate">
            Code Manager
          </h1>
        )}
        <button
          onClick={toggleCollapsed}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeft size={20} className="text-gray-600 dark:text-gray-400" />
          ) : (
            <PanelLeftClose size={20} className="text-gray-600 dark:text-gray-400" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-shrink-0">
          <SidebarItem
            href="/"
            icon={LayoutDashboard}
            label="Dashboard"
          />
        </div>

        <div className={`my-3 flex-shrink-0 ${collapsed ? 'mx-2' : 'mx-3'}`}>
          <div className="border-t border-gray-200 dark:border-gray-800" />
        </div>

        <div className="flex flex-col flex-1 min-h-0 gap-1">
          <SidebarProjectList
            href="/active"
            icon={FolderOpen}
            label="Active Projects"
            status="active"
            badge={counts.active}
            expanded={expandedStatus === 'active'}
            onToggle={() => handleToggle('active')}
          />
          <SidebarProjectList
            href="/crawlers"
            icon={Bug}
            label="Crawlers"
            status="crawlers"
            badge={counts.crawlers}
            expanded={expandedStatus === 'crawlers'}
            onToggle={() => handleToggle('crawlers')}
          />
          <SidebarProjectList
            href="/icebox"
            icon={Snowflake}
            label="Icebox"
            status="icebox"
            badge={counts.icebox}
            expanded={expandedStatus === 'icebox'}
            onToggle={() => handleToggle('icebox')}
          />
          <SidebarProjectList
            href="/archived"
            icon={Archive}
            label="Archived"
            status="archived"
            badge={counts.archived}
            expanded={expandedStatus === 'archived'}
            onToggle={() => handleToggle('archived')}
          />
        </div>
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
        <SidebarItem
          href="/settings"
          icon={Settings}
          label="Settings"
        />
      </div>
    </aside>
  );
}
