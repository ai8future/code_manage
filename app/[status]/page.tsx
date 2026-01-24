import { FolderOpen, Snowflake, Archive, Bug } from 'lucide-react';
import { ProjectGrid } from '@/components/dashboard/ProjectGrid';
import { ProjectStatus } from '@/lib/types';
import { notFound } from 'next/navigation';

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
      <div className="flex items-center gap-3 mb-6">
        <Icon className="w-8 h-8 text-blue-500" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {config.title}
        </h1>
      </div>

      <ProjectGrid status={config.status} showSearch />
    </div>
  );
}
