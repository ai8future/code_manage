'use client';

import { createContext, useContext, useCallback, useSyncExternalStore, ReactNode } from 'react';

interface SidebarContextType {
  collapsed: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

const STORAGE_KEY = 'code-manage-sidebar-collapsed';

// localStorage-backed external store. useSyncExternalStore reads it on the
// client and falls back to the server snapshot during SSR/hydration, which
// avoids both a hydration mismatch and calling setState inside an effect.
const listeners = new Set<() => void>();

function readCollapsed(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener); // sync across tabs
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function getServerSnapshot(): boolean {
  return false;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, getServerSnapshot);

  const setCollapsed = useCallback((value: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(value));
    listeners.forEach((listener) => listener());
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!readCollapsed());
  }, [setCollapsed]);

  return (
    <SidebarContext.Provider value={{ collapsed, toggleCollapsed, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
