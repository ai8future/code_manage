export function getGradeColor(grade: number): string {
  if (grade >= 80) return 'text-green-600 dark:text-green-400';
  if (grade >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

export function getGradeBgColor(grade: number): string {
  if (grade >= 80) return 'bg-green-100 dark:bg-green-900/30';
  if (grade >= 60) return 'bg-yellow-100 dark:bg-yellow-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

export function getGradeClasses(grade: number): string {
  return `${getGradeBgColor(grade)} ${getGradeColor(grade)}`;
}
