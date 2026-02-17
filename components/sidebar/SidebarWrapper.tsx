'use client';

import { Sidebar } from './Sidebar';
import { useProjects } from '@/lib/hooks/useProjects';

export function SidebarWrapper() {
  const { counts } = useProjects();

  return <Sidebar counts={counts} />;
}
