'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from '@tanstack/react-table';
import { Project, ProjectStatus } from '@/lib/types';
import { TechBadge } from './TechBadge';
import { SearchBar } from './SearchBar';
import {
  GitBranch,
  Star,
  Bug,
  Award,
  ExternalLink,
  FolderOpen,
  Copy,
  FolderX,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useProjectActions } from '@/lib/hooks/useProjectActions';
import { useProjects } from '@/lib/hooks/useProjects';
import { getGradeColor, getGradeBgColor } from '@/lib/utils/grades';
import { formatRelativeDate } from '@/lib/utils/dates';

interface ProjectTableProps {
  title?: string;
  status?: ProjectStatus;
  excludeStatuses?: ProjectStatus[];
}

const columnHelper = createColumnHelper<Project>();

export function ProjectTable({ title = 'All Projects', status, excludeStatuses }: ProjectTableProps) {
  const { projects: allProjects, loading, error, refresh } = useProjects();
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'starred', desc: true },
  ]);
  const [globalFilter, setGlobalFilter] = useState('');

  // Filter from the shared dataset instead of making a separate fetch
  const projects = useMemo(() => {
    let filtered = allProjects;
    if (status) filtered = filtered.filter((p) => p.status === status);
    if (excludeStatuses) filtered = filtered.filter((p) => !excludeStatuses.includes(p.status));
    return filtered;
  }, [allProjects, status, excludeStatuses]);

  const { openInEditor, openInFinder, copyPath } = useProjectActions();

  const handleToggleStar = async (project: Project) => {
    try {
      const response = await fetch(`/api/projects/${project.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: !project.starred }),
      });
      if (!response.ok) throw new Error('Failed to update project');
      refresh();
    } catch (err) {
      console.error('Failed to toggle star:', err);
    }
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('starred', {
        header: '',
        size: 40,
        cell: (info) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleStar(info.row.original);
            }}
            className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Star
              size={14}
              className={
                info.getValue()
                  ? 'text-yellow-500 fill-yellow-500'
                  : 'text-gray-300 dark:text-gray-600 hover:text-yellow-500'
              }
            />
          </button>
        ),
      }),
      columnHelper.accessor('name', {
        header: 'Project',
        cell: (info) => {
          const project = info.row.original;
          return (
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href={`/project/${project.slug}`}
                className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate transition-colors"
              >
                {info.getValue()}
              </Link>
              {project.suite && (
                <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
                  {project.suite}
                </span>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        size: 100,
        cell: (info) => {
          const status = info.getValue();
          const colors: Record<string, string> = {
            active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
            crawlers: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
            research: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
            tools: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
            icebox: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
            archived: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400',
          };
          return (
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${colors[status] || ''}`}>
              {status}
            </span>
          );
        },
      }),
      columnHelper.accessor('techStack', {
        header: 'Tech',
        size: 200,
        enableSorting: false,
        cell: (info) => {
          const stack = info.getValue();
          if (!stack.length) return null;
          return (
            <div className="flex flex-wrap gap-1">
              {stack.slice(0, 3).map((tech) => (
                <TechBadge key={tech} tech={tech} />
              ))}
              {stack.length > 3 && (
                <span className="text-xs text-gray-500">+{stack.length - 3}</span>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor('version', {
        header: 'Version',
        size: 80,
        cell: (info) => {
          const v = info.getValue();
          return v ? (
            <span className="font-mono text-xs text-gray-600 dark:text-gray-400">v{v}</span>
          ) : null;
        },
      }),
      columnHelper.accessor('chassisVersion', {
        header: 'Chassis',
        size: 80,
        cell: (info) => {
          const v = info.getValue();
          return v ? (
            <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{v}</span>
          ) : null;
        },
      }),
      columnHelper.accessor('gitBranch', {
        header: 'Branch',
        size: 120,
        cell: (info) => {
          const branch = info.getValue();
          return branch ? (
            <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
              <GitBranch size={12} />
              <span className="truncate max-w-[100px]">{branch}</span>
            </span>
          ) : null;
        },
      }),
      columnHelper.accessor((row) => row.bugs?.openCount ?? 0, {
        id: 'bugs',
        header: 'Bugs',
        size: 60,
        cell: (info) => {
          const count = info.getValue();
          if (!count) return null;
          return (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">
              <Bug size={12} />
              {count}
            </span>
          );
        },
      }),
      columnHelper.accessor((row) => row.rcodegen?.latestGrade ?? null, {
        id: 'grade',
        header: 'Grade',
        size: 60,
        cell: (info) => {
          const grade = info.getValue();
          if (grade == null) return null;
          return (
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded ${getGradeBgColor(grade)} ${getGradeColor(grade)}`}
            >
              <Award size={12} />
              {grade}
            </span>
          );
        },
      }),
      columnHelper.accessor('lastModified', {
        header: 'Modified',
        size: 110,
        cell: (info) => (
          <span className="text-xs text-gray-500 dark:text-gray-500 whitespace-nowrap">
            {formatRelativeDate(info.getValue())}
          </span>
        ),
        sortingFn: (rowA, rowB) => {
          const a = new Date(rowA.original.lastModified).getTime();
          const b = new Date(rowB.original.lastModified).getTime();
          return a - b;
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        size: 90,
        cell: (info) => {
          const project = info.row.original;
          return (
            <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
              <button
                onClick={() => openInEditor(project.path)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Open in VS Code"
              >
                <ExternalLink size={14} className="text-gray-500" />
              </button>
              <button
                onClick={() => openInFinder(project.path)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Open in Finder"
              >
                <FolderOpen size={14} className="text-gray-500" />
              </button>
              <button
                onClick={() => copyPath(project.path)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Copy Path"
              >
                <Copy size={14} className="text-gray-500" />
              </button>
            </div>
          );
        },
      }),
    ],
    []
  );

  const table = useReactTable({
    data: projects,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = filterValue.toLowerCase();
      const p = row.original;
      return (
        p.name.toLowerCase().includes(search) ||
        (p.description?.toLowerCase().includes(search) ?? false) ||
        p.techStack.some((t) => t.toLowerCase().includes(search)) ||
        p.status.toLowerCase().includes(search)
      );
    },
  });

  if (loading) {
    return (
      <div>
        <div className="flex items-center gap-4 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h2>
          <div className="ml-auto w-72">
            <SearchBar value="" onChange={() => {}} />
          </div>
        </div>
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {title}
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({table.getFilteredRowModel().rows.length})
          </span>
        </h2>
        <div className="ml-auto w-72">
          <SearchBar value={globalFilter} onChange={setGlobalFilter} />
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <FolderX size={64} className="mb-4 opacity-40" />
          <p className="text-lg font-medium mb-1">No projects found</p>
          <p className="text-sm text-gray-400">Projects will appear here when added</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b border-gray-200 dark:border-gray-700">
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap select-none"
                        style={{ width: header.getSize() }}
                      >
                        {header.isPlaceholder ? null : (
                          <div
                            className={
                              header.column.getCanSort()
                                ? 'flex items-center gap-1 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 transition-colors'
                                : ''
                            }
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getIsSorted() === 'asc' && <ArrowUp size={12} />}
                            {header.column.getIsSorted() === 'desc' && <ArrowDown size={12} />}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="group/row hover:bg-gray-50 dark:hover:bg-gray-750 dark:hover:bg-gray-700/30 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-3 py-2.5 text-sm"
                        style={{ width: cell.column.getSize() }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
