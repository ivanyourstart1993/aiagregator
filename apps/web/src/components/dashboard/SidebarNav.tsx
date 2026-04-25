'use client';

import {
  Coins,
  CreditCard,
  Gauge,
  Headphones,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Tags,
  TerminalSquare,
  Ticket,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

type NavLabel =
  | 'dashboard'
  | 'apiKeys'
  | 'balance'
  | 'topUp'
  | 'coupons'
  | 'pricing'
  | 'apiExplorer'
  | 'charges'
  | 'requests'
  | 'profile'
  | 'support'
  | 'docs';

interface NavItem {
  href: string;
  icon: LucideIcon;
  labelKey: NavLabel;
}

const ITEMS: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard' },
  { href: '/api-keys', icon: KeyRound, labelKey: 'apiKeys' },
  { href: '/balance', icon: Coins, labelKey: 'balance' },
  { href: '/top-up', icon: CreditCard, labelKey: 'topUp' },
  { href: '/coupons', icon: Ticket, labelKey: 'coupons' },
  { href: '/pricing', icon: Tags, labelKey: 'pricing' },
  { href: '/api-explorer', icon: TerminalSquare, labelKey: 'apiExplorer' },
  { href: '/charges', icon: ScrollText, labelKey: 'charges' },
  { href: '/requests', icon: ListChecks, labelKey: 'requests' },
  { href: '/profile', icon: User, labelKey: 'profile' },
  { href: '/support', icon: Headphones, labelKey: 'support' },
  { href: '/docs/getting-started', icon: Gauge, labelKey: 'docs' },
];

export function SidebarNav() {
  const t = useTranslations('dashboard.nav');
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-3">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
