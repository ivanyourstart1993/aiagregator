import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type LeadsKanban } from '@/lib/server-api';
import { KanbanBoard } from '@/components/crm/KanbanBoard';
import { CreateLeadDialog } from '@/components/crm/CreateLeadDialog';
import { QuickRunSource } from '@/components/crm/QuickRunSource';
import { SearchInput } from '@/components/data-table/SearchInput';
import { FilterSelect } from '@/components/data-table/FilterSelect';
import { Button } from '@/components/ui/button';

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

const TYPE_OPTIONS = [
  { value: 'TELEGRAM_CHANNEL', label: 'TG канал' },
  { value: 'MOBILE_APP_IOS', label: 'iOS app' },
  { value: 'MOBILE_APP_ANDROID', label: 'Android app' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'OTHER', label: 'Other' },
];

const EMPTY_KANBAN: LeadsKanban = { columns: [] };

export default async function CrmLeadsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters = {
    q: sp.q || undefined,
    type: (sp.type as never) || undefined,
    sourceId: sp.sourceId || undefined,
    limitPerColumn: 20,
  };

  let kanban: LeadsKanban = EMPTY_KANBAN;
  try {
    kanban = await serverApi.adminGetLeadKanban(filters);
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
  }

  // Fetch sources for the filter dropdown + quick-run buttons.
  let sourceOptions: { value: string; label: string }[] = [];
  let runnableSources: { id: string; name: string; kind: string }[] = [];
  try {
    const src = await serverApi.adminListLeadSources();
    sourceOptions = src.items.map((s) => ({ value: s.id, label: s.name }));
    runnableSources = src.items
      .filter((s) => s.enabled)
      .map((s) => ({ id: s.id, name: s.name, kind: s.kind }));
  } catch {
    /* ignore */
  }

  const totalLeads = kanban.columns.reduce((acc, c) => acc + c.total, 0);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Лиды</h1>
          <p className="text-sm text-muted-foreground">
            Перетаскивайте карточки между статусами. Клик — открыть карточку.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/crm/sources">⚙ Источники</Link>
          </Button>
          <CreateLeadDialog />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Поиск по имени, @username, email…" />
        <FilterSelect
          paramKey="type"
          options={TYPE_OPTIONS}
          allLabel="Все типы"
          placeholder="Все типы"
        />
        {sourceOptions.length > 0 ? (
          <FilterSelect
            paramKey="sourceId"
            options={sourceOptions}
            allLabel="Все источники"
            placeholder="Все источники"
          />
        ) : null}
      </div>

      {totalLeads === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-card/50 p-5">
          <h2 className="text-sm font-semibold">Пока нет лидов</h2>
          <p className="mb-3 mt-1 text-sm text-muted-foreground">
            Запустите discovery из существующих источников или добавьте лид
            вручную через кнопку справа сверху.
          </p>
          {runnableSources.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {runnableSources.map((s) => (
                <QuickRunSource key={s.id} id={s.id} label={s.name} kind={s.kind} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Источников ещё нет.{' '}
              <Link href="/crm/sources" className="underline hover:text-foreground">
                Создать первый →
              </Link>
            </p>
          )}
        </div>
      ) : null}

      <KanbanBoard initial={kanban} />
    </div>
  );
}
