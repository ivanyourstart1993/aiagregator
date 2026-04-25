import { getTranslations } from 'next-intl/server';
import { ErrorCode } from '@aiagg/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const ERROR_GROUPS: Array<{ titleKey: string; codes: string[] }> = [
  {
    titleKey: 'errorsGroupAuth',
    codes: [ErrorCode.INVALID_API_KEY, ErrorCode.USER_BLOCKED, ErrorCode.EMAIL_NOT_VERIFIED],
  },
  {
    titleKey: 'errorsGroupBilling',
    codes: [
      ErrorCode.INSUFFICIENT_BALANCE,
      ErrorCode.PRICE_NOT_CONFIGURED,
      ErrorCode.PROVIDER_RATE_CARD_NOT_CONFIGURED,
    ],
  },
  {
    titleKey: 'errorsGroupCatalog',
    codes: [
      ErrorCode.UNSUPPORTED_PROVIDER,
      ErrorCode.UNSUPPORTED_MODEL,
      ErrorCode.UNSUPPORTED_METHOD,
      ErrorCode.METHOD_NOT_AVAILABLE_FOR_USER,
      ErrorCode.PROVIDER_UNAVAILABLE,
      ErrorCode.MODEL_UNAVAILABLE,
      ErrorCode.METHOD_UNAVAILABLE,
    ],
  },
  {
    titleKey: 'errorsGroupTasks',
    codes: [
      ErrorCode.TASK_NOT_FOUND,
      ErrorCode.TASK_NOT_OWNED,
      ErrorCode.TASK_EXPIRED,
      ErrorCode.TASK_FAILED,
      ErrorCode.TASK_TIMED_OUT,
    ],
  },
  {
    titleKey: 'errorsGroupRequest',
    codes: [
      ErrorCode.INVALID_REQUEST,
      ErrorCode.INVALID_PARAMETERS,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      ErrorCode.IDEMPOTENCY_KEY_IN_USE,
      ErrorCode.IDEMPOTENCY_KEY_MISMATCH,
    ],
  },
  {
    titleKey: 'errorsGroupCoupons',
    codes: [ErrorCode.COUPON_INVALID, ErrorCode.COUPON_EXPIRED, ErrorCode.COUPON_ALREADY_USED],
  },
  {
    titleKey: 'errorsGroupGeneric',
    codes: [ErrorCode.INTERNAL_ERROR],
  },
];

export default async function ErrorsPage() {
  const t = await getTranslations('docs');
  return (
    <article className="prose max-w-none space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">{t('errorsTitle')}</h1>
      <p className="text-muted-foreground">{t('errorsBody')}</p>

      <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
        <code>{`{
  "success": false,
  "error": {
    "code": "insufficient_balance",
    "message": "Wallet balance is below required amount.",
    "details": { "requiredCents": 1500, "availableCents": 800 },
    "request_id": "req_..."
  }
}`}</code>
      </pre>

      {ERROR_GROUPS.map((group) => (
        <section key={group.titleKey} className="space-y-3">
          <h2 className="text-xl font-semibold">{t(group.titleKey)}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('errorsTableCode')}</TableHead>
                <TableHead>{t('errorsTableMeaning')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.codes.map((code) => (
                <TableRow key={code}>
                  <TableCell className="font-mono text-xs">{code}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t(`errorsCode.${code}`)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ))}
    </article>
  );
}
