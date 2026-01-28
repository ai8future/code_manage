# Frontend Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Comprehensive visual polish pass -- depth, micro-interactions, layout hierarchy, and dark mode refinements across the Code Management App.

**Architecture:** Layer-based approach. Build foundational CSS/utilities first (animations, variables), then shared components (toast, page header, skeletons), then apply changes outward from layout to individual components.

**Tech Stack:** Tailwind CSS, React Context (toasts), CSS keyframes (animations), existing Lucide icons.

---

### Task 1: CSS Foundation -- Keyframes, Variables, Dark Mode Base

**Files:**
- Modify: `app/globals.css`

**Step 1: Update CSS variables and add animation keyframes**

Replace the full contents of `app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #f8fafc;
  --foreground: #171717;
  --sidebar-width-collapsed: 64px;
  --sidebar-width-expanded: 256px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #111827;
    --foreground: #f3f4f6;
  }
}

body {
  color: var(--foreground);
  background: var(--background);
}

@layer utilities {
  .text-balance {
    text-wrap: balance;
  }
}

/* Card entrance animation */
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-up {
  animation: fadeUp 300ms ease-out forwards;
  opacity: 0;
}

/* Toast slide-in animation */
@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideOutRight {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}

.animate-slide-in-right {
  animation: slideInRight 300ms ease-out forwards;
}

.animate-slide-out-right {
  animation: slideOutRight 200ms ease-in forwards;
}

/* Expand/collapse animation */
.animate-expand {
  animation: expand 200ms ease-out forwards;
}

@keyframes expand {
  from {
    opacity: 0;
    max-height: 0;
  }
  to {
    opacity: 1;
    max-height: 500px;
  }
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

@media (prefers-color-scheme: dark) {
  ::-webkit-scrollbar-thumb {
    background: #374151;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #4b5563;
  }
}

/* Terminal styling overrides */
.xterm {
  padding: 8px;
}

.xterm-viewport {
  overflow-y: auto !important;
}
```

**Step 2: Verify the app still loads**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: update CSS foundation with animations and dark mode base"
```

---

### Task 2: Toast Notification System

**Files:**
- Create: `components/toast/ToastContext.tsx`
- Create: `components/toast/Toast.tsx`
- Modify: `app/layout.tsx`

**Step 1: Create ToastContext**

Create `components/toast/ToastContext.tsx`:

```tsx
'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  variant: ToastVariant;
  exiting?: boolean;
}

interface ToastContextType {
  toasts: ToastMessage[];
  addToast: (message: string, variant?: ToastVariant) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 200);
  }, []);

  const addToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev, { id, message, variant }]);
    setTimeout(() => removeToast(id), 3000);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}
```

**Step 2: Create Toast component**

Create `components/toast/Toast.tsx`:

```tsx
'use client';

import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { useToast, ToastMessage } from './ToastContext';

const VARIANT_STYLES = {
  success: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
  error: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
  info: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
};

const VARIANT_ICONS = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
};

function ToastItem({ toast }: { toast: ToastMessage }) {
  const { removeToast } = useToast();
  const Icon = VARIANT_ICONS[toast.variant];

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg
        ${VARIANT_STYLES[toast.variant]}
        ${toast.exiting ? 'animate-slide-out-right' : 'animate-slide-in-right'}
      `}
    >
      <Icon size={18} className="flex-shrink-0" />
      <p className="text-sm font-medium flex-1">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="flex-shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
```

**Step 3: Wire toast into layout**

Modify `app/layout.tsx` -- add ToastProvider wrapping children and ToastContainer:

```tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SidebarProvider } from "@/components/sidebar/SidebarContext";
import { SidebarWrapper } from "@/components/sidebar/SidebarWrapper";
import { ToastProvider } from "@/components/toast/ToastContext";
import { ToastContainer } from "@/components/toast/Toast";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Code Manager",
  description: "Manage your codebases in ~/Desktop/_code/",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased font-[family-name:var(--font-geist-sans)]`}
      >
        <ToastProvider>
          <SidebarProvider>
            <div className="flex h-screen overflow-hidden">
              <SidebarWrapper />
              <main className="flex-1 overflow-auto">
                {children}
              </main>
            </div>
          </SidebarProvider>
          <ToastContainer />
        </ToastProvider>
      </body>
    </html>
  );
}
```

**Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add components/toast/ToastContext.tsx components/toast/Toast.tsx app/layout.tsx
git commit -m "feat: add toast notification system"
```

