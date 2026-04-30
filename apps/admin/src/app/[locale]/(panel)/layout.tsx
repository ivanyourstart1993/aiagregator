import type { ReactNode } from 'react';
import { redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
    return null;
  }
  const user = session.user;
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    redirect('/login');
    return null;
  }
  const userView = { email: user.email ?? '', name: user.name ?? null };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
        <Header user={userView} />
        <main className="flex-1 overflow-x-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
