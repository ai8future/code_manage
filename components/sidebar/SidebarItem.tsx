'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LucideIcon } from 'lucide-react';
import { useSidebar } from './SidebarContext';

interface SidebarItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
}

export function SidebarItem({ href, icon: Icon, label, badge }: SidebarItemProps) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={`
        flex items-center gap-3 px-3 py-2.5 rounded-lg
        transition-colors duration-150
        ${isActive
          ? 'bg-blue-500/10 text-blue-500'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        }
        ${collapsed ? 'justify-center' : ''}
      `}
      title={collapsed ? label : undefined}
    >
      <Icon size={20} className="flex-shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 font-medium truncate">{label}</span>
          {badge !== undefined && badge > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 rounded-full">
              {badge}
            </span>
          )}
        </>
      )}
    </Link>
  );
}