---

### Task 3: Page Header with Breadcrumbs

**Files:**
- Create: `components/layout/PageHeader.tsx`
- Modify: `app/page.tsx`
- Modify: `app/[status]/page.tsx`

**Step 1: Create PageHeader component**

Create `components/layout/PageHeader.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { ReactNode } from 'react';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  icon: ReactNode;
  title: string;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  subtitle?: string;
}

export function PageHeader({ icon, title, breadcrumbs, actions, subtitle }: PageHeaderProps) {
  return (
    <div className="sticky top-0 z-10 -mx-6 -mt-6 px-6 pt-6 pb-4 mb-6 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-700/50">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-sm text-gray-500 mb-2">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={14} className="text-gray-400" />}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-gray-900 dark:hover:text-white transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-gray-900 dark:text-white">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {icon}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
            {subtitle && (
              <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
```

**Step 2: Update home page**

Replace contents of `app/page.tsx`:

```tsx
import { LayoutDashboard } from 'lucide-react';
import { ProjectGrid } from '@/components/dashboard/ProjectGrid';
import { CodeHealthSection } from '@/components/dashboard/CodeHealthSection';
import { PageHeader } from '@/components/layout/PageHeader';

export default function Home() {
  return (
    <div className="p-6">
      <PageHeader
        icon={<LayoutDashboard className="w-8 h-8 text-blue-500" />}
        title="Dashboard"
        subtitle="Your projects from ~/Desktop/_code/"
      />

      <div className="space-y-8">
        <ProjectGrid title="All Projects" showSearch />
        <CodeHealthSection />
      </div>
    </div>
  );
}
```

**Step 3: Update status page**

Replace contents of `app/[status]/page.tsx`:

```tsx
import { FolderOpen, Snowflake, Archive, Bug } from 'lucide-react';
import { ProjectGrid } from '@/components/dashboard/ProjectGrid';
import { ProjectStatus } from '@/lib/types';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';

const STATUS_CONFIG: Record<string, {
  title: string;
  icon: typeof FolderOpen;
  status: ProjectStatus;
}> = {
  active: {
    title: 'Active Projects',
    icon: FolderOpen,
    status: 'active',
  },
  crawlers: {
    title: 'Crawlers',
    icon: Bug,
    status: 'crawlers',
  },
  icebox: {
    title: 'Icebox',
    icon: Snowflake,
    status: 'icebox',
  },
  archived: {
    title: 'Archived',
    icon: Archive,
    status: 'archived',
  },
};

export async function generateStaticParams() {
  return [
    { status: 'active' },
    { status: 'crawlers' },
    { status: 'icebox' },
    { status: 'archived' },
  ];
}

export default async function StatusPage({
  params,
}: {
  params: Promise<{ status: string }>;
}) {
  const { status } = await params;
  const config = STATUS_CONFIG[status];

  if (!config) {
    notFound();
  }

  const Icon = config.icon;

  return (
    <div className="p-6">
      <PageHeader
        icon={<Icon className="w-8 h-8 text-blue-500" />}
        title={config.title}
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: config.title },
        ]}
      />

      <ProjectGrid status={config.status} showSearch />
    </div>
  );
}
```

**Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add components/layout/PageHeader.tsx app/page.tsx app/[status]/page.tsx
git commit -m "feat: add sticky page header with breadcrumbs"
```

---

### Task 4: Skeleton Loader Component

**Files:**
- Create: `components/layout/SkeletonCard.tsx`
- Modify: `components/dashboard/ProjectGrid.tsx`

**Step 1: Create SkeletonCard**

Create `components/layout/SkeletonCard.tsx`:

```tsx
export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
      <div className="animate-pulse">
        <div className="flex items-center justify-between mb-3">
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
          <div className="h-5 w-5 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/5 mb-4" />
        <div className="flex gap-2 mb-4">
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16" />
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-14" />
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-12" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-12" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
```

**Step 2: Update ProjectGrid to use skeletons and entrance animations**

Replace `components/dashboard/ProjectGrid.tsx` with:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Project, ProjectStatus } from '@/lib/types';
import { ProjectCard } from './ProjectCard';
import { SearchBar } from './SearchBar';
import { FolderX } from 'lucide-react';
import { SkeletonGrid } from '@/components/layout/SkeletonCard';
import { useToast } from '@/components/toast/ToastContext';

interface ProjectGridProps {
  status?: ProjectStatus;
  title?: string;
  showSearch?: boolean;
}

interface ProjectsResponse {
  projects: Project[];
  counts: {
    active: number;
    crawlers: number;
    icebox: number;
    archived: number;
  };
}

export function ProjectGrid({ status, title, showSearch = true }: ProjectGridProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { addToast } = useToast();

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);

      const response = await fetch(`/api/projects?${params}`);
      if (!response.ok) throw new Error('Failed to fetch projects');

      const data: ProjectsResponse = await response.json();
      setProjects(data.projects);
      setFilteredProjects(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [status]);

  useEffect(() => {
    if (!search.trim()) {
      setFilteredProjects(projects);
      return;
    }

    const searchLower = search.toLowerCase();
    setFilteredProjects(
      projects.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.description?.toLowerCase().includes(searchLower) ||
          p.techStack.some((t) => t.toLowerCase().includes(searchLower))
      )
    );
  }, [search, projects]);

  const handleOpenInEditor = async (project: Project) => {
    try {
      await fetch('/api/actions/open-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: project.path }),
      });
      addToast(`Opened ${project.name} in VS Code`, 'success');
    } catch (err) {
      console.error('Failed to open in editor:', err);
      addToast('Failed to open in editor', 'error');
    }
  };

  const handleOpenInFinder = async (project: Project) => {
    try {
      await fetch('/api/actions/open-finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: project.path }),
      });
      addToast(`Opened ${project.name} in Finder`, 'success');
    } catch (err) {
      console.error('Failed to open in Finder:', err);
      addToast('Failed to open in Finder', 'error');
    }
  };

  const handleCopyPath = (project: Project) => {
    navigator.clipboard.writeText(project.path);
    addToast('Path copied to clipboard', 'success');
  };

  if (loading) {
    return (
      <div>
        {(title || showSearch) && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
            {title && (
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {title}
              </h2>
            )}
            {showSearch && (
              <div className="sm:ml-auto w-full sm:w-72">
                <SearchBar value="" onChange={() => {}} />
              </div>
            )}
          </div>
        )}
        <SkeletonGrid />
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
      {(title || showSearch) && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          {title && (
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {title}
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({filteredProjects.length})
              </span>
            </h2>
          )}
          {showSearch && (
            <div className="sm:ml-auto w-full sm:w-72">
              <SearchBar value={search} onChange={setSearch} />
            </div>
          )}
        </div>
      )}

      {filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <FolderX size={64} className="mb-4 opacity-30" />
          <p className="text-lg font-medium">
            {search ? 'No projects match your search' : 'No projects found'}
          </p>
          <p className="text-sm mt-1">
            {search ? 'Try adjusting your search terms' : 'Projects will appear here when detected'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProjects.map((project, index) => (
            <div
              key={project.slug}
              className="animate-fade-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <ProjectCard
                project={project}
                onOpenInEditor={handleOpenInEditor}
                onOpenInFinder={handleOpenInFinder}
                onCopyPath={handleCopyPath}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add components/layout/SkeletonCard.tsx components/dashboard/ProjectGrid.tsx
git commit -m "feat: add skeleton loaders, entrance animations, and toast integration"
```

