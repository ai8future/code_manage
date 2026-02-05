import { Zap } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';

export default function AgentsPage() {
  return (
    <div className="p-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Agents' },
        ]}
        title="Agents"
      />

      <div className="mt-8 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
          <Zap className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Job Automations
        </h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-md">
          Configure and monitor automated agents that run tasks across your codebases.
        </p>
      </div>
    </div>
  );
}
