import { ApiError, serverApi, type AdminUserSummary } from '@/lib/server-api';
import { SearchInput } from '@/components/data-table/SearchInput';
import { Pagination } from '@/components/data-table/Pagination';
import { FilterSelect } from '@/components/data-table/FilterSelect';

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

const PAGE_SIZE = 50;

const ROLE_OPTIONS = [
  { value: 'USER', label: 'USER' },
  { value: 'ADMIN', label: 'ADMIN' },
  { value: 'SUPER_ADMIN', label: 'SUPER_ADMIN' },
];

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'ACTIVE' },
  { value: 'SUSPENDED', label: 'SUSPENDED' },
  { value: 'DELETED', label: 'DELETED' },
];

function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

function roleClass(r: string): string {
  if (r === 'SUPER_ADMIN')
    return 'rounded bg-primary/15 px-2 py-0.5 text-xs text-primary';
  if (r === 'ADMIN')
    return 'rounded bg-blue-500/15 px-2 py-0.5 text-xs text-blue-500';
  return 'rounded bg-muted px-2 py-0.5 text-xs';
}

export default async function UsersPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const filters = {
    page,
    pageSize: PAGE_SIZE,
    q: sp.q || undefined,
    role: sp.role || undefined,
    status: sp.status || undefined,
  };

  let items: AdminUserSummary[] = [];
  let total = 0;
  try {
    const r = await serverApi.adminListUsers(filters);
    if (Array.isArray(r)) {
      items = r;
      total = r.length;
    } else {
      items = r.items ?? [];
      total = r.total ?? items.length;
    }
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Пользователи</h1>
        <p className="text-sm text-muted-foreground">
          Зарегистрированные пользователи системы
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput placeholder="Поиск по email или имени…" />
        <FilterSelect
          paramKey="role"
          options={ROLE_OPTIONS}
          allLabel="Все роли"
          placeholder="Все роли"
        />
        <FilterSelect
          paramKey="status"
          options={STATUS_OPTIONS}
          allLabel="Все статусы"
          placeholder="Все статусы"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Имя</th>
                <th className="px-4 py-3 text-left">Роль</th>
                <th className="px-4 py-3 text-left">Статус</th>
                <th className="px-4 py-3 text-left">Создан</th>
                <th className="px-4 py-3 text-left">Last login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((u) => (
                <tr key={u.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-xs">{u.email}</td>
                  <td className="px-4 py-3">{u.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={roleClass(u.role)}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">{u.status}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {fmt(u.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {fmt(u.lastLoginAt)}
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    Ничего не найдено
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border p-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
        </div>
      </div>
    </div>
  );
}
