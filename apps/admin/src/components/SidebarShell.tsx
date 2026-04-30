'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Sidebar, SidebarFull } from './Sidebar';
import { Breadcrumbs } from './Breadcrumbs';
import { UserMenu } from './UserMenu';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'admin-sidebar-collapsed';

interface Props {
  user: { email: string; name?: string | null };
  children: ReactNode;
}

/**
 * Shared shell for the panel app. Owns the desktop sidebar expanded/
 * collapsed state and the mobile drawer state. Renders both the sidebar
 * and the header so the toggle button (in the header) can drive width
 * without prop-drilling or context.
 *
 * Default = expanded. Persists "collapsed" choice in localStorage; an
 * unset key means expanded.
 */
export function SidebarShell({ user, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') setCollapsed(true);
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar collapsed={collapsed && hydrated} />
      <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card/80 px-3 backdrop-blur-sm md:px-4">
          {/* Mobile burger → drawer */}
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger
              aria-label="Открыть меню"
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

          {/* Desktop sidebar toggle */}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            className={cn(
              'hidden h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground md:flex',
            )}
          >
            {collapsed && hydrated ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <Breadcrumbs />
          </div>

          <UserMenu user={user} />
        </header>

        <main className="flex-1 overflow-x-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
