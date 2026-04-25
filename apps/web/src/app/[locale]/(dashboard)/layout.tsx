import type { ReactNode } from 'react';
import { redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { SidebarNav } from '@/components/dashboard/SidebarNav';
import { UserMenu } from '@/components/dashboard/UserMenu';
import { Separator } from '@/components/ui/separator';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }
  const user = session!.user;

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <span className="text-sm font-semibold tracking-tight">AI API Aggregator</span>
        <UserMenu email={user.email} name={user.name} />
      </header>
      <div className="flex flex-1">
        <aside className="w-64 border-r bg-background">
          <SidebarNav />
        </aside>
        <main className="flex-1">
          <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
          <Separator className="opacity-0" />
        </main>
      </div>
    </div>
  );
}
