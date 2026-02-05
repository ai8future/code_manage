'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Project } from '@/lib/types';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectHeader } from '@/components/project/ProjectHeader';
import { InfoCards } from '@/components/project/InfoCards';
import { BugsCard } from '@/components/project/BugsCard';
import { CodeQualityCard } from '@/components/project/CodeQualityCard';
import { DocsCard } from '@/components/project/DocsCard';
import { ReadmePreview } from '@/components/project/ReadmePreview';
import { TerminalPanel } from '@/components/terminal/TerminalPanel';

export default function ProjectPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);

  const fetchProject = async () => {
    try {
      const response = await fetch(`/api/projects/${slug}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Project not found');
        }
        throw new Error('Failed to fetch project');
      }
      const data = await response.json();
      setProject(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProject();
  }, [slug]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">
          {error || 'Project not found'}
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 ${showTerminal ? 'pb-80' : ''}`}>
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          ...(project.suite ? [{ label: project.suite }] : []),
          { label: project.name },
        ]}
      />

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
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
            v{project.version}
          </span>
        </div>
      )}

      <InfoCards project={project} />

      {/* Bug Tracking */}
      {project.bugs && (
        <div className="mb-6">
          <BugsCard bugs={project.bugs} projectPath={project.path} />
        </div>
      )}

      {/* Code Quality */}
      {project.rcodegen && (
        <div className="mb-6">
          <CodeQualityCard rcodegen={project.rcodegen} projectPath={project.path} />
        </div>
      )}

      {/* Documentation Files */}
      <div className="mb-6">
        <DocsCard projectPath={project.path} />
      </div>

      <ReadmePreview projectPath={project.path} />

      {/* Terminal Panel */}
      {showTerminal && (
        <TerminalPanel
          projectPath={project.path}
          onClose={() => setShowTerminal(false)}
        />
      )}
    </div>
  );
}
