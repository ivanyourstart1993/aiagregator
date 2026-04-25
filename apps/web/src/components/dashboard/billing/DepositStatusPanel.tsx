'use client';

import { CheckCircle2, ExternalLink, RefreshCw, XCircle } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { fetchDepositAction } from '@/app/[locale]/(dashboard)/top-up/actions';
import type { DepositView } from '@/lib/server-api';
import { formatNanoToUSD } from '@/lib/money';
import { DepositStatusBadge } from './DepositStatusBadge';

interface Props {
  initialDeposit: DepositView;
}

const POLL_INTERVAL_MS = 5_000;

function isPolling(status: DepositView['status']): boolean {
  return status === 'CREATED' || status === 'PENDING_PAYMENT';
}

function diffSeconds(target: string | null | undefined): number {
  if (!target) return 0;
  return Math.max(0, Math.floor((new Date(target).getTime() - Date.now()) / 1000));
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function DepositStatusPanel({ initialDeposit }: Props) {
  const t = useTranslations('topup');
  const format = useFormatter();
  const [deposit, setDeposit] = useState<DepositView>(initialDeposit);
  const [now, setNow] = useState(() => Date.now());

  const polling = isPolling(deposit.status);

  useEffect(() => {
    if (!polling) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [polling]);

  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const res = await fetchDepositAction(deposit.id);
      if (!cancelled && res.ok && res.deposit) {
        setDeposit(res.deposit);
      }
      if (!cancelled && res.ok && res.deposit && isPolling(res.deposit.status)) {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }
    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deposit.id, polling]);

  const expiresInSec = useMemo(() => diffSeconds(deposit.expiresAt), [deposit.expiresAt, now]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-3xl font-semibold tracking-tight">
                ${formatNanoToUSD(deposit.amountUnits)}
              </CardTitle>
              <CardDescription className="mt-1 font-mono text-xs">{deposit.id}</CardDescription>
            </div>
            <DepositStatusBadge status={deposit.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {deposit.status === 'PENDING_PAYMENT' || deposit.status === 'CREATED' ? (
            <>
              <p className="text-sm text-muted-foreground">{t('scanOrClick')}</p>
              {deposit.payUrl ? (
                <Button asChild size="lg">
                  <a href={deposit.payUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    {t('payNow')}
                  </a>
                </Button>
              ) : null}
              {deposit.expiresAt ? (
                <p className="text-sm text-muted-foreground">
                  {t('expiresIn')}: <span className="font-mono">{formatCountdown(expiresInSec)}</span>{' '}
                  <span className="text-xs">
                    ({format.dateTime(new Date(deposit.expiresAt), 'short')})
                  </span>
                </p>
              ) : null}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>polling…</span>
              </div>
            </>
          ) : null}

          {deposit.status === 'PAID' ? (
            <div className="space-y-3 rounded-md border border-emerald-500/50 bg-emerald-500/10 p-4">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                <p className="font-semibold">{t('successTitle')}</p>
              </div>
              <p className="text-sm">{t('successBody')}</p>
              {deposit.paidAt ? (
                <p className="text-xs text-muted-foreground">
                  {t('paidAt')}: {format.dateTime(new Date(deposit.paidAt), 'short')}
                </p>
              ) : null}
              <Button asChild>
                <Link href="/balance">{t('viewBalance')}</Link>
              </Button>
            </div>
          ) : null}

          {deposit.status === 'FAILED' ? (
            <div className="space-y-3 rounded-md border border-rose-500/50 bg-rose-500/10 p-4">
              <div className="flex items-center gap-2 text-rose-700">
                <XCircle className="h-5 w-5" />
                <p className="font-semibold">{t('failedTitle')}</p>
              </div>
              <p className="text-sm">{t('failedBody')}</p>
              <Button asChild>
                <Link href="/top-up/new">{t('retry')}</Link>
              </Button>
            </div>
          ) : null}

          {deposit.status === 'EXPIRED' ? (
            <div className="space-y-3 rounded-md border border-muted-foreground/30 bg-muted p-4">
              <p className="font-semibold">{t('expiredTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('expiredBody')}</p>
              <Button asChild>
                <Link href="/top-up/new">{t('retry')}</Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
