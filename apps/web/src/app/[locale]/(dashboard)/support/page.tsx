import { getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { SupportForm } from '@/components/support/SupportForm';

export default async function SupportPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const t = await getTranslations('support');
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </header>
      <SupportForm
        email={session.user.email ?? ''}
        name={session.user.name ?? ''}
      />
    </div>
  );
}
