'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { SidebarFull } from './Sidebar';
import { Breadcrumbs } from './Breadcrumbs';
import { UserMenu } from './UserMenu';

interface Props {
  user: { email: string; name?: string | null };
}

export function Header({ user }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-sm md:px-6">
      {/* Mobile burger */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetTrigger
          aria-label="Open navigation"
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground md:hidden"
        >
          <Menu className="h-4 w-4" />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex h-14 items-center gap-2 border-b border-border px-5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              AI
            </div>
            <span className="text-sm font-semibold">Panel</span>
          </div>
          <SidebarFull onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 overflow-hidden">
        <Breadcrumbs />
      </div>

      <UserMenu user={user} />
    </header>
  );
}
