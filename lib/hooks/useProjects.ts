'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Project } from '@/lib/types';

interface ProjectsData {
  projects: Project[];
  counts: {
    active: number;
    crawlers: number;
    research: number;
    tools: number;
    icebox: number;
    archived: number;
  };
}

const STALE_MS = 10_000; // Consider data stale after 10s

// Shared module-level state so all hook instances share one cache
let sharedData: ProjectsData | null = null;
let sharedTimestamp = 0;
let inflight: Promise<ProjectsData> | null = null;
let listeners: Array<() => void> = [];

function notify() {
  for (const fn of listeners) fn();
}

async function doFetch(): Promise<ProjectsData> {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

async function fetchShared(): Promise<ProjectsData> {
  // Return cached if fresh
  if (sharedData && Date.now() - sharedTimestamp < STALE_MS) {
    return sharedData;
  }

  // Coalesce concurrent requests
  if (inflight) return inflight;

  inflight = doFetch()
    .then((data) => {
      sharedData = data;
      sharedTimestamp = Date.now();
      inflight = null;
      notify();
      return data;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });

  return inflight;
}

/**
 * Hook that shares a single /api/projects fetch across all mounted
 * components. Prevents the "N components each trigger a full scan" problem.
 */
export function useProjects() {
  const [data, setData] = useState<ProjectsData | null>(sharedData);
  const [loading, setLoading] = useState(!sharedData);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Subscribe to shared updates from other hook instances
    const onUpdate = () => {
      if (mountedRef.current && sharedData) {
        setData(sharedData);
        setLoading(false);
      }
    };
    listeners.push(onUpdate);

    fetchShared()
      .then((result) => {
        if (mountedRef.current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'An error occurred');
          setLoading(false);
        }
      });

    return () => {
      mountedRef.current = false;
      listeners = listeners.filter((fn) => fn !== onUpdate);
    };
  }, []);

  const refresh = useCallback(() => {
    // Bust the cache and re-fetch
    sharedData = null;
    sharedTimestamp = 0;
    setLoading(true);
    fetchShared()
      .then((result) => {
        if (mountedRef.current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'An error occurred');
          setLoading(false);
        }
      });
  }, []);

  return {
    projects: data?.projects ?? [],
    counts: data?.counts ?? { active: 0, crawlers: 0, research: 0, tools: 0, icebox: 0, archived: 0 },
    loading,
    error,
    refresh,
  };
}
