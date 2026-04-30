'use client';

import {
  LayoutDashboard,
  Users,
  Boxes,
  Shield,
  ListTree,
  Activity,
  Settings,
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
    // Match the bare locale root: /ru, /en, or /.
    return pathname === '/' || /^\/[a-z]{2}$/.test(pathname);
  }
  return pathname.includes(href);
}

/**
 * Compact desktop sidebar: 56px wide, icon-only, hover-tooltip via native
 * `title`. Mobile uses MobileSidebar via Sheet (see Header).
 */
export function Sidebar() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <aside className="hidden w-14 shrink-0 flex-col border-r border-border bg-card md:flex">
      <Link
        href="/"
        className="flex h-14 items-center justify-center border-b border-border"
        title="AI Panel"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          AI
        </div>
      </Link>

      <nav className="flex-1 space-y-1 px-2 py-3">
        {NAV_ITEMS.map((it) => {
          const active = isActive(pathname, it.href);
          const Icon = it.icon;
          const label = t(it.key);
          return (
            <Link
              key={it.key}
              href={it.href}
              title={label}
              aria-label={label}
              className={cn(
                'flex h-9 items-center justify-center rounded-md transition-colors',
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
            </Link>
          );
        })}
      </nav>
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
