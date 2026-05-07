'use client';

import {
  LayoutDashboard,
  Users,
  Boxes,
  Shield,
  ListTree,
  Activity,
  Settings,
  Ticket,
  Target,
  Radar,
  MessageSquare,
  Send,
  Mail,
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
    | 'coupons'
    | 'load'
    | 'settings'
    | 'crmLeads'
    | 'crmSources'
    | 'crmTemplates'
    | 'crmAccounts'
    | 'crmCampaigns';
  group?: 'main' | 'crm';
}

export const NAV_ITEMS: Item[] = [
  { href: '/', icon: LayoutDashboard, key: 'dashboard', group: 'main' },
  { href: '/users', icon: Users, key: 'users', group: 'main' },
  { href: '/providers/accounts', icon: Boxes, key: 'providerAccounts', group: 'main' },
  { href: '/providers/proxies', icon: Shield, key: 'providerProxies', group: 'main' },
  { href: '/tasks', icon: ListTree, key: 'tasks', group: 'main' },
  { href: '/coupons', icon: Ticket, key: 'coupons', group: 'main' },
  { href: '/crm/leads', icon: Target, key: 'crmLeads', group: 'crm' },
  { href: '/crm/campaigns', icon: Mail, key: 'crmCampaigns', group: 'crm' },
  { href: '/crm/sources', icon: Radar, key: 'crmSources', group: 'crm' },
  { href: '/crm/templates', icon: MessageSquare, key: 'crmTemplates', group: 'crm' },
  { href: '/crm/accounts', icon: Send, key: 'crmAccounts', group: 'crm' },
  { href: '/load', icon: Activity, key: 'load', group: 'main' },
  { href: '/settings', icon: Settings, key: 'settings', group: 'main' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/' || /^\/[a-z]{2}$/.test(pathname);
  }
  return pathname.includes(href);
}

/**
 * Desktop sidebar driven by SidebarShell. Default expanded (224px) with
 * labels next to icons; collapsed (56px) when toggle button in header
 * is clicked. Hidden on mobile (drawer-served via Header).
 */
export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 md:flex',
        collapsed ? 'w-14' : 'w-56',
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
        {!collapsed && (
          <span className="truncate text-sm font-semibold">Panel</span>
        )}
      </Link>

      <nav className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.map((it, idx) => {
          const active = isActive(pathname, it.href);
          const Icon = it.icon;
          const label = t(it.key);
          const prev = NAV_ITEMS[idx - 1];
          const showDivider = prev && prev.group !== it.group;
          return (
            <div key={it.key}>
              {showDivider && (
                <div className="my-2 border-t border-border" aria-hidden />
              )}
              <Link
                href={it.href}
                title={collapsed ? label : undefined}
                aria-label={label}
                className={cn(
                  'flex h-9 items-center gap-3 rounded-md px-2.5 transition-colors',
                  collapsed ? 'justify-center' : 'justify-start',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate text-sm">{label}</span>}
              </Link>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

/**
 * Full-width sidebar content used inside the mobile drawer (Sheet).
 */
export function SidebarFull({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-0.5 px-3 py-3">
      {NAV_ITEMS.map((it, idx) => {
        const active = isActive(pathname, it.href);
        const Icon = it.icon;
        const prev = NAV_ITEMS[idx - 1];
        const showDivider = prev && prev.group !== it.group;
        return (
          <div key={it.key}>
            {showDivider && <div className="my-2 border-t border-border" aria-hidden />}
            <Link
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
          </div>
        );
      })}
    </nav>
  );
}
