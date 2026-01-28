'use client';

export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
      {/* Header skeleton */}
      <div className="flex items-start justify-between mb-3">
        <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-5 w-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>

      {/* Description skeleton */}
      <div className="space-y-2 mb-3">
        <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>

      {/* Tech badges skeleton */}
      <div className="flex gap-1 mb-3">
        <div className="h-5 w-14 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-5 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>

      {/* Footer skeleton */}
      <div className="flex items-center gap-4">
        <div className="h-3 w-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse ml-auto" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
