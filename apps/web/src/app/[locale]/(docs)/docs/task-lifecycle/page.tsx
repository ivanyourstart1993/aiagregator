import { getTranslations } from 'next-intl/server';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const SUCCESS_RESPONSE = `{
  "id": "cmomwuy0m000qbr0371src20a",
  "status": "SUCCEEDED",
  "mode": "ASYNC",
  "started_at":  "2026-05-01T12:50:33.671Z",
  "finished_at": "2026-05-01T12:50:51.831Z",
  "result": {
    "type": "image",
    "url": "https://api.aigenway.com/v1/files/results/<userId>/<taskId>/image_0-....png",
    "mime_type": "image/png",
    "available_until": "2026-05-31T12:50:51.831Z",
    "files": [ /* same shape, repeated for multi-image methods */ ]
  }
}`;

const FAILURE_RESPONSE = `{
  "id": "cmomv0k9g000e5v03epq70stm",
  "status": "FAILED",
  "error_code": "provider_outage",
  "error_message": "No provider capacity is available for this method right now. Please retry shortly."
}`;

export default async function TaskLifecyclePage() {
  const t = await getTranslations('docs');
  const states: { code: string; descKey: string }[] = [
    { code: 'PENDING', descKey: 'taskLifecycleStatePending' },
    { code: 'PROCESSING', descKey: 'taskLifecycleStateProcessing' },
    { code: 'SUCCEEDED', descKey: 'taskLifecycleStateSucceeded' },
    { code: 'FAILED', descKey: 'taskLifecycleStateFailed' },
    { code: 'CANCELLED', descKey: 'taskLifecycleStateCancelled' },
  ];

  return (
    <article className="prose max-w-none space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('taskLifecycleTitle')}</h1>
      <p className="text-muted-foreground">{t('taskLifecycleBody')}</p>

      <h2 className="mt-8 text-xl font-semibold">{t('taskLifecycleStatesSection')}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('errorsTableCode')}</TableHead>
            <TableHead>{t('errorsTableMeaning')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {states.map((s) => (
            <TableRow key={s.code}>
              <TableCell className="font-mono text-xs">{s.code}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {t(s.descKey)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <h2 className="mt-8 text-xl font-semibold">{t('taskLifecyclePollingSection')}</h2>
      <p className="text-sm">{t('taskLifecyclePollingBody')}</p>
      <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
        <code>{`GET https://api.aigenway.com/v1/tasks/<task_id>
Authorization: Bearer sk_live_...`}</code>
      </pre>
      <ul className="ml-4 list-disc space-y-1 text-sm">
        <li>{t('taskLifecyclePollAdvice1')}</li>
        <li>{t('taskLifecyclePollAdvice2')}</li>
        <li>{t('taskLifecyclePollAdvice3')}</li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">{t('taskLifecycleSuccessSection')}</h2>
      <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
        <code>{SUCCESS_RESPONSE}</code>
      </pre>
      <ul className="ml-4 list-disc space-y-1 text-sm">
        <li>{t('taskLifecycleSuccessUrlNote')}</li>
        <li>{t('taskLifecycleSuccessFilesNote')}</li>
        <li>{t('taskLifecycleSuccessExpiryNote')}</li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">{t('taskLifecycleFailureSection')}</h2>
      <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs">
        <code>{FAILURE_RESPONSE}</code>
      </pre>
      <ul className="ml-4 list-disc space-y-1 text-sm">
        <li>{t('taskLifecycleFailureRetryable')}</li>
        <li>{t('taskLifecycleFailureNonRetryable')}</li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">{t('taskLifecycleCancelSection')}</h2>
      <p className="text-sm">{t('taskLifecycleCancelBody')}</p>
    </article>
  );
}
