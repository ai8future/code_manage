import { LayoutDashboard } from 'lucide-react';
import { ProjectGrid } from '@/components/dashboard/ProjectGrid';
import { CodeHealthSection } from '@/components/dashboard/CodeHealthSection';

export default function Home() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <LayoutDashboard className="w-8 h-8 text-blue-500" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
      </div>

      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Your projects from ~/Desktop/_code/
      </p>

      <ProjectGrid title="All Projects" showSearch />

      <CodeHealthSection />
    </div>
  );
}
