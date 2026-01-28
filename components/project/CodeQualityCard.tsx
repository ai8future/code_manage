'use client';

import { useState } from 'react';
import { Award, ChevronDown, ChevronRight, ExternalLink, FileText, Beaker, Wrench, RefreshCw, ClipboardCheck } from 'lucide-react';
import { RcodegenInfo, RcodegenGrade, RcodegenTask } from '@/lib/types';
import { getGradeColor, getGradeBgColor } from '@/lib/utils/grades';
import { formatShortDate } from '@/lib/utils/dates';

interface CodeQualityCardProps {
  rcodegen: RcodegenInfo;
  projectPath: string;
}

const TASK_ICONS: Record<RcodegenTask | 'quick', React.ReactNode> = {
  audit: <ClipboardCheck size={14} />,
  test: <Beaker size={14} />,
  fix: <Wrench size={14} />,
  refactor: <RefreshCw size={14} />,
  quick: <FileText size={14} />,
};

const TASK_LABELS: Record<RcodegenTask | 'quick', string> = {
  audit: 'Audit',
  test: 'Tests',
  fix: 'Fixes',
  refactor: 'Refactor',
  quick: 'Quick',
};

export function CodeQualityCard({ rcodegen, projectPath }: CodeQualityCardProps) {
  const [showReports, setShowReports] = useState(false);

  const handleOpenReport = async (report: RcodegenGrade) => {
    const filePath = `${projectPath}/_rcodegen/${report.reportFile}`;

    try {
      await fetch('/api/actions/open-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
    } catch (err) {
      console.error('Failed to open report file:', err);
    }
  };

  const hasTaskGrades = Object.values(rcodegen.taskGrades).some(arr => arr.length > 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700/50 border-l-4 border-l-purple-500 p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Award size={18} className="text-blue-500" />
        <h3 className="font-semibold text-gray-900 dark:text-white">Code Quality</h3>
        <div className="flex items-center gap-2 ml-auto">
          {rcodegen.latestGrade != null && (
            <span className={`px-2 py-0.5 text-sm font-bold rounded ${getGradeBgColor(rcodegen.latestGrade)} ${getGradeColor(rcodegen.latestGrade)}`}>
              {rcodegen.latestGrade}
            </span>
          )}
          <span className="text-xs text-gray-500">
            {rcodegen.reportCount} report{rcodegen.reportCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Task Grades Breakdown */}
      {hasTaskGrades && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {(['audit', 'test', 'fix', 'refactor'] as const).map((task) => {
            const taskGrades = rcodegen.taskGrades[task];
            if (taskGrades.length === 0) return null;

            const latestGrade = taskGrades[0];
            return (
              <div
                key={task}
                className="flex items-center gap-2 p-2 rounded bg-gray-50 dark:bg-gray-700/50"
              >
                <span className="text-gray-500">{TASK_ICONS[task]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{TASK_LABELS[task]}</p>
                  <p className={`text-sm font-semibold ${getGradeColor(latestGrade.grade)}`}>
                    {latestGrade.grade}
                  </p>
                </div>
                <span className="text-xs text-gray-400 uppercase">{latestGrade.tool}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent Reports */}
      {rcodegen.recentGrades.length > 0 && (
        <div>
          <button
            onClick={() => setShowReports(!showReports)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white w-full"
          >
            {showReports ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <FileText size={14} className="text-blue-500" />
            Recent Reports ({Math.min(rcodegen.recentGrades.length, 5)})
          </button>
          {showReports && (
            <div className="mt-2 space-y-1 ml-6">
              {rcodegen.recentGrades.slice(0, 5).map((report, index) => (
                <div
                  key={`${report.reportFile}-${index}`}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer group"
                  onClick={() => handleOpenReport(report)}
                >
                  <span className="text-gray-400">{TASK_ICONS[report.task]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-white truncate">
                      {TASK_LABELS[report.task]} - {report.tool}
                    </p>
                    <p className="text-xs text-gray-500">{formatShortDate(report.date)}</p>
                  </div>
                  <span className={`text-sm font-medium ${getGradeColor(report.grade)}`}>
                    {report.grade}
                  </span>
                  <ExternalLink size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Last run info */}
      {rcodegen.lastRun && (
        <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          Last analyzed: {formatShortDate(rcodegen.lastRun)}
        </p>
      )}
    </div>
  );
}
