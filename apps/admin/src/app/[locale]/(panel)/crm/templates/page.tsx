import { ApiError, serverApi, type OutreachTemplateView } from '@/lib/server-api';
import { TemplateForm } from '@/components/crm/TemplateForm';
import { TemplateRowActions } from '@/components/crm/TemplateRowActions';

export default async function CrmTemplatesPage() {
  let items: OutreachTemplateView[] = [];
  try {
    const r = await serverApi.adminListOutreachTemplates();
    items = r.items;
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Шаблоны сообщений
        </h1>
        <p className="text-sm text-muted-foreground">
          First-touch DM, follow-ups, system prompt для Claude. Переменные
          типа{' '}
          <code className="rounded bg-muted px-1 text-xs">{'{{name}}'}</code>{' '}
          подставляются на лету при отправке.
        </p>
      </header>

      <section className="rounded-md border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Slug</th>
                <th className="px-4 py-2 text-left">Название</th>
                <th className="px-4 py-2 text-left">Типы</th>
                <th className="px-4 py-2 text-left">Статус</th>
                <th className="px-4 py-2 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    Шаблонов нет — создайте первый ниже.
                  </td>
                </tr>
              ) : (
                items.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-mono text-xs">{t.slug}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{t.name}</div>
                      {t.description ? (
                        <div className="text-xs text-muted-foreground">
                          {t.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {t.targetTypes.length === 0
                        ? 'все'
                        : t.targetTypes.join(', ')}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {t.enabled ? (
                        <span className="text-emerald-600">enabled</span>
                      ) : (
                        <span className="text-muted-foreground">disabled</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <TemplateRowActions id={t.id} enabled={t.enabled} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Новый шаблон</h2>
        <TemplateForm />
      </section>
    </div>
  );
}
