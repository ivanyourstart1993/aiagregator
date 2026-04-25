import { getTranslations } from 'next-intl/server';
import { StubPage } from '@/components/dashboard/StubPage';

export default async function SupportPage() {
  const t = await getTranslations('dashboard.stub');
  return <StubPage title={t('supportTitle')} description={t('supportDescription')} />;
}
