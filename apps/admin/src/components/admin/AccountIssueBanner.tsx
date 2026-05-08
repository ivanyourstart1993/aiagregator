import { AlertTriangle, ArrowUpRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  status: string;
  providerCode?: string | null;
  lastErrorMessage?: string | null;
  lastErrorAt?: string | null;
  cooldownUntil?: string | null;
}

interface Diagnosis {
  title: string;
  description: string;
  steps: string[];
  link?: { href: string; label: string };
}

// Best-effort heuristic: pull a Google project_id out of error text.
// Google's error messages typically include something like
// "project foo-bar-123" or "project foo-bar-123 before".
function extractProjectId(text: string): string | null {
  const m = text.match(/project\s+([a-z][a-z0-9-]{4,29})/i);
  return m ? m[1]! : null;
}

function diagnose(
  rawMessage: string,
  providerCode?: string | null,
): Diagnosis {
  const msg = rawMessage.toLowerCase();
  const projectId = extractProjectId(rawMessage) ?? '';
  const project = projectId || 'YOUR_PROJECT_ID';
  const projectQuery = projectId ? `?project=${projectId}` : '';
  const isGoogle = providerCode === 'google_banana' || providerCode === 'google_veo';

  // 1. Vertex AI API not enabled
  if (
    msg.includes('agent platform api has not been used') ||
    msg.includes('aiplatform.googleapis.com') ||
    (msg.includes('api') && msg.includes('not enabled'))
  ) {
    return {
      title: 'Vertex AI API не включён',
      description: `В проекте ${project} не активирован API aiplatform.googleapis.com — без него Vertex просто недоступен.`,
      steps: [
        'Перейди по ссылке ниже под аккаунтом-владельцем проекта',
        'Нажми Enable',
        'Подожди 2–3 минуты на пропагацию',
        'Балансировщик автоматически попробует на следующем запросе',
      ],
      link: {
        href: `https://console.developers.google.com/apis/api/aiplatform.googleapis.com/overview${projectQuery}`,
        label: 'Включить Vertex AI API',
      },
    };
  }

  // 2. Billing disabled
  if (
    msg.includes('billing has not been enabled') ||
    msg.includes('billing_disabled') ||
    msg.includes('billing account') ||
    msg.includes('billing is not enabled')
  ) {
    return {
      title: 'Биллинг GCP не привязан',
      description: `Vertex AI требует активный billing account на проекте ${project}. Без карты — даже free tier не работает.`,
      steps: [
        'Перейди в раздел Billing проекта',
        'Привяжи действующую карту (доменную или личную)',
        'Подожди 1–2 минуты',
        'Снова жми Save на этом аккаунте, чтобы триггернуть проверку',
      ],
      link: {
        href: `https://console.cloud.google.com/billing/linkedaccount${projectQuery}`,
        label: 'Привязать биллинг',
      },
    };
  }

  // 3. Permission denied / IAM
  if (
    msg.includes('permission denied') ||
    msg.includes('permission_denied') ||
    msg.includes('does not have permission') ||
    msg.includes('caller does not have')
  ) {
    return {
      title: 'У Service Account не хватает прав',
      description: `SA не может вызывать Vertex AI в проекте ${project}. Нужна роль Vertex AI User (roles/aiplatform.user) или выше.`,
      steps: [
        'Открой IAM проекта',
        'Найди свой service account (формат aiagg-banana@...iam.gserviceaccount.com)',
        'Нажми «Edit principal»',
        'Добавь роль «Vertex AI User»',
        'Save и подожди ~1 мин',
      ],
      link: {
        href: `https://console.cloud.google.com/iam-admin/iam${projectQuery}`,
        label: 'Открыть IAM',
      },
    };
  }

  // 4. Quota / rate-limit
  if (
    msg.includes('resource has been exhausted') ||
    msg.includes('rate_limited') ||
    msg.includes('quota') ||
    msg.includes('rate-limited') ||
    msg.includes('too many requests')
  ) {
    return {
      title: 'Превышена квота Google',
      description: `Vertex для этого проекта попал под rate-limit. Это нормально, балансировщик перепробует через несколько минут (cooldown).`,
      steps: [
        'Если повторяется регулярно — поднимай квоту в GCP',
        'Альтернативно: добавь параллельных аккаунтов на других GCP-проектах',
        'Warmup-ramp у нас 7 дней — лимит будет расти автоматически',
      ],
      link: isGoogle
        ? {
            href: `https://console.cloud.google.com/iam-admin/quotas${projectQuery}`,
            label: 'Открыть квоты GCP',
          }
        : undefined,
    };
  }

  // 5. Invalid credentials / SA missing
  if (
    msg.includes('missing apikey') ||
    msg.includes('missing serviceaccount') ||
    msg.includes('invalid_credentials') ||
    msg.includes('invalid credentials') ||
    msg.includes('unauthenticated')
  ) {
    return {
      title: 'Невалидные credentials',
      description:
        'Содержимое поля Service Account JSON либо сломано, либо ключ был ротирован/удалён в GCP.',
      steps: [
        'Открой форму редактирования аккаунта (наверху)',
        'Сгенерируй новый JSON-ключ в Google Cloud Console (IAM → Service Accounts → Keys → Add key)',
        'Вставь содержимое скачанного файла как есть в поле Service Account JSON',
        'Сохрани',
      ],
    };
  }

  // 6. Storage full (infrastructure, not the account itself)
  if (
    msg.includes('storage backend has reached') ||
    msg.includes('minimum free drive')
  ) {
    return {
      title: 'MinIO хранилище переполнено',
      description:
        'Это инфраструктурная проблема — переполнен наш bucket, не вина этого аккаунта. Все провайдеры будут падать пока не освободить место.',
      steps: [
        'Запусти ручной cleanup: POST /internal/admin/files/run-cleanup (или подожди 03:00 — cron сам)',
        'Если повторяется — поднять размер volume в Northflank или уменьшить retention',
      ],
    };
  }

  // 7. Catch-all
  return {
    title: 'Ошибка от провайдера',
    description:
      'Не распознал стандартный паттерн. Посмотри полный текст ниже и Лог запросов в нижней части страницы.',
    steps: ['Сверь error message с документацией провайдера'],
  };
}

