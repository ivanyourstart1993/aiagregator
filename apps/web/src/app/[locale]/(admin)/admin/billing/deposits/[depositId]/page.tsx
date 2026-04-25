import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type DepositDetail } from '@/lib/server-api';
import { DepositStatusBadge } from '@/components/dashboard/billing/DepositStatusBadge';
import { formatNanoToUSD } from '@/lib/money';

interface Props {
  params: Promise<{ depositId: string }>;
}

async function safeGet(id: string): Promise<DepositDetail | null> {
  try {
    return await serverApi.adminGetDeposit(id);
  } catch (err) {
    if (err instanceof ApiError) return null;
    return null;
  }
}

function formatJson(value: unknown): string {
  if (value == null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default async function AdminDepositDetailPage({ params }: Props) {
  const { depositId } = await params;
  const t = await getTranslations('admin.billing');
  const tCommon = await getTranslations('common');
  const tTopup = await getTranslations('topup');
  const format = await getFormatter();

  const deposit = await safeGet(depositId);
  if (!deposit) notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/billing/deposits">
            <ArrowLeft className="h-4 w-4" />
            {tCommon('back')}
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('depositTitle')}</h1>
            <p className="text-sm text-muted-foreground">{t('depositSubtitle')}</p>
          </div>
          <DepositStatusBadge status={deposit.status} />
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-semibold tracking-tight">
            ${formatNanoToUSD(deposit.amountUnits)}
          </CardTitle>
          <CardDescription className="font-mono text-xs">{deposit.id}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Field label="Provider">{deposit.provider}</Field>
          <Field label="User">{deposit.userEmail ?? deposit.userId ?? '—'}</Field>
          <Field label="External invoice ID">
            <code className="break-all text-xs">{deposit.externalInvoiceId ?? '—'}</code>
          </Field>
          <Field label="External order ID">
            <code className="break-all text-xs">{deposit.externalOrderId ?? '—'}</code>
          </Field>
          <Field label={tTopup('tableCreated')}>
            {format.dateTime(new Date(deposit.createdAt), 'short')}
          </Field>
          <Field label={tTopup('tableExpires')}>
            {deposit.expiresAt ? format.dateTime(new Date(deposit.expiresAt), 'short') : '—'}
          </Field>
          <Field label={tTopup('tablePaidAt')}>
            {deposit.paidAt ? format.dateTime(new Date(deposit.paidAt), 'short') : '—'}
          </Field>
          <Field label="Paid amount">
            {deposit.paidAmount ? `${deposit.paidAmount} ${deposit.paidCurrency ?? ''}` : '—'}
          </Field>
          <Field label="Tx ID">
            <code className="break-all text-xs">{deposit.txid ?? '—'}</code>
          </Field>
          <Field label="Coupon">{deposit.couponCode ?? '—'}</Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('rawCreatePayload')}</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
            {formatJson(deposit.rawCreatePayload) || '—'}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('rawWebhookPayloads')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {deposit.rawWebhookPayloads && deposit.rawWebhookPayloads.length > 0 ? (
            deposit.rawWebhookPayloads.map((payload, idx) => (
              <details key={idx} className="rounded-md border bg-muted/40">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Payload #{idx + 1}
                </summary>
                <pre className="max-h-96 overflow-auto p-3 font-mono text-xs">
                  {formatJson(payload)}
                </pre>
              </details>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t('noWebhookPayloads')}</p>
          )}
        </CardContent>
      </Card>
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
