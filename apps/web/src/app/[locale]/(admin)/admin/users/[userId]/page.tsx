import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Link } from '@/i18n/navigation';
import {
  ApiError,
  serverApi,
  type AdminUserSummary,
  type BundleView,
  type DepositView,
  type TariffSummary,
  type TransactionsPage,
  type UserBundlePriceView,
  type WalletDetail,
} from '@/lib/server-api';
import { WalletPanel } from '@/components/admin/billing/WalletPanel';
import { TransactionsTable } from '@/components/dashboard/billing/TransactionsTable';
import { DepositsTable } from '@/components/admin/billing/DepositsTable';
import { AssignTariffPanel } from '@/components/admin/pricing/AssignTariffPanel';
import { UserBundlePricesTable } from '@/components/admin/pricing/UserBundlePricesTable';

interface Props {
  params: Promise<{ userId: string }>;
}

const EMPTY_PAGE: TransactionsPage = { items: [], total: 0, page: 1, pageSize: 20 };

async function safeUser(id: string): Promise<AdminUserSummary | null> {
  try {
    return await serverApi.adminGetUser(id);
  } catch (err) {
    if (err instanceof ApiError) return null;
    return null;
  }
}

async function safeWallet(id: string): Promise<WalletDetail | null> {
  try {
    return await serverApi.adminGetWallet(id);
  } catch (err) {
    if (err instanceof ApiError) return null;
    return null;
  }
}

async function safeTransactions(id: string): Promise<TransactionsPage> {
  try {
    return await serverApi.adminListTransactions({ userId: id, page: 1, pageSize: 20 });
  } catch (err) {
    if (err instanceof ApiError) return EMPTY_PAGE;
    return EMPTY_PAGE;
  }
}

async function safeTariffs(): Promise<TariffSummary[]> {
  try {
    const data = await serverApi.adminListTariffs({ pageSize: 100 });
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

async function safeUserBundlePrices(id: string): Promise<UserBundlePriceView[]> {
  try {
    return await serverApi.adminListUserBundlePrices(id);
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

async function safeBundles(): Promise<BundleView[]> {
  try {
    const data = await serverApi.adminListBundles({ active: true, pageSize: 500 });
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

async function safeDeposits(id: string): Promise<DepositView[]> {
  try {
    const data = await serverApi.adminListDeposits({ userId: id, page: 1, pageSize: 20 });
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function AdminUserPage({ params }: Props) {
  const { userId } = await params;
  const t = await getTranslations('admin.billing.userPanel');
  const tCommon = await getTranslations('common');
  const format = await getFormatter();

  const [user, wallet, txs, deposits, tariffs, userBundlePrices, bundles] = await Promise.all([
    safeUser(userId),
    safeWallet(userId),
    safeTransactions(userId),
    safeDeposits(userId),
    safeTariffs(),
    safeUserBundlePrices(userId),
    safeBundles(),
  ]);
  if (!user) notFound();

  // Best-effort: identify current tariff. Backend doesn't expose this on the user
  // summary, so we leave it null; admins still see the assignment combobox.
  const currentTariff: TariffSummary | null = null;

  const fallbackWallet: WalletDetail = wallet ?? {
    userId,
    available: '0',
    reserved: '0',
    total: '0',
    bonusAvailable: '0',
    currency: 'USD',
    reservations: [],
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/users">
            <ArrowLeft className="h-4 w-4" />
            {tCommon('back')}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{user.email}</h1>
        <p className="text-sm text-muted-foreground">
          {user.name ?? '—'} • {user.role}
        </p>
      </header>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('tabOverview')}</TabsTrigger>
          <TabsTrigger value="wallet">{t('tabWallet')}</TabsTrigger>
          <TabsTrigger value="transactions">{t('tabTransactions')}</TabsTrigger>
          <TabsTrigger value="deposits">{t('tabDeposits')}</TabsTrigger>
          <TabsTrigger value="pricing">{t('tabPricing')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{user.email}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <Field label={t('overviewEmail')}>{user.email}</Field>
              <Field label={t('overviewName')}>{user.name ?? '—'}</Field>
              <Field label={t('overviewRole')}>{user.role}</Field>
              <Field label={t('overviewStatus')}>{user.status}</Field>
              <Field label={t('overviewVerified')}>
                {user.emailVerified ? format.dateTime(new Date(user.emailVerified), 'short') : '—'}
              </Field>
              <Field label={t('overviewCreated')}>
                {format.dateTime(new Date(user.createdAt), 'short')}
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallet" className="mt-6">
          <WalletPanel userId={userId} wallet={fallbackWallet} />
        </TabsContent>

        <TabsContent value="transactions" className="mt-6">
          <TransactionsTable
            initialPage={txs}
            scope="admin"
            forcedUserId={userId}
            showUserId={false}
          />
        </TabsContent>

        <TabsContent value="deposits" className="mt-6">
          <DepositsTable deposits={deposits} />
        </TabsContent>

        <TabsContent value="pricing" className="mt-6 space-y-6">
          <AssignTariffPanel userId={userId} tariffs={tariffs} currentTariff={currentTariff} />
          <UserBundlePricesTable
            userId={userId}
            prices={userBundlePrices}
            bundles={bundles}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="break-all">{children}</div>
    </div>
  );
}
