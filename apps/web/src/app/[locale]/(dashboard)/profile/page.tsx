import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function ProfilePage() {
  const t = await getTranslations('dashboard.stub');
  const session = await auth();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('profileTitle')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t('profileTitle')}</CardTitle>
          <CardDescription>{t('profileDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {session?.user.name ? (
            <div>
              <span className="font-medium">Name:</span> {session.user.name}
            </div>
          ) : null}
          <div>
            <span className="font-medium">Email:</span> {session?.user.email}
          </div>
          <div>
            <span className="font-medium">Role:</span> {session?.user.role ?? 'USER'}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
