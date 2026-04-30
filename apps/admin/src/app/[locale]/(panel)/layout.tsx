import type { ReactNode } from 'react';
import { redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { SidebarShell } from '@/components/SidebarShell';

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

  return <SidebarShell user={userView}>{children}</SidebarShell>;
}
