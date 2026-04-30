'use client';

import { LogOut, User as UserIcon } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function UserMenu({
  user,
}: {
  user: { email: string; name?: string | null };
}) {
  const t = useTranslations('nav');
  const initial =
    (user.name ?? user.email).trim().charAt(0).toUpperCase() || '?';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-8 items-center gap-2 rounded-full border border-border bg-card pl-1 pr-3 text-sm transition-colors hover:bg-accent/50"
        aria-label="User menu"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
          {initial}
        </div>
        <span className="max-w-[160px] truncate text-xs text-muted-foreground">
          {user.email}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col">
            <span className="truncate text-sm font-medium">
              {user.name ?? '—'}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="text-xs">
          <UserIcon className="mr-2 h-3.5 w-3.5" />
          {t('profile') ?? 'Профиль'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-xs"
        >
          <LogOut className="mr-2 h-3.5 w-3.5" />
          {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
