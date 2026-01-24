'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Award, AlertTriangle, TrendingUp, ArrowRight, Loader2 } from 'lucide-react';
import { Project } from '@/lib/types';

function getGradeColor(grade: number): string {
  if (grade >= 80) return 'text-green-600 dark:text-green-400';
  if (grade >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function getGradeBgColor(grade: number): string {
  if (grade >= 80) return 'bg-green-100 dark:bg-green-900/30';
  if (grade >= 60) return 'bg-yellow-100 dark:bg-yellow-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

export function CodeHealthSection() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const response = await fetch('/api/projects');
        if (response.ok) {
          const data = await response.json();
          setProjects(data.projects || []);
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProjects();
  }, []);

  if (loading) {
    return (
      <div className="mt-8 p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  // Filter projects with rcodegen data
  const projectsWithGrades = projects.filter(p => p.rcodegen?.latestGrade != null);
  const projectsWithoutGrades = projects.filter(p => !p.rcodegen?.latestGrade);

  // Don't show section if no projects have grades
  if (projectsWithGrades.length === 0) {
    return null;
  }

  // Sort by grade (lowest first for attention)
  const sortedByGrade = [...projectsWithGrades].sort(
    (a, b) => (a.rcodegen?.latestGrade ?? 0) - (b.rcodegen?.latestGrade ?? 0)
  );

  // Calculate stats
  const averageGrade = Math.round(
    projectsWithGrades.reduce((sum, p) => sum + (p.rcodegen?.latestGrade ?? 0), 0) / projectsWithGrades.length
  );

  const needsAttention = projectsWithGrades.filter(p => (p.rcodegen?.latestGrade ?? 0) < 60);
  const topProjects = [...projectsWithGrades]
    .sort((a, b) => (b.rcodegen?.latestGrade ?? 0) - (a.rcodegen?.latestGrade ?? 0))
    .slice(0, 3);

  return (
    <div className="mt-8">
      <div className="flex items-center gap-3 mb-4">
        <Award className="w-6 h-6 text-blue-500" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Code Health Overview</h2>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Average Grade */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-gray-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Average Grade</span>
          </div>
          <p className={`text-3xl font-bold ${getGradeColor(averageGrade)}`}>
            {averageGrade}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            across {projectsWithGrades.length} project{projectsWithGrades.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Needs Attention */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-red-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Needs Attention</span>
          </div>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400">
            {needsAttention.length}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            project{needsAttention.length !== 1 ? 's' : ''} below 60
          </p>
        </div>

        {/* Not Analyzed */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Award size={16} className="text-gray-400" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Not Analyzed</span>
          </div>
          <p className="text-3xl font-bold text-gray-600 dark:text-gray-400">
            {projectsWithoutGrades.length}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            project{projectsWithoutGrades.length !== 1 ? 's' : ''} without grades
          </p>
        </div>
      </div>

      {/* Projects Needing Attention */}
      {needsAttention.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-500" />
            Projects Needing Attention
          </h3>
          <div className="space-y-2">
            {sortedByGrade.slice(0, 5).map((project) => (
              <Link
                key={project.slug}
                href={`/project/${project.slug}`}
                className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
              >
                <span className={`px-2 py-0.5 text-sm font-bold rounded ${getGradeBgColor(project.rcodegen?.latestGrade ?? 0)} ${getGradeColor(project.rcodegen?.latestGrade ?? 0)}`}>
                  {project.rcodegen?.latestGrade}
                </span>
                <span className="flex-1 text-sm text-gray-900 dark:text-white truncate group-hover:text-blue-500">
                  {project.name}
                </span>
                <ArrowRight size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Top Projects */}
      {topProjects.length > 0 && needsAttention.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Award size={14} className="text-green-500" />
            Top Performing Projects
          </h3>
          <div className="space-y-2">
            {topProjects.map((project) => (
              <Link
                key={project.slug}
                href={`/project/${project.slug}`}
                className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
              >
                <span className={`px-2 py-0.5 text-sm font-bold rounded ${getGradeBgColor(project.rcodegen?.latestGrade ?? 0)} ${getGradeColor(project.rcodegen?.latestGrade ?? 0)}`}>
                  {project.rcodegen?.latestGrade}
                </span>
                <span className="flex-1 text-sm text-gray-900 dark:text-white truncate group-hover:text-blue-500">
                  {project.name}
                </span>
                <ArrowRight size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
