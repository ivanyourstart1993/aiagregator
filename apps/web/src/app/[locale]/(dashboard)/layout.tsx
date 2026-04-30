import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { Link } from '@/i18n/navigation';
import { SidebarNav } from '@/components/dashboard/SidebarNav';
import { UserMenu } from '@/components/dashboard/UserMenu';
import { LocaleSwitcher } from '@/components/dashboard/LocaleSwitcher';
import { MobileSidebar } from '@/components/dashboard/MobileSidebar';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }
  const user = session!.user;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 border-r border-border/60 bg-card/40 md:flex md:flex-col">
        <Link
          href="/dashboard"
          className="flex h-14 items-center gap-2 border-b border-border/60 px-5 text-sm font-semibold tracking-tight"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-info/15 text-info">
            <Sparkles className="h-4 w-4" />
          </span>
          Aigenway
        </Link>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border/60 bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
          <div className="flex items-center gap-2">
            <MobileSidebar />
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-sm font-semibold tracking-tight md:hidden"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-info/15 text-info">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              Aigenway
            </Link>
          </div>
          <div className="flex items-center gap-1">
            <LocaleSwitcher />
            <UserMenu email={user.email} name={user.name} />
          </div>
        </header>
        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
