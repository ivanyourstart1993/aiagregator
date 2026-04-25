'use client';

import { useFormatter, useTranslations } from 'next-intl';
import type { ApiRequestDetailView } from '@/lib/server-api';
import { formatNanoUSDWithSign } from '@/lib/money';
import { ApiRequestStatusBadge } from './ApiRequestStatusBadge';
import { TaskStatusBadge } from './TaskStatusBadge';

interface Props {
  detail: ApiRequestDetailView;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value ?? '—'}</span>
    </div>
  );
}

export function ApiRequestDetail({ detail }: Props) {
  const t = useTranslations('requests.detail');
  const format = useFormatter();

  return (
    <div className="space-y-6">
      <section className="rounded-md border bg-background p-4">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('overview')}
        </h3>
        <Row label={t('id')} value={<span className="text-xs">{detail.id}</span>} />
        <Row
          label={t('method')}
          value={`${detail.providerCode}/${detail.modelCode}/${detail.methodCode}`}
        />
        <Row label={t('status')} value={<ApiRequestStatusBadge status={detail.status} />} />
        <Row
          label={t('taskStatus')}
          value={detail.taskStatus ? <TaskStatusBadge status={detail.taskStatus} /> : '—'}
        />
        <Row
          label={t('createdAt')}
          value={format.dateTime(new Date(detail.createdAt), 'medium')}
        />
        {detail.finalizedAt ? (
          <Row
            label={t('finalizedAt')}
            value={format.dateTime(new Date(detail.finalizedAt), 'medium')}
          />
        ) : null}
        {detail.callbackUrl ? <Row label={t('callbackUrl')} value={detail.callbackUrl} /> : null}
      </section>

      <section className="rounded-md border bg-background p-4">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('pricing')}
        </h3>
        <Row label={t('clientPrice')} value={formatNanoUSDWithSign(detail.clientPriceUnits)} />
        {detail.basePriceUnits ? (
          <Row label={t('basePrice')} value={formatNanoUSDWithSign(detail.basePriceUnits)} />
        ) : null}
        {detail.discountUnits ? (
          <Row label={t('discount')} value={formatNanoUSDWithSign(detail.discountUnits)} />
        ) : null}
        {detail.pricingSnapshotId ? (
          <Row label={t('pricingSnapshot')} value={<span className="text-xs">{detail.pricingSnapshotId}</span>} />
        ) : null}
        {detail.reservationId ? (
          <Row label={t('reservation')} value={<span className="text-xs">{detail.reservationId}</span>} />
        ) : null}
        {detail.couponId ? (
          <Row label={t('coupon')} value={<span className="text-xs">{detail.couponId}</span>} />
        ) : null}
      </section>

      {detail.errorCode ? (
        <section className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-destructive">
            {t('error')}
          </h3>
          <Row label={t('errorCode')} value={detail.errorCode} />
          {detail.errorMessage ? (
            <Row label={t('errorMessage')} value={<span className="font-sans">{detail.errorMessage}</span>} />
          ) : null}
        </section>
      ) : null}

      <section className="rounded-md border bg-background p-4">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('params')}
        </h3>
        <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(detail.paramsRaw ?? {}, null, 2)}
        </pre>
      </section>
    </div>
  );
}
