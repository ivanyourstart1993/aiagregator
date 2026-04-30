'use client';

import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { usePathname } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { SidebarNav } from './SidebarNav';

export function MobileSidebar() {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('open')}>
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <div className="flex h-12 items-center border-b border-border/60 px-4 text-sm font-semibold">
          AI API Aggregator
        </div>
        <SidebarNav />
      </SheetContent>
    </Sheet>
  );
}
