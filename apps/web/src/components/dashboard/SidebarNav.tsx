'use client';

import {
  Coins,
  CreditCard,
  Download,
  Headphones,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Tags,
  TerminalSquare,
  Ticket,
  User,
  BookOpen,
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
  | 'exports'
  | 'profile'
  | 'support'
  | 'docs';

type SectionLabel = 'workspace' | 'billing' | 'activity' | 'account';

interface NavItem {
  href: string;
  icon: LucideIcon;
  labelKey: NavLabel;
}

interface NavSection {
  labelKey: SectionLabel;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    labelKey: 'workspace',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard' },
      { href: '/api-keys', icon: KeyRound, labelKey: 'apiKeys' },
      { href: '/api-explorer', icon: TerminalSquare, labelKey: 'apiExplorer' },
      { href: '/docs/getting-started', icon: BookOpen, labelKey: 'docs' },
    ],
  },
  {
    labelKey: 'billing',
    items: [
      { href: '/balance', icon: Coins, labelKey: 'balance' },
      { href: '/top-up', icon: CreditCard, labelKey: 'topUp' },
      { href: '/coupons', icon: Ticket, labelKey: 'coupons' },
      { href: '/pricing', icon: Tags, labelKey: 'pricing' },
    ],
  },
  {
    labelKey: 'activity',
    items: [
      { href: '/requests', icon: ListChecks, labelKey: 'requests' },
      { href: '/charges', icon: ScrollText, labelKey: 'charges' },
      { href: '/exports', icon: Download, labelKey: 'exports' },
    ],
  },
  {
    labelKey: 'account',
    items: [
      { href: '/profile', icon: User, labelKey: 'profile' },
      { href: '/support', icon: Headphones, labelKey: 'support' },
    ],
  },
];

export function SidebarNav() {
  const t = useTranslations('dashboard.nav');
  const tSection = useTranslations('dashboard.navSection');
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5 p-3">
      {SECTIONS.map((section) => (
        <div key={section.labelKey} className="flex flex-col gap-0.5">
          <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {tSection(section.labelKey)}
          </div>
          {section.items.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                <Icon className={cn('h-4 w-4', isActive ? 'text-foreground' : '')} />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
