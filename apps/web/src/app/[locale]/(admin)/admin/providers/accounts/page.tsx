import { Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import {
  ApiError,
  serverApi,
  type ProviderAccountStatus,
  type ProviderAccountView,
  type ProviderAdminView,
} from '@/lib/server-api';
import { AccountsTable } from '@/components/admin/providers/AccountsTable';

interface Props {
  searchParams: Promise<{ providerId?: string; status?: string }>;
}

const STATUSES: ProviderAccountStatus[] = ['ACTIVE', 'DISABLED', 'BROKEN', 'EXHAUSTED'];

async function safeProviders(): Promise<ProviderAdminView[]> {
  try {
    return await serverApi.adminListProviders();
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

async function safeAccounts(filters: {
  providerId?: string;
  status?: ProviderAccountStatus;
}): Promise<ProviderAccountView[]> {
  try {
    const data = await serverApi.adminListProviderAccounts({ ...filters, pageSize: 200 });
    return data.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function AdminProviderAccountsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const t = await getTranslations('admin.providers.accounts');
  const tCommon = await getTranslations('common');
  const [providers, accounts] = await Promise.all([
    safeProviders(),
    safeAccounts({
      providerId: sp.providerId || undefined,
      status: STATUSES.includes(sp.status as ProviderAccountStatus)
        ? (sp.status as ProviderAccountStatus)
        : undefined,
    }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button asChild>
          <Link href="/admin/providers/accounts/new">
            <Plus className="h-4 w-4" />
            {t('newCta')}
          </Link>
        </Button>
      </header>

      <form className="grid grid-cols-1 gap-2 sm:grid-cols-3" action="">
        <select
          name="providerId"
          defaultValue={sp.providerId ?? ''}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t('filterAllProviders')}</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.publicName}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={sp.status ?? ''}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t('filterAllStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {tCommon('apply')}
        </Button>
      </form>

      <AccountsTable items={accounts} />
    </div>
  );
}
