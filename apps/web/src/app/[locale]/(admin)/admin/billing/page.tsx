import { CreditCard, Receipt } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type TransactionsPage } from '@/lib/server-api';
import { TransactionsTable } from '@/components/dashboard/billing/TransactionsTable';
import { formatNanoToUSD } from '@/lib/money';

const EMPTY_PAGE: TransactionsPage = { items: [], total: 0, page: 1, pageSize: 50 };

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function safeListTransactions(filters: Parameters<typeof serverApi.adminListTransactions>[0]): Promise<TransactionsPage> {
  try {
    return await serverApi.adminListTransactions(filters);
  } catch (err) {
    if (err instanceof ApiError) return EMPTY_PAGE;
    return EMPTY_PAGE;
  }
}

/**
 * Parse a nano-USD amount string (integer or decimal with up to 8 fractional digits)
 * back to a bigint of nano-USD units. Mirrors apps/web/src/lib/money parsing
 * but kept inline because the public helper formats only.
 */
function parseNanoUnits(s: string): bigint {
  const trimmed = s.trim();
  if (/^-?\d+$/.test(trimmed)) return BigInt(trimmed);
  const m = /^(-)?(\d+)(?:\.(\d{1,8}))?$/.exec(trimmed);
  if (!m) return 0n;
  const negative = m[1] === '-';
  const whole = m[2] ?? '0';
  const fracPadded = ((m[3] ?? '') + '00000000').slice(0, 8);
  const units = BigInt(whole) * 100_000_000n + BigInt(fracPadded);
  return negative ? -units : units;
}

function sumByType(items: TransactionsPage['items'], types: string[]): bigint {
  let total = 0n;
  for (const tx of items) {
    if (!types.includes(tx.type)) continue;
    total += parseNanoUnits(tx.amountUnits);
  }
  return total;
}

function formatTotalNano(units: bigint): string {
  // Convert absolute value to a decimal string with 6 fractional digits, then reuse the helper.
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / 100_000_000n;
  const frac = (abs % 100_000_000n).toString().padStart(8, '0').slice(0, 6);
  const s = `${negative ? '-' : ''}${whole.toString()}.${frac}`;
  return formatNanoToUSD(s);
}

export default async function AdminBillingPage() {
  const t = await getTranslations('admin.billing');
  const since = startOfTodayIso();
  const recent = await safeListTransactions({ page: 1, pageSize: 50 });
  const today = await safeListTransactions({ from: since, page: 1, pageSize: 200 });

  const credits = sumByType(today.items, ['DEPOSIT', 'BONUS_GRANT', 'REFUND', 'CORRECTION']);
  const debits = sumByType(today.items, ['DEBIT', 'RESERVATION_CAPTURE']);
  const deposits = sumByType(today.items, ['DEPOSIT']);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/billing/transactions">
              <Receipt className="h-4 w-4" />
              {t('transactionsTitle')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/billing/deposits">
              <CreditCard className="h-4 w-4" />
              {t('depositsTitle')}
            </Link>
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>{t('todayCredits')}</CardDescription>
            <CardTitle className="text-2xl font-semibold">${formatTotalNano(credits)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t('todayDebits')}</CardDescription>
            <CardTitle className="text-2xl font-semibold">${formatTotalNano(debits)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t('todayDeposits')}</CardDescription>
            <CardTitle className="text-2xl font-semibold">${formatTotalNano(deposits)}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('transactionsTitle')}</CardTitle>
            <CardDescription>{t('transactionsSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <TransactionsTable initialPage={recent} scope="admin" showUserId />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
