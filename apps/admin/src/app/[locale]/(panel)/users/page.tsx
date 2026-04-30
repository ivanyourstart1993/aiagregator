import { ApiError, serverApi, type AdminUserSummary } from '@/lib/server-api';

async function loadUsers(): Promise<AdminUserSummary[]> {
  try {
    const r = await serverApi.adminListUsers();
    return Array.isArray(r) ? r : (r as { items?: AdminUserSummary[] }).items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

export default async function UsersPage() {
  const users = await loadUsers();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Пользователи</h1>
        <p className="text-sm text-muted-foreground">Всего: {users.length}</p>
      </header>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
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
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-muted/20">
                <td className="px-4 py-3 font-mono text-xs">{u.email}</td>
                <td className="px-4 py-3">{u.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      u.role === 'SUPER_ADMIN'
                        ? 'rounded bg-primary/15 px-2 py-0.5 text-xs text-primary'
                        : u.role === 'ADMIN'
                          ? 'rounded bg-blue-500/15 px-2 py-0.5 text-xs text-blue-500'
                          : 'rounded bg-muted px-2 py-0.5 text-xs'
                    }
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">{u.status}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(u.createdAt)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(u.lastLoginAt)}</td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Ничего не найдено
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
