'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';

interface ProjectCounts {
  active: number;
  crawlers: number;
  icebox: number;
  archived: number;
}

export function SidebarWrapper() {
  const [counts, setCounts] = useState<ProjectCounts>({ active: 0, crawlers: 0, icebox: 0, archived: 0 });

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const response = await fetch('/api/projects');
        if (response.ok) {
          const data = await response.json();
          setCounts(data.counts);
        }
      } catch (error) {
        console.error('Failed to fetch project counts:', error);
      }
    };

    fetchCounts();
  }, []);

  return <Sidebar counts={counts} />;
}
