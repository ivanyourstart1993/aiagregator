import { Wallet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi } from '@/lib/server-api';
import { formatNanoToUSD } from '@/lib/money';

async function safeBalance() {
  try {
    return await serverApi.getBalance();
  } catch (err) {
    if (err instanceof ApiError) return null;
    return null;
  }
}

export async function HeaderBalance() {
  const [balance, t] = await Promise.all([safeBalance(), getTranslations('dashboard')]);
  if (!balance) return null;

  const usd = formatNanoToUSD(balance.available);
  const isZero = balance.available === '0' || balance.available === '0.000000';
  const href = isZero ? '/top-up/new' : '/balance';
  const label = isZero ? t('topUpCta') : t('balanceCard');

  return (
    <Link
      href={href}
      title={label}
      className={
        'group hidden items-center gap-1.5 rounded-md border border-border/60 bg-card/40 px-2.5 py-1 text-xs font-medium tracking-tight transition hover:border-info/50 hover:bg-info/5 sm:inline-flex ' +
        (isZero ? 'text-warning' : 'text-foreground')
      }
    >
      <Wallet className="h-3.5 w-3.5 opacity-70" />
      <span className="tabular-nums">${usd}</span>
    </Link>
  );
}
