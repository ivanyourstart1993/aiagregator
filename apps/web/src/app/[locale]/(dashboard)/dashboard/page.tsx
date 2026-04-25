import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function DashboardHomePage() {
  const t = await getTranslations('dashboard');
  const session = await auth();
  const greeting = session?.user.name?.trim() || session?.user.email || '';

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('welcome')}
          {greeting ? `, ${greeting}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground">{t('summary')}</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t('balanceCard')} value="$0.00" />
        <StatCard title={t('requestsCard')} value="0" />
        <StatCard title={t('successRateCard')} value="—" />
        <StatCard title={t('tariffCard')} value={t('default')} />
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs uppercase tracking-wide">{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
