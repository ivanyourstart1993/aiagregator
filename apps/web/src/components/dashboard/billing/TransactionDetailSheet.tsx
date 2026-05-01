'use client';

import { useFormatter, useTranslations } from 'next-intl';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { TransactionTypeBadge } from './TransactionTypeBadge';
import { Badge } from '@/components/ui/badge';
import { formatNanoToUSD } from '@/lib/money';
import type { TransactionView } from '@/lib/server-api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tx: TransactionView | null;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function TransactionDetailSheet({ open, onOpenChange, tx }: Props) {
  const t = useTranslations('billing');
  const tStatus = useTranslations('billing.status');
  const format = useFormatter();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t('detailTitle')}</SheetTitle>
          {tx ? <SheetDescription>{tx.id}</SheetDescription> : null}
        </SheetHeader>
        {tx ? (
          <div className="mt-6 space-y-4 text-sm">
            <DetailRow label={t('detailType')}>
              <TransactionTypeBadge type={tx.type} />
            </DetailRow>
            <DetailRow label={t('detailStatus')}>
              <Badge variant="outline">{tStatus(tx.status)}</Badge>
            </DetailRow>
            <DetailRow label={t('detailAmount')}>
              <span
                className={
                  Number(tx.amountUnits) >= 0
                    ? 'font-mono text-emerald-600'
                    : 'font-mono text-rose-600'
                }
              >
                {Number(tx.amountUnits) >= 0 ? '+' : ''}
                {formatNanoToUSD(tx.amountUnits)} USD
              </span>
            </DetailRow>
            <DetailRow label={t('detailBalance')}>
              <span className="font-mono">${formatNanoToUSD(tx.balanceAfterUnits)}</span>
            </DetailRow>
            {tx.description ? (
              <DetailRow label={t('detailDescription')}>{tx.description}</DetailRow>
            ) : null}
            <DetailRow label={t('detailCreated')}>
              {format.dateTime(new Date(tx.createdAt), 'short')}
            </DetailRow>
            {(tx.depositId ||
              tx.reservationId ||
              tx.taskId ||
              tx.bundleKey ||
              tx.parentTransactionId) && (
              <div className="border-t pt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('detailLinks')}
                </h4>
                <div className="space-y-2">
                  {tx.depositId ? (
                    <DetailRow label={t('linkDeposit')}>
                      <code className="text-xs">{tx.depositId}</code>
                    </DetailRow>
                  ) : null}
                  {tx.reservationId ? (
                    <DetailRow label={t('linkReservation')}>
                      <code className="text-xs">{tx.reservationId}</code>
                    </DetailRow>
                  ) : null}
                  {tx.taskId ? (
                    <DetailRow label={t('linkTask')}>
                      <code className="text-xs">{tx.taskId}</code>
                    </DetailRow>
                  ) : null}
                  {tx.bundleKey ? (
                    <DetailRow label={t('linkBundle')}>
                      <code className="break-all text-xs">{tx.bundleKey}</code>
                    </DetailRow>
                  ) : null}
                  {tx.parentTransactionId ? (
                    <DetailRow label={t('linkParent')}>
                      <code className="text-xs">{tx.parentTransactionId}</code>
                    </DetailRow>
                  ) : null}
                </div>
              </div>
            )}
            {tx.metadata && Object.keys(tx.metadata).length > 0 ? (
              <div className="border-t pt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('detailMetadata')}
                </h4>
                <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
                  {safeStringify(tx.metadata)}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="col-span-2 break-all">{children}</div>
    </div>
  );
}
