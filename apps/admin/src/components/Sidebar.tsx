'use client';

import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Boxes,
  Shield,
  ListTree,
  Activity,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

interface Item {
  href: string;
  icon: LucideIcon;
  key:
    | 'dashboard'
    | 'users'
    | 'providerAccounts'
    | 'providerProxies'
    | 'tasks'
    | 'load'
    | 'settings';
}

export const NAV_ITEMS: Item[] = [
  { href: '/', icon: LayoutDashboard, key: 'dashboard' },
  { href: '/users', icon: Users, key: 'users' },
  { href: '/providers/accounts', icon: Boxes, key: 'providerAccounts' },
  { href: '/providers/proxies', icon: Shield, key: 'providerProxies' },
  { href: '/tasks', icon: ListTree, key: 'tasks' },
  { href: '/load', icon: Activity, key: 'load' },
  { href: '/settings', icon: Settings, key: 'settings' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/' || /^\/[a-z]{2}$/.test(pathname);
  }
  return pathname.includes(href);
}

const STORAGE_KEY = 'admin-sidebar-expanded';

/**
 * Desktop sidebar with two states:
 * - Collapsed (default, 56px): icon-only with hover-tooltip
 * - Expanded (pinned via toggle, 224px): icons + labels
 *
 * State persists in localStorage. Hidden on mobile (drawer-served via Header).
 */
export function Sidebar() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  // Avoid hydration mismatch — render the default-collapsed shell on first
  // paint, then expand if localStorage says so.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') setExpanded(true);
    } catch {
      // localStorage unavailable (incognito etc) — stay collapsed
    }
    setHydrated(true);
  }, []);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // ignore
    }
  }

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 md:flex',
        expanded && hydrated ? 'w-56' : 'w-14',
      )}
    >
      <Link
        href="/"
        className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3"
        title="AI Panel"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          AI
        </div>
        {expanded && hydrated && (
          <span className="truncate text-sm font-semibold">Panel</span>
        )}
      </Link>

      <nav className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.map((it) => {
          const active = isActive(pathname, it.href);
          const Icon = it.icon;
          const label = t(it.key);
          return (
            <Link
              key={it.key}
              href={it.href}
              title={expanded ? undefined : label}
              aria-label={label}
              className={cn(
                'flex h-9 items-center gap-3 rounded-md px-2.5 transition-colors',
                expanded && hydrated ? 'justify-start' : 'justify-center',
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {expanded && hydrated && (
                <span className="truncate text-sm">{label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={expanded ? 'Свернуть меню' : 'Развернуть меню'}
          title={expanded ? 'Свернуть' : 'Развернуть'}
          className={cn(
            'flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground',
            expanded && hydrated ? 'justify-start' : 'justify-center',
          )}
        >
          {expanded && hydrated ? (
            <>
              <PanelLeftClose className="h-4 w-4 shrink-0" />
              <span className="truncate text-sm">Свернуть</span>
            </>
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}

/**
 * Full-width sidebar content used inside the mobile drawer (Sheet).
 * Identical items, but with text labels visible.
 */
export function SidebarFull({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-0.5 px-3 py-3">
      {NAV_ITEMS.map((it) => {
        const active = isActive(pathname, it.href);
        const Icon = it.icon;
        return (
          <Link
            key={it.key}
            href={it.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{t(it.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
