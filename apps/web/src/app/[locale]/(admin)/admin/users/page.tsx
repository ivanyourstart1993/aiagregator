import { Eye } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Link } from '@/i18n/navigation';
import { ApiError, serverApi, type AdminUserSummary } from '@/lib/server-api';

async function safeListUsers(): Promise<AdminUserSummary[]> {
  try {
    const res = await serverApi.adminListUsers();
    if (Array.isArray(res)) return res;
    return res.items ?? [];
  } catch (err) {
    if (err instanceof ApiError) return [];
    return [];
  }
}

export default async function AdminUsersPage() {
  const t = await getTranslations('admin');
  const tCommon = await getTranslations('common');
  const format = await getFormatter();
  const users = await safeListUsers();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('usersTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('usersDescription')}</p>
      </header>

      {users.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">
          {tCommon('loading')}
        </div>
      ) : (
        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12 text-right">{tCommon('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.email}</TableCell>
                  <TableCell className="text-muted-foreground">{u.name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'USER' ? 'outline' : 'default'}>{u.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        u.status === 'ACTIVE'
                          ? 'default'
                          : u.status === 'SUSPENDED'
                            ? 'secondary'
                            : 'destructive'
                      }
                    >
                      {u.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format.dateTime(new Date(u.createdAt), 'short')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/admin/users/${u.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