---

### Task 5: Card Depth and Hover Effects

**Files:**
- Modify: `components/dashboard/ProjectCard.tsx`

**Step 1: Update ProjectCard with shadows and hover effects**

In `components/dashboard/ProjectCard.tsx`, replace the outer div className (the card wrapper):

Find:
```
className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors group"
```

Replace with:
```
className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700/50 p-4 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 ease-out group"
```

**Step 2: Update the dropdown menu styling**

Find the dropdown menu div:
```
className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10"
```

Replace with:
```
className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700/50 py-1 z-10 backdrop-blur-sm"
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add components/dashboard/ProjectCard.tsx
git commit -m "style: add card depth, shadows, and hover effects"
```

---

### Task 6: Search Bar Enhancement

**Files:**
- Modify: `components/dashboard/SearchBar.tsx`

**Step 1: Update SearchBar with filled background and keyboard hint**

Replace full contents of `components/dashboard/SearchBar.tsx`:

```tsx
'use client';

import { Search, X } from 'lucide-react';
import { useRef, useEffect } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = 'Search projects...' }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative group">
      <Search
        size={18}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors"
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="
          w-full pl-10 pr-16 py-2.5 rounded-lg
          bg-gray-100 dark:bg-gray-800
          border border-transparent
          text-gray-900 dark:text-white
          placeholder-gray-500
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-700 focus:border-transparent
          transition-all duration-200
        "
      />
      {value ? (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <X size={18} />
        </button>
      ) : (
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center px-1.5 py-0.5 text-xs text-gray-400 bg-gray-200 dark:bg-gray-700 rounded font-mono">
          /
        </kbd>
      )}
    </div>
  );
}
```

**Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add components/dashboard/SearchBar.tsx
git commit -m "style: enhance search bar with filled background and keyboard shortcut"
```

---

### Task 7: Sidebar Shadow and Transitions

**Files:**
- Modify: `components/sidebar/Sidebar.tsx`

**Step 1: Add shadow and refine sidebar transitions**

In `components/sidebar/Sidebar.tsx`, update the `<aside>` className:

Find:
```
className={`
        h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
        flex flex-col
        transition-[width] duration-200 ease-out
        ${collapsed ? 'w-16' : 'w-64'}
      `}
```

Replace with:
```
className={`
        h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
        flex flex-col shadow-[2px_0_8px_rgba(0,0,0,0.04)] dark:shadow-[2px_0_8px_rgba(0,0,0,0.2)]
        transition-[width] duration-200 ease-out
        ${collapsed ? 'w-16' : 'w-64'}
      `}
```

**Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add components/sidebar/Sidebar.tsx
git commit -m "style: add sidebar shadow for depth separation"
```

---

### Task 8: Modal Backdrop Blur

**Files:**
- Modify: `components/project/BugsCard.tsx`

**Step 1: Update BugModal backdrop**

In `components/project/BugsCard.tsx`, find the modal overlay div:

Find:
```
className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
```

Replace with:
```
className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
```

**Step 2: Update modal container shadow**

Find:
```
className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
```

Replace with:
```
className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col border border-gray-200 dark:border-gray-700/50"
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add components/project/BugsCard.tsx
git commit -m "style: add backdrop blur and enhanced shadows to modals"
```

---

### Task 9: Info Cards Accent Borders

**Files:**
- Modify: `components/project/InfoCards.tsx`
- Modify: `components/project/BugsCard.tsx`
- Modify: `components/project/CodeQualityCard.tsx`
- Modify: `components/project/ReadmePreview.tsx`

**Step 1: Update InfoCards with colored left borders and shadows**

In `components/project/InfoCards.tsx`:

Find the Tech Stack card div:
```
<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Code2 size={18} className="text-blue-500" />
```

Replace with:
```
<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700/50 border-l-4 border-l-blue-500 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Code2 size={18} className="text-blue-500" />
```

Find the Git Info card div:
```
<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch size={18} className="text-green-500" />
```

