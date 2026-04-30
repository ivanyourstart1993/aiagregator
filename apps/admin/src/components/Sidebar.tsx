'use client';

import {
  LayoutDashboard,
  Users,
  Boxes,
  Shield,
  ListTree,
  Activity,
  Settings,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
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

const ITEMS: Item[] = [
  { href: '/', icon: LayoutDashboard, key: 'dashboard' },
  { href: '/users', icon: Users, key: 'users' },
  { href: '/providers/accounts', icon: Boxes, key: 'providerAccounts' },
  { href: '/providers/proxies', icon: Shield, key: 'providerProxies' },
  { href: '/tasks', icon: ListTree, key: 'tasks' },
  { href: '/load', icon: Activity, key: 'load' },
  { href: '/settings', icon: Settings, key: 'settings' },
];

export function Sidebar({ user }: { user: { email: string; name?: string | null } }) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          AI
        </div>
        <span className="text-sm font-semibold">Panel</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {ITEMS.map((it) => {
          const active =
            it.href === '/'
              ? pathname === '/' || /^\/[a-z]{2}$/.test(pathname)
              : pathname.includes(it.href);
          const Icon = it.icon;
          return (
            <Link
              key={it.key}
              href={it.href}
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

      <div className="border-t border-border px-3 py-3">
        <div className="px-2 pb-2 text-xs">
          <div className="truncate font-medium">{user.name ?? '—'}</div>
          <div className="truncate text-muted-foreground">{user.email}</div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          {t('signOut')}
        </button>
      </div>
    </aside>
  );
}
