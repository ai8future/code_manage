import { SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';

export default function ConfigPage() {
  return (
    <div className="p-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Config' },
        ]}
        title="Config"
      />

      <div className="mt-8 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
          <SlidersHorizontal className="w-8 h-8 text-violet-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Codebase Configuration
        </h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-md">
          Adjust settings for individual codebases including ports, custom names, and status overrides.
        </p>
      </div>
    </div>
  );
}
