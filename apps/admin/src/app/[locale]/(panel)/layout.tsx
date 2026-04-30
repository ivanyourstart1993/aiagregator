import type { ReactNode } from 'react';
import { redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';

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

  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ email: user.email ?? '', name: user.name ?? null }} />
      <main className="flex-1 overflow-x-auto">
        <div className="mx-auto w-full max-w-7xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
