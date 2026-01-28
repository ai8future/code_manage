'use client';

interface SectionDividerProps {
  label: string;
}

export function SectionDivider({ label }: SectionDividerProps) {
  return (
    <div className="flex items-center gap-4 my-6">
      <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {label}
      </span>
      <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
    </div>
  );
}
