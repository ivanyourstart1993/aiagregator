'use client';

import {
  BookOpen,
  Boxes,
  CreditCard,
  History,
  Receipt,
  ScrollText,
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
  labelKey:
    | 'navUsers'
    | 'navBilling'
    | 'navTransactions'
    | 'navDeposits'
    | 'navPricing'
    | 'navBundles'
    | 'navChanges'
    | 'navCoupons'
    | 'navRedemptions'
    | 'navCatalog';
}

const ITEMS: Item[] = [
  { href: '/admin/users', icon: Users, labelKey: 'navUsers' },
  { href: '/admin/billing', icon: ScrollText, labelKey: 'navBilling' },
  { href: '/admin/billing/transactions', icon: Receipt, labelKey: 'navTransactions' },
  { href: '/admin/billing/deposits', icon: CreditCard, labelKey: 'navDeposits' },
  { href: '/admin/pricing/tariffs', icon: Tags, labelKey: 'navPricing' },
  { href: '/admin/pricing/bundles', icon: Boxes, labelKey: 'navBundles' },
  { href: '/admin/pricing/changes', icon: History, labelKey: 'navChanges' },
  { href: '/admin/coupons', icon: Ticket, labelKey: 'navCoupons' },
  { href: '/admin/coupons/redemptions', icon: TicketCheck, labelKey: 'navRedemptions' },
  { href: '/admin/catalog', icon: BookOpen, labelKey: 'navCatalog' },
];

export function AdminSidebarNav() {
  const t = useTranslations('admin');
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-3">
      {ITEMS.map((item) => {
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
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
