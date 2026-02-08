import { FolderOpen, Snowflake, Archive, Bug, FlaskConical, Wrench } from 'lucide-react';
import { ProjectGrid } from '@/components/dashboard/ProjectGrid';
import { ProjectTable } from '@/components/dashboard/ProjectTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectStatus } from '@/lib/types';
import { notFound } from 'next/navigation';

const STATUS_CONFIG: Record<string, {
  title: string;
  icon: typeof FolderOpen;
  status: ProjectStatus;
  useTable?: boolean;
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
  research: {
    title: 'Research & Demos',
    icon: FlaskConical,
    status: 'research',
  },
  tools: {
    title: 'Tools',
    icon: Wrench,
    status: 'tools',
  },
  icebox: {
    title: 'Icebox',
    icon: Snowflake,
    status: 'icebox',
    useTable: true,
  },
  archived: {
    title: 'Archived',
    icon: Archive,
    status: 'archived',
    useTable: true,
  },
};

export async function generateStaticParams() {
  return [
    { status: 'active' },
    { status: 'crawlers' },
    { status: 'research' },
    { status: 'tools' },
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

  return (
    <div className="p-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: config.title },
        ]}
        title={config.title}
      />

      {config.useTable ? (
        <ProjectTable title={config.title} status={config.status} />
      ) : (
        <ProjectGrid status={config.status} showSearch />
      )}
    </div>
  );
}