Replace with:
```
<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700/50 border-l-4 border-l-orange-500 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch size={18} className="text-orange-500" />
```

Find the Dependencies card div:
```
<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Package size={18} className="text-purple-500" />
```

Replace with:
```
<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700/50 border-l-4 border-l-green-500 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Package size={18} className="text-green-500" />
```

**Step 2: Update BugsCard with red accent border**

In `components/project/BugsCard.tsx`, find the main card div:

Find:
```
<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Bug size={18} className="text-red-500" />
```

Replace with:
```
<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700/50 border-l-4 border-l-red-500 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Bug size={18} className="text-red-500" />
```

**Step 3: Update CodeQualityCard with purple accent border**

In `components/project/CodeQualityCard.tsx`, find the main card div:

Find:
```
<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Award size={18} className="text-blue-500" />
```

Replace with:
```
<div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700/50 border-l-4 border-l-purple-500 p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Award size={18} className="text-purple-500" />
```

**Step 4: Update ReadmePreview cards with shadow**

In `components/project/ReadmePreview.tsx`, find all three card divs (loading, empty, content) that have:
```
className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
```

Replace each with:
```
className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700/50 p-6 shadow-sm"
```

There are 3 occurrences of this class in the file.

**Step 5: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add components/project/InfoCards.tsx components/project/BugsCard.tsx components/project/CodeQualityCard.tsx components/project/ReadmePreview.tsx
git commit -m "style: add accent borders and shadows to project detail cards"
```

---

### Task 10: Project Detail Page -- Breadcrumbs and Spacing

**Files:**
- Modify: `app/project/[slug]/page.tsx`
- Modify: `components/project/ProjectHeader.tsx`

**Step 1: Add breadcrumbs to ProjectHeader**

Replace `components/project/ProjectHeader.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Terminal, ChevronRight } from 'lucide-react';
import { Project } from '@/lib/types';
import { ActionsMenu } from '@/components/actions/ActionsMenu';

interface ProjectHeaderProps {
  project: Project;
  onOpenTerminal?: () => void;
  onRefresh?: () => void;
}

