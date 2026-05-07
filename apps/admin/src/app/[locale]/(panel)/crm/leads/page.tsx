import { ApiError, serverApi, type LeadsKanban } from '@/lib/server-api';
import { KanbanBoard } from '@/components/crm/KanbanBoard';
import { SearchInput } from '@/components/data-table/SearchInput';
import { FilterSelect } from '@/components/data-table/FilterSelect';

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

  // Fetch sources for the filter dropdown.
  let sourceOptions: { value: string; label: string }[] = [];
  try {
    const src = await serverApi.adminListLeadSources();
    sourceOptions = src.items.map((s) => ({ value: s.id, label: s.name }));
  } catch {
    /* ignore */
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Лиды</h1>
          <p className="text-sm text-muted-foreground">
            Перетаскивайте карточки между статусами. Клик — открыть карточку.
          </p>
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

      <KanbanBoard initial={kanban} />
    </div>
  );
}
