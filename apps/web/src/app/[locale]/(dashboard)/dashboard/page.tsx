import {
  BookOpen,
  CheckCircle2,
  KeyRound,
  Plus,
  Tags,
  TerminalSquare,
  Wallet,
} from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import {
  ApiError,
  serverApi,
  type ApiKeyView,
  type ApiRequestsPage,
  type BalanceView,
  type TariffSummary,
  type TransactionsPage,
} from '@/lib/server-api';
import { formatNanoToUSD } from '@/lib/money';
import { StatCard } from '@/components/dashboard/home/StatCard';
import { QuickActions, type QuickAction } from '@/components/dashboard/home/QuickActions';
import { RecentRequests } from '@/components/dashboard/home/RecentRequests';
import { RecentTransactions } from '@/components/dashboard/home/RecentTransactions';

const EMPTY_BALANCE: BalanceView = {
  available: '0',
  reserved: '0',
  total: '0',
  bonusAvailable: '0',
  currency: 'USD',
};
const EMPTY_REQUESTS: ApiRequestsPage = { items: [], total: 0, page: 1, pageSize: 5 };
const EMPTY_TXNS: TransactionsPage = { items: [], total: 0, page: 1, pageSize: 5 };

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return fallback;
    return fallback;
  }
}

export default async function DashboardHomePage() {
  try {
    return await renderDashboardHome();
  } catch (err) {
    // TEMP DIAGNOSTIC — render the actual error so we can see what's
    // crashing the user dashboard in prod. Remove once debugged.
    const e = err instanceof Error ? err : new Error(String(err));
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-xl font-semibold text-destructive">Dashboard render error</h1>
        <pre className="overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-4 text-xs">
{`${e.name}: ${e.message}\n\n${e.stack ?? '(no stack)'}`}
        </pre>
      </div>
    );
  }
}

async function renderDashboardHome() {
  const t = await getTranslations('dashboard');
  const format = await getFormatter();
  const session = await auth();
  const greeting = session?.user.name?.trim() || session?.user.email?.split('@')[0] || '';

  const [balance, requests, txns, keys, tariff] = await Promise.all([
    safe(() => serverApi.getBalance(), EMPTY_BALANCE),
    safe(
      () => serverApi.listApiRequests({ page: 1, pageSize: 5 }),
      EMPTY_REQUESTS,
    ),
    safe(
      () => serverApi.listTransactions({ page: 1, pageSize: 5 }),
      EMPTY_TXNS,
    ),
    safe<ApiKeyView[]>(() => serverApi.listApiKeys(), []),
    safe<TariffSummary | null>(() => serverApi.getMyTariff(), null),
  ]);

  const activeKeys = keys.filter((k) => k.status === 'ACTIVE').length;
  const balanceUsd = formatNanoToUSD(balance.available);
  const balanceIsZero = balance.available === '0' || balance.available === '0.000000';
  const noKeys = activeKeys === 0;
  const tariffName = tariff?.name ?? t('default');

  const quickActions: QuickAction[] = [
    noKeys
      ? {
          href: '/api-keys',
          icon: KeyRound,
          title: t('quick.createKey.title'),
          description: t('quick.createKey.description'),
          primary: true,
        }
      : {
          href: '/api-keys',
          icon: KeyRound,
          title: t('quick.manageKeys.title'),
          description: t('quick.manageKeys.description'),
        },
    balanceIsZero
      ? {
          href: '/top-up/new',
          icon: Plus,
          title: t('quick.topUp.title'),
          description: t('quick.topUp.description'),
          primary: !noKeys,
        }
      : {
          href: '/balance',
          icon: Wallet,
          title: t('quick.balance.title'),
          description: t('quick.balance.description'),
        },
    {
      href: '/api-explorer',
      icon: TerminalSquare,
      title: t('quick.explorer.title'),
      description: t('quick.explorer.description'),
    },
    {
      href: '/docs/getting-started',
      icon: BookOpen,
      title: t('quick.docs.title'),
      description: t('quick.docs.description'),
    },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {greeting ? t('welcomeNamed', { name: greeting }) : t('welcome')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('summary')}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('balanceCard')}
          value={`$${balanceUsd}`}
          hint={
            balanceIsZero
              ? t('balanceHintEmpty')
              : t('balanceHint', { reserved: formatNanoToUSD(balance.reserved) })
          }
          icon={Wallet}
          tone={balanceIsZero ? 'warning' : 'success'}
          href="/balance"
          ctaLabel={balanceIsZero ? t('topUpCta') : undefined}
        />
        <StatCard
          title={t('requestsCard')}
          value={format.number(requests.total)}
          hint={
            requests.total === 0
              ? t('requestsHintEmpty')
              : t('requestsHint', { count: requests.items.length })
          }
          icon={CheckCircle2}
          tone="info"
          href="/requests"
        />
        <StatCard
          title={t('keysCard')}
          value={String(activeKeys)}
          hint={
            noKeys
              ? t('keysHintEmpty')
              : t('keysHint', { total: keys.length })
          }
          icon={KeyRound}
          tone={noKeys ? 'warning' : 'default'}
          href="/api-keys"
          ctaLabel={noKeys ? t('createKeyCta') : undefined}
        />
        <StatCard
          title={t('tariffCard')}
          value={tariffName}
          hint={tariff?.isDefault ? t('tariffHintDefault') : t('tariffHintCustom')}
          icon={Tags}
          href="/pricing"
        />
      </div>

      <QuickActions title={t('quickActionsTitle')} actions={quickActions} />

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentRequests items={requests.items} />
        <RecentTransactions items={txns.items} />
      </div>
    </div>
  );
}
