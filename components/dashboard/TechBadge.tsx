'use client';

interface TechBadgeProps {
  tech: string;
}

const TECH_COLORS: Record<string, { bg: string; text: string }> = {
  'Next.js': { bg: 'bg-black dark:bg-white', text: 'text-white dark:text-black' },
  'React': { bg: 'bg-cyan-500', text: 'text-white' },
  'Vue': { bg: 'bg-emerald-500', text: 'text-white' },
  'Svelte': { bg: 'bg-orange-500', text: 'text-white' },
  'Node.js': { bg: 'bg-green-600', text: 'text-white' },
  'TypeScript': { bg: 'bg-blue-600', text: 'text-white' },
  'JavaScript': { bg: 'bg-yellow-400', text: 'text-black' },
  'Python': { bg: 'bg-blue-500', text: 'text-white' },
  'FastAPI': { bg: 'bg-teal-500', text: 'text-white' },
  'Django': { bg: 'bg-green-700', text: 'text-white' },
  'Flask': { bg: 'bg-gray-700', text: 'text-white' },
  'Rust': { bg: 'bg-orange-700', text: 'text-white' },
  'Go': { bg: 'bg-cyan-600', text: 'text-white' },
  'Express': { bg: 'bg-gray-600', text: 'text-white' },
  'Tailwind': { bg: 'bg-sky-500', text: 'text-white' },
  'Electron': { bg: 'bg-indigo-500', text: 'text-white' },
};

const DEFAULT_COLORS = { bg: 'bg-gray-200 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300' };

export function TechBadge({ tech }: TechBadgeProps) {
  const colors = TECH_COLORS[tech] || DEFAULT_COLORS;

  return (
    <span
      className={`
        inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
        ${colors.bg} ${colors.text}
      `}
    >
      {tech}
    </span>
  );
}