export function ProjectHeader({ project, onOpenTerminal, onRefresh }: ProjectHeaderProps) {
  const router = useRouter();

  const statusLabel = project.status.charAt(0).toUpperCase() + project.status.slice(1);

  return (
    <div className="sticky top-0 z-10 -mx-6 -mt-6 px-6 pt-6 pb-4 mb-6 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-700/50">
      <nav className="flex items-center gap-1 text-sm text-gray-500 mb-3">
        <Link href="/" className="hover:text-gray-900 dark:hover:text-white transition-colors">
          Dashboard
        </Link>
        <ChevronRight size={14} className="text-gray-400" />
        <Link href={`/${project.status}`} className="hover:text-gray-900 dark:hover:text-white transition-colors capitalize">
          {statusLabel}
        </Link>
        <ChevronRight size={14} className="text-gray-400" />
        <span className="text-gray-900 dark:text-white">{project.name}</span>
      </nav>

      <div className="flex items-center gap-4">
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
          <span className={`
            px-2 py-1 rounded text-xs font-medium capitalize
            ${project.status === 'active' ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300' : ''}
            ${project.status === 'crawlers' ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300' : ''}
            ${project.status === 'icebox' ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : ''}
            ${project.status === 'archived' ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' : ''}
          `}>
            {project.status}
          </span>

          {onOpenTerminal && (
            <button
              onClick={onOpenTerminal}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 active:scale-95 transition-all"
            >
              <Terminal size={16} />
              <span className="hidden sm:inline">Terminal</span>
            </button>
          )}

          <ActionsMenu project={project} onRefresh={onRefresh} />
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Update project detail page spacing**

In `app/project/[slug]/page.tsx`, update the spacing. Change the section wrapping for bugs and code quality from `mb-6` wrappers to a unified `space-y-6` container. Replace the return block starting from `return (` down to the closing `);`:

```tsx
  return (
    <div className={`p-6 ${showTerminal ? 'pb-80' : ''}`}>
      <ProjectHeader
        project={project}
        onOpenTerminal={() => setShowTerminal(true)}
        onRefresh={fetchProject}
      />

      {/* Project description */}
      {project.description && (
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {project.description}
        </p>
      )}

      {/* Version badge */}
      {project.version && (
        <div className="mb-6">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
            v{project.version}
          </span>
        </div>
      )}

      <div className="space-y-6">
        <InfoCards project={project} />

        {/* Bug Tracking */}
        {project.bugs && (
          <BugsCard bugs={project.bugs} projectPath={project.path} />
        )}

        {/* Code Quality */}
        {project.rcodegen && (
          <CodeQualityCard rcodegen={project.rcodegen} projectPath={project.path} />
        )}

        <ReadmePreview projectPath={project.path} />
      </div>

      {/* Terminal Panel */}
      {showTerminal && (
        <TerminalPanel
          projectPath={project.path}
          onClose={() => setShowTerminal(false)}
        />
      )}
    </div>
  );
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add app/project/[slug]/page.tsx components/project/ProjectHeader.tsx
git commit -m "feat: add breadcrumbs to project detail, improve spacing"
```

---

### Task 11: Expand/Collapse Animations

**Files:**
- Modify: `components/project/BugsCard.tsx`
- Modify: `components/project/CodeQualityCard.tsx`

**Step 1: Add expand animation to BugsCard sections**

In `components/project/BugsCard.tsx`, find both instances of expandable content divs.

Find (open bugs list):
```
{showOpen && (
              <div className="mt-2 space-y-1 ml-6">
```

Replace with:
```
{showOpen && (
              <div className="mt-2 space-y-1 ml-6 animate-expand overflow-hidden">
```

Find (fixed bugs list):
```
{showFixed && (
              <div className="mt-2 space-y-1 ml-6">
```

Replace with:
```
{showFixed && (
              <div className="mt-2 space-y-1 ml-6 animate-expand overflow-hidden">
```

**Step 2: Add expand animation to CodeQualityCard**

In `components/project/CodeQualityCard.tsx`, find:

```
{showReports && (
            <div className="mt-2 space-y-1 ml-6">
```

Replace with:
```
{showReports && (
            <div className="mt-2 space-y-1 ml-6 animate-expand overflow-hidden">
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add components/project/BugsCard.tsx components/project/CodeQualityCard.tsx
git commit -m "style: add expand/collapse animations to collapsible sections"
```

---

### Task 12: Final Build Verification and Version Bump

**Files:**
- Modify: `VERSION`
- Modify: `CHANGELOG.md`

**Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with zero errors.

**Step 2: Update VERSION**

Write `1.1.0` to `VERSION` (minor version bump for the design overhaul).

**Step 3: Update CHANGELOG**

Add new entry at top of CHANGELOG.md:

```markdown
## [1.1.0] - 2026-01-28

### Added
- Toast notification system for action feedback (copy path, open editor, errors)
- Sticky page headers with backdrop blur
- Breadcrumb navigation on status and project detail pages
- Skeleton card loaders replacing spinner during data fetch
- Staggered fade-up entrance animations for project cards
- Keyboard shortcut `/` to focus search bar
- Expand/collapse animations for collapsible sections

### Changed
- Cards now have subtle shadows with lift effect on hover
- Modals use backdrop blur and enhanced shadows
- Project detail cards have colored left-border accents (blue, orange, green, red, purple)
- Search bar has filled background style with keyboard hint
- Sidebar has subtle shadow for depth separation
- Dark mode background softened from near-black to gray-900
- Dark mode borders use semi-transparent values for softer appearance
- Badge opacity values adjusted for better readability in dark mode
- Empty states improved with larger icons and descriptive subtext
- Increased spacing between major sections for visual rhythm
```

**Step 4: Commit**

```bash
git add VERSION CHANGELOG.md
git commit -m "chore: bump version to 1.1.0 for frontend redesign"
```

**Step 5: Push**

```bash
git push
```
