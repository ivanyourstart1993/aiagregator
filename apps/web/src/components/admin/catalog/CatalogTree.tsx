import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  MethodAdminView,
  ModelAdminView,
  ProviderAdminView,
} from '@/lib/server-api';

interface Props {
  providers: ProviderAdminView[];
  models?: ModelAdminView[];
  methods?: MethodAdminView[];
  selectedProviderId?: string;
  selectedModelId?: string;
}

export function CatalogTree({
  providers,
  models = [],
  methods = [],
  selectedProviderId,
  selectedModelId,
}: Props) {
  const t = useTranslations('admin.catalog');
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Column
        title={t('providers')}
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/catalog/providers/new">{t('newProvider')}</Link>
          </Button>
        }
      >
        {providers.length === 0 ? (
          <Empty label={t('noProviders')} />
        ) : (
          providers.map((p) => (
            <RowLink
              key={p.id}
              href={`/admin/catalog?providerId=${p.id}`}
              active={p.id === selectedProviderId}
              title={p.publicName}
              subtitle={p.code}
              status={p.status}
            />
          ))
        )}
      </Column>

      <Column
        title={t('models')}
        action={
          selectedProviderId ? (
            <Button asChild size="sm" variant="outline">
              <Link
                href={`/admin/catalog/providers/${selectedProviderId}/models/new`}
              >
                {t('newModel')}
              </Link>
            </Button>
          ) : null
        }
      >
        {!selectedProviderId ? (
          <Empty label={t('selectProvider')} />
        ) : models.length === 0 ? (
          <Empty label={t('noModels')} />
        ) : (
          models.map((m) => (
            <RowLink
              key={m.id}
              href={`/admin/catalog?providerId=${selectedProviderId}&modelId=${m.id}`}
              active={m.id === selectedModelId}
              title={m.publicName}
              subtitle={m.code}
              status={m.status}
              editHref={`/admin/catalog/models/${m.id}`}
            />
          ))
        )}
      </Column>

      <Column
        title={t('methods')}
        action={
          selectedModelId ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/catalog/models/${selectedModelId}/methods/new`}>
                {t('newMethod')}
              </Link>
            </Button>
          ) : null
        }
      >
        {!selectedModelId ? (
          <Empty label={t('selectModel')} />
        ) : methods.length === 0 ? (
          <Empty label={t('noMethods')} />
        ) : (
          methods.map((mt) => (
            <RowLink
              key={mt.id}
              href={`/admin/catalog/methods/${mt.id}`}
              title={mt.publicName}
              subtitle={mt.code}
              status={mt.status}
            />
          ))
        )}
      </Column>
    </div>
  );
}

function Column({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-background">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-semibold">{title}</span>
        {action}
      </div>
      <div className="flex flex-col p-2">{children}</div>
    </div>
  );
}

function RowLink({
  href,
  active,
  title,
  subtitle,
  status,
  editHref,
}: {
  href: string;
  active?: boolean;
  title: string;
  subtitle: string;
  status: string;
  editHref?: string;
}) {
  return (
    <div
      className={
        'flex items-center justify-between rounded-md px-2 py-1.5 text-sm ' +
        (active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted')
      }
    >
      <Link href={href} className="flex-1 truncate">
        <div className="font-medium">{title}</div>
        <div className="font-mono text-xs text-muted-foreground">{subtitle}</div>
      </Link>
      <div className="flex items-center gap-2">
        <Badge variant={status === 'ACTIVE' ? 'default' : 'secondary'}>{status}</Badge>
        {editHref ? (
          <Link href={editHref} className="text-xs underline">
            edit
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="px-2 py-3 text-xs text-muted-foreground">{label}</div>;
}