export function AccountIssueBanner({
  status,
  providerCode,
  lastErrorMessage,
  lastErrorAt,
  cooldownUntil,
}: Props) {
  if (!lastErrorMessage) return null;

  const blocking = ['INVALID_CREDENTIALS', 'EXCLUDED_BY_BILLING', 'COOLDOWN'].includes(
    status,
  );
  const tone: 'destructive' | 'warning' = blocking ? 'destructive' : 'warning';
  const Icon = tone === 'destructive' ? AlertTriangle : Info;
  const dx = diagnose(lastErrorMessage, providerCode);

  let cooldownNote: string | null = null;
  if (status === 'COOLDOWN' && cooldownUntil) {
    const ms = new Date(cooldownUntil).getTime() - Date.now();
    if (ms > 0) {
      const min = Math.ceil(ms / 60_000);
      cooldownNote = `Cooldown ещё ${min} мин — балансировщик пропускает аккаунт до ${new Date(cooldownUntil).toLocaleTimeString()}.`;
    } else {
      cooldownNote = 'Cooldown уже истёк — аккаунт лениво вернётся в ACTIVE при следующем выборе.';
    }
  }

  return (
    <section
      className={cn(
        'space-y-3 rounded-lg border p-4',
        tone === 'destructive'
          ? 'border-destructive/40 bg-destructive/5'
          : 'border-yellow-500/40 bg-yellow-500/5',
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={cn(
            'mt-0.5 h-5 w-5 shrink-0',
            tone === 'destructive' ? 'text-destructive' : 'text-yellow-500',
          )}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3
              className={cn(
                'text-sm font-semibold',
                tone === 'destructive' ? 'text-destructive' : 'text-yellow-500',
              )}
            >
              {dx.title}
            </h3>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              status: {status}
              {lastErrorAt
                ? ` · ${new Date(lastErrorAt).toLocaleString()}`
                : ''}
            </span>
          </div>
          <p className="text-sm text-foreground/80">{dx.description}</p>
          {cooldownNote ? (
            <p className="text-xs text-muted-foreground">{cooldownNote}</p>
          ) : null}
        </div>
      </div>

      {dx.steps.length > 0 ? (
        <ol className="ml-8 list-decimal space-y-1 text-sm text-foreground/80">
          {dx.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pl-8">
        {dx.link ? (
          <a
            href={dx.link.href}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
              tone === 'destructive'
                ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20'
                : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20',
            )}
          >
            {dx.link.label}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>

      <details className="ml-8 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground">
          Полный текст ошибки от провайдера
        </summary>
        <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 font-mono text-[11px]">
          {lastErrorMessage}
        </pre>
      </details>
    </section>
  );
}
