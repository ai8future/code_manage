'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Activity, GitCommit, Clock } from 'lucide-react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { VelocityDataPoint, CommitInfo } from '@/lib/activity-types';

type TimeRange = '7d' | '30d' | '90d';

export default function ActivityPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [velocityData, setVelocityData] = useState<VelocityDataPoint[]>([]);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch commits once on mount
  useEffect(() => {
    fetch('/api/activity/commits?limit=50')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCommits(data.commits || []);
      })
      .catch((error) => console.error('Error fetching commits:', error));
  }, []);

  // Fetch velocity data when time range changes
  useEffect(() => {
    const daysMap: Record<TimeRange, number> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
    };

    setLoading(true);
    fetch(`/api/activity/velocity?days=${daysMap[timeRange]}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setVelocityData(data.data || []);
      })
      .catch((error) => console.error('Error fetching velocity data:', error))
      .finally(() => setLoading(false));
  }, [timeRange]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const totalAdded = velocityData.reduce((sum, d) => sum + d.linesAdded, 0);
  const totalRemoved = velocityData.reduce((sum, d) => sum + d.linesRemoved, 0);

  return (
    <div className="p-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Activity' },
        ]}
        title="Activity Timeline"
        actions={
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {(['7d', '30d', '90d'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  timeRange === range
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
            <Activity size={16} />
            Lines Added
          </div>
          <div className="text-2xl font-semibold text-green-600 dark:text-green-400">
            +{totalAdded.toLocaleString()}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
            <Activity size={16} />
            Lines Removed
          </div>
          <div className="text-2xl font-semibold text-red-600 dark:text-red-400">
            -{totalRemoved.toLocaleString()}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
            <GitCommit size={16} />
            Recent Commits
          </div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-white">
            {commits.length}
          </div>
        </div>
      </div>

      {/* Velocity Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Code Velocity
        </h2>
        {loading ? (
          <div className="h-64 flex items-center justify-center text-gray-500">
            Loading...
          </div>
        ) : velocityData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-500">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={velocityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                stroke="#4B5563"
              />
              <YAxis
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                stroke="#4B5563"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#F3F4F6' }}
                formatter={(value, name) => [
                  typeof value === 'number' ? value.toLocaleString() : String(value),
                  name === 'linesAdded' ? 'Lines Added' : 'Lines Removed',
                ]}
                labelFormatter={(label) => formatDate(String(label))}
              />
              <Legend
                formatter={(value) =>
                  value === 'linesAdded' ? 'Lines Added' : 'Lines Removed'
                }
              />
              <Line
                type="monotone"
                dataKey="linesAdded"
                stroke="#10B981"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="linesRemoved"
                stroke="#EF4444"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent Commits */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Recent Commits
          </h2>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : commits.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No commits found</div>
          ) : (
            commits.map((commit) => (
              <div
                key={`${commit.projectSlug}-${commit.hash}`}
                className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        href={`/project/${commit.projectSlug}`}
                        className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {commit.project}
                      </Link>
                      <span className="text-gray-400">&#8226;</span>
                      <code className="text-xs text-gray-500 font-mono">
                        {commit.hash.slice(0, 7)}
                      </code>
                    </div>
                    <p className="text-gray-900 dark:text-white truncate">
                      {commit.message}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                      <span>{commit.author}</span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {formatDateTime(commit.date)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm shrink-0">
                    <span className="text-green-600 dark:text-green-400">
                      +{commit.linesAdded}
                    </span>
                    <span className="text-red-600 dark:text-red-400">
                      -{commit.linesRemoved}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
