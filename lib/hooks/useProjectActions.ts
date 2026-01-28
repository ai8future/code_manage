import { useCallback } from 'react';
import { useToast } from '@/components/toast/ToastContext';

export function useProjectActions() {
  const { addToast } = useToast();

  const openInEditor = useCallback(async (path: string) => {
    try {
      const res = await fetch('/api/actions/open-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) throw new Error('Failed to open in editor');
    } catch (err) {
      console.error('Failed to open in editor:', err);
      addToast('Failed to open in editor', 'error');
    }
  }, [addToast]);

  const openInFinder = useCallback(async (path: string) => {
    try {
      const res = await fetch('/api/actions/open-finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) throw new Error('Failed to open in Finder');
    } catch (err) {
      console.error('Failed to open in Finder:', err);
      addToast('Failed to open in Finder', 'error');
    }
  }, [addToast]);

  const copyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path);
    addToast('Path copied to clipboard', 'success');
  }, [addToast]);

  return { openInEditor, openInFinder, copyPath };
}
