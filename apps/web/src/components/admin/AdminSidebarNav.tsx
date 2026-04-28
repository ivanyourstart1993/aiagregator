'use client';

import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Boxes,
  CreditCard,
  Files,
  Gauge,
  History,
  Inbox,
  Layers,
  ListTree,
  Receipt,
  ScrollText,
  Server,
  Settings,
  Shield,
  Tags,
  Ticket,
  TicketCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

interface Item {
  href: string;
  icon: LucideIcon;
  label: string;
}
interface Group {
  titleKey: 'groupCore' | 'groupOperations' | 'groupAnalytics';
  items: Item[];
}

export function AdminSidebarNav() {
  const t = useTranslations('admin');
  const pathname = usePathname();

  const groups: Group[] = [
    {
      titleKey: 'groupCore',
      items: [
        { href: '/admin/users', icon: Users, label: t('navUsers') },
        { href: '/admin/billing', icon: ScrollText, label: t('navBilling') },
        { href: '/admin/billing/transactions', icon: Receipt, label: t('navTransactions') },
        { href: '/admin/billing/deposits', icon: CreditCard, label: t('navDeposits') },
        { href: '/admin/pricing/tariffs', icon: Tags, label: t('navPricing') },
        { href: '/admin/pricing/bundles', icon: Boxes, label: t('navBundles') },
        { href: '/admin/pricing/changes', icon: History, label: t('navChanges') },
        { href: '/admin/coupons', icon: Ticket, label: t('navCoupons') },
        { href: '/admin/coupons/redemptions', icon: TicketCheck, label: t('navRedemptions') },
        { href: '/admin/catalog', icon: BookOpen, label: t('navCatalog') },
      ],
    },
    {
      titleKey: 'groupOperations',
      items: [
        { href: '/admin/providers', icon: Server, label: t('navProviders') },
        { href: '/admin/providers/accounts', icon: Layers, label: t('navProviderAccounts') },
        { href: '/admin/providers/proxies', icon: Shield, label: t('navProxies') },
        { href: '/admin/rate-cards', icon: Tags, label: t('navRateCards') },
        { href: '/admin/tasks', icon: ListTree, label: t('navTasks') },
        { href: '/admin/load', icon: Gauge, label: t('navLoad') },
        { href: '/admin/dlq', icon: Inbox, label: t('navDlq') },
        { href: '/admin/alerts', icon: AlertTriangle, label: t('navAlerts') },
        { href: '/admin/settings', icon: Settings, label: t('navSettings') },
      ],
    },
    {
      titleKey: 'groupAnalytics',
      items: [
        { href: '/admin/analytics', icon: BarChart3, label: t('navAnalytics') },
        { href: '/admin/files', icon: Files, label: t('navFiles') },
      ],
    },
  ];

  return (
    <nav className="flex flex-col gap-4 p-3">
      {groups.map((g) => (
        <div key={g.titleKey} className="flex flex-col gap-1">
          <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t(g.titleKey)}
          </div>
          {g.items.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
