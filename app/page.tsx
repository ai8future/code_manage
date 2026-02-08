import { ProjectTable } from '@/components/dashboard/ProjectTable';
import { CodeHealthSection } from '@/components/dashboard/CodeHealthSection';
import { PageHeader } from '@/components/layout/PageHeader';
import { SectionDivider } from '@/components/layout/SectionDivider';

export default function Home() {
  return (
    <div className="p-6">
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard' }]}
        title="Dashboard"
      />

      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Your projects from ~/Desktop/_code/
      </p>

      <ProjectTable excludeStatuses={['icebox', 'archived']} />

      <SectionDivider label="Code Health" />

      <CodeHealthSection />
    </div>
  );
}
